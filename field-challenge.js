// A short, browser-local learning activity. Answers use the loaded scope's data;
// conceptual questions take over when comparable annual measurements are absent.
const cleanups = new WeakMap();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(className, text, handler) {
  const button = element('button', className, text);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function makeQuestions(scope, data) {
  const seenYears = new Set();
  const annual = data.annualSeries(scope?.series, 'fire_count')
    .filter((point) => {
      if (!Number.isInteger(point.year) || !Number.isFinite(point.value) || point.value < 0 || seenYears.has(point.year)) return false;
      seenYears.add(point.year);
      return true;
    })
    .sort((a, b) => a.value - b.value || a.year - b.year);
  // Different counts make the answer unambiguous, including datasets with ties.
  const distinct = annual.filter((point, index) => index === 0 || point.value !== annual[index - 1].value);
  const hasDataQuestion = distinct.length >= 3;
  let first;

  if (hasDataQuestion) {
    const picks = [distinct[0], distinct[Math.floor((distinct.length - 1) / 2)], distinct[distinct.length - 1]];
    const best = picks[2];
    // Put the choices in chronological order so the display doesn't reveal the rank.
    picks.sort((a, b) => a.year - b.year);
    const name = scope.meta?.name || 'this selection';
    first = {
      prompt: 'Which of these years had the most fire detections?',
      context: `Make a prediction for ${name}, then check it against the loaded annual record.`,
      options: picks.map((point) => ({ label: String(point.year), correct: point.year === best.year })),
      explanation: `${best.year} has the highest count of these three years: ${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(best.value)} detections. ${picks.map((point) => `${point.year}: ${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(point.value)}`).join(' · ')}. These are satellite detections, not counts of individual fires.`,
      jumpYear: best.year,
      source: 'Data question · loaded fire-detection series',
    };
  } else {
    first = {
      prompt: 'A satellite records a fire detection. What does that mean?',
      context: 'Concept question — this selection does not have three distinct annual counts to compare.',
      options: [
        { label: 'It detected a hot spot during an observation', correct: true },
        { label: 'Exactly one new wildfire started', correct: false },
        { label: 'One hectare of forest burned', correct: false },
      ],
      explanation: 'A detection is a satellite observation of a hot spot. A large or long-lived fire can be detected more than once. Detection counts do not directly measure the number of separate wildfires or the area burned.',
      source: 'Concept question · satellite observations',
    };
  }

  const second = hasDataQuestion ? {
    prompt: 'More detections means more separate wildfires. Always?',
    context: 'Think about what a satellite observes, rather than what we might assume from the number.',
    options: [
      { label: 'Yes, one detection always equals one fire', correct: false },
      { label: 'No, the same fire can be detected repeatedly', correct: true },
      { label: 'Yes, if we compare whole countries', correct: false },
    ],
    explanation: 'The same fire may be observed on multiple passes or across several pixels. Sensor coverage and observation conditions also affect counts. Compare the same metric carefully; a detection is not an individual wildfire.',
    source: 'Concept question · reading the measurements',
  } : {
    prompt: 'The water chart has no measurement for a year. What should we conclude?',
    context: 'Missing measurements are part of the investigation, too.',
    options: [
      { label: 'The water was completely clear', correct: false },
      { label: 'The measurement was zero', correct: false },
      { label: 'We do not have enough information for that year', correct: true },
    ],
    explanation: 'Missing data is not zero. Without a measurement, the chart cannot tell us the water condition for that year. Look at the available years and the case-study basin before drawing a conclusion.',
    source: 'Concept question · missing evidence',
  };

  return [first, second, {
    prompt: 'Fire activity and salmon values move together. Is that proof of cause?',
    context: 'This is the most important question in the investigation.',
    options: [
      { label: 'Yes, a correlation proves the whole chain', correct: false },
      { label: 'No, other factors could affect both', correct: true },
      { label: 'Yes, as long as both lines are on the same chart', correct: false },
    ],
    explanation: 'An association is a clue, not proof of cause. Weather, ocean conditions, fishing rules, and other factors can matter. Explore the water measurements, timing, and uncertainty before making a claim about the chain.',
    source: 'Concept question · association is not causation',
  }];
}

export async function mount(el, ctx) {
  if (cleanups.has(el)) cleanups.get(el)();
  const { store, data } = ctx;
  let loadToken = 0;
  let alive = true;
  let questions = [];
  let questionIndex = 0;
  let score = 0;
  let answered = false;
  let scopeName = '';

  const root = element('div', 'quest-root');
  root.setAttribute('aria-labelledby', 'quest-title');
  const heading = element('div', 'quest-heading');
  heading.append(element('p', 'quest-kicker', 'A three-minute field challenge'));
  const title = element('h2', '', 'Follow the evidence.');
  title.id = 'quest-title';
  heading.append(title, element('p', 'quest-intro', 'A good hunch is a start. A better question takes you further. Try three quick questions about the story in the data.'));
  const panel = element('div', 'quest-panel');
  root.append(heading, panel);
  el.replaceChildren(root);

  function renderComplete() {
    const complete = element('div', 'quest-complete');
    const badge = element('span', 'quest-badge', 'Evidence explorer');
    const result = element('h3', 'quest-result', `${score} of ${questions.length} — investigation complete.`);
    result.tabIndex = -1;
    complete.append(badge, result, element('p', '', 'The takeaway: follow the measurements, ask what is missing, and treat a correlation as a question worth exploring.'));
    complete.append(action('quest-replay', 'Try the challenge again ↻', () => {
      questionIndex = 0;
      score = 0;
      answered = false;
      renderQuestion(true);
    }));
    panel.replaceChildren(complete);
    result.focus({ preventScroll: true });
  }

  function renderQuestion(moveFocus = false) {
    const question = questions[questionIndex];
    if (!question) return;
    answered = false;
    const status = element('div', 'quest-status');
    const step = element('span', 'quest-step', `Question ${questionIndex + 1} / ${questions.length}`);
    const progress = element('div', 'quest-progress');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Questions completed');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', String(questions.length));
    progress.setAttribute('aria-valuenow', String(questionIndex));
    const fill = element('span', 'quest-progress-fill');
    fill.style.width = `${questionIndex / questions.length * 100}%`;
    progress.append(fill);
    const scoreEl = element('span', 'quest-score', `${score} correct`);
    status.append(step, progress, scoreEl);

    const scope = element('p', 'quest-scope', `${scopeName} · ${question.source}`);
    const prompt = element('h3', 'quest-question', question.prompt);
    prompt.id = 'quest-question';
    prompt.tabIndex = -1;
    const context = element('p', 'quest-context', question.context);
    const options = element('div', 'quest-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-labelledby', prompt.id);
    const feedback = element('div', 'quest-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    const actions = element('div', 'quest-actions');

    const buttons = question.options.map((option, index) => {
      const button = action('quest-option', option.label, () => {
        if (answered) return;
        answered = true;
        if (option.correct) score += 1;
        scoreEl.textContent = `${score} correct`;
        progress.setAttribute('aria-valuenow', String(questionIndex + 1));
        fill.style.width = `${(questionIndex + 1) / questions.length * 100}%`;
        buttons.forEach((choice, choiceIndex) => {
          choice.disabled = true;
          choice.setAttribute('aria-pressed', String(choiceIndex === index));
          if (question.options[choiceIndex].correct) choice.dataset.result = 'correct';
          else if (choiceIndex === index) choice.dataset.result = 'wrong';
        });
        feedback.append(element('strong', 'quest-feedback-title', option.correct ? 'You followed the evidence.' : 'A useful thing to question.'));
        feedback.append(element('p', '', question.explanation));
        if (Number.isInteger(question.jumpYear)) {
          feedback.append(action('quest-jump', `Explore ${question.jumpYear} on the map ↗`, () => {
            store.set({ year: question.jumpYear, focus: 'fire_count', playing: false });
            document.getElementById('map')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
          }));
        }
        actions.append(action('quest-next', questionIndex === questions.length - 1 ? 'See my field notes →' : 'Next question →', () => {
          questionIndex += 1;
          if (questionIndex >= questions.length) renderComplete();
          else renderQuestion(true);
        }));
      });
      button.setAttribute('aria-pressed', 'false');
      return button;
    });
    options.append(...buttons);
    panel.replaceChildren(status, scope, prompt, context, options, feedback, actions);
    if (moveFocus) prompt.focus({ preventScroll: true });
  }

  async function build(state) {
    const myToken = ++loadToken;
    panel.setAttribute('aria-busy', 'true');
    panel.replaceChildren(element('p', 'quest-context', 'Opening the field notebook…'));
    let scope = null;
    try {
      scope = await data.getScope(state);
    } catch (error) {
      console.info('field challenge: using concept questions because scope data is unavailable', error);
    }
    if (!alive || myToken !== loadToken) return;
    scopeName = scope?.meta?.name || 'Field notebook';
    questions = makeQuestions(scope, data);
    questionIndex = 0;
    score = 0;
    panel.removeAttribute('aria-busy');
    renderQuestion();
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.countryId !== previous.countryId || state.view !== previous.view) build(state);
  });
  const cleanup = () => {
    alive = false;
    loadToken += 1;
    unsubscribe();
  };
  cleanups.set(el, cleanup);
  await build(store.get());
  return cleanup;
}

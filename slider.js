// js/ui/slider.js
// Purpose: the year slider across the top (#year-slider): play/pause, current year, native range input
//          with year labels and fire-year markers from the current scope's meta.eventYears.

const STYLE = `
.sld-root { display: flex; align-items: center; gap: 16px; }
.sld-play {
  flex: 0 0 34px; width: 34px; height: 34px; padding: 0; border-radius: 50%;
  border: 1px solid var(--c-rule); background: var(--c-paper); color: var(--c-ink);
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  transition:
    background-color 160ms var(--ease-out),
    border-color 160ms var(--ease-out),
    box-shadow 160ms var(--ease-out),
    transform 120ms var(--ease-spring);
}
.sld-play:hover { background: var(--c-panel); border-color: var(--c-edge-hover); transform: scale(1.06); }
.sld-play:active { transform: scale(0.93); transition-duration: 60ms; }
.sld-play[aria-pressed="true"] { border-color: var(--c-link); color: var(--c-link); }
.sld-play svg { width: 14px; height: 14px; fill: currentColor; }
.sld-year {
  font-family: var(--f-mono); font-size: 22px; font-weight: 700; line-height: 1; color: var(--c-ink);
  min-width: 4ch; font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.sld-track { position: relative; flex: 1 1 auto; min-width: 0; height: 48px; }
.sld-rail, .sld-fill { position: absolute; top: 13px; height: 6px; border-radius: 3px; pointer-events: none; }
.sld-rail { left: 8px; right: 8px; background: var(--c-edge); }
.sld-fill {
  left: 8px; width: 0; background: var(--c-link);
  transition: width 220ms var(--ease-out);
}
.sld-input {
  position: absolute; left: 0; top: 0; width: 100%; height: 32px; margin: 0; background: transparent;
  -webkit-appearance: none; appearance: none; cursor: pointer;
}
.sld-input::-webkit-slider-runnable-track { height: 6px; background: transparent; border: 0; }
.sld-input::-moz-range-track { height: 6px; background: transparent; border: 0; }
.sld-input::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -5px;
  border-radius: 50%; background: var(--c-paper); border: 2.5px solid var(--c-year);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
  transition: transform 150ms var(--ease-spring), box-shadow 150ms var(--ease-out);
}
.sld-input:hover::-webkit-slider-thumb { transform: scale(1.18); box-shadow: 0 2px 7px rgba(15, 23, 42, 0.24); }
.sld-input:active::-webkit-slider-thumb { transform: scale(0.96); }
.sld-input::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 50%; background: var(--c-paper); border: 2.5px solid var(--c-year);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
  transition: transform 150ms var(--ease-spring), box-shadow 150ms var(--ease-out);
}
.sld-input:hover::-moz-range-thumb { transform: scale(1.18); }
.sld-input:active::-moz-range-thumb { transform: scale(0.96); }
.sld-input:focus-visible { outline: none; }
.sld-input:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--c-link); outline-offset: 2px; }
.sld-input:focus-visible::-moz-range-thumb { outline: 2px solid var(--c-link); outline-offset: 2px; }
.sld-mark {
  position: absolute; top: 21px; transform: translateX(-50%); width: 0; height: 0; pointer-events: none;
  border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 7px solid var(--c-fire);
}
.sld-labels { position: absolute; left: 0; right: 0; top: 32px; height: 14px; }
.sld-label {
  position: absolute; transform: translateX(-50%); font-family: var(--f-mono); font-size: 11px; line-height: 1;
  color: var(--c-muted); white-space: nowrap; transition: color 160ms var(--ease-out), font-weight 160ms var(--ease-out);
}
.sld-label.is-selected { color: var(--c-ink); font-weight: 700; }
@media (max-width: 1080px) { .sld-label:nth-child(even) { display: none; } }
@media (max-width: 640px) {
  .sld-year { font-size: 18px; }
  .sld-root { gap: 10px; }
  .sld-label:nth-child(n) { display: none; }
  .sld-label:nth-child(6n+1) { display: block; }
}
`;

const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z"/></svg>';
const STEP_MS = 800;
const cleanups = new WeakMap();

function injectStyle() {
  if (document.querySelector('style[data-module="sld"]')) return;
  const style = document.createElement('style');
  style.dataset.module = 'sld';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const pos = (year, min, max) => `calc(8px + (100% - 16px) * ${max > min ? (year - min) / (max - min) : 0})`;

export async function mount(el, ctx) {
  injectStyle();
  if (cleanups.has(el)) cleanups.get(el)();
  const { store, data, theme } = ctx;
  const regions = await data.getRegions();
  if (!regions || !Array.isArray(regions.years)) {
    theme.placeholder(el);
    return;
  }
  const [min, max] = regions.years.map(Number);

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'sld-root';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'sld-play';
  const yearEl = document.createElement('div');
  yearEl.className = 'sld-year';
  yearEl.setAttribute('aria-live', 'polite');
  const track = document.createElement('div');
  track.className = 'sld-track';
  const rail = document.createElement('div');
  rail.className = 'sld-rail';
  const fill = document.createElement('div');
  fill.className = 'sld-fill';
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'sld-input';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.setAttribute('aria-label', 'Year');
  const marks = document.createElement('div');
  const labels = document.createElement('div');
  labels.className = 'sld-labels';
  const labelEls = new Map();
  for (let y = min; y <= max; y += 1) {
    const l = document.createElement('span');
    l.className = 'sld-label';
    l.textContent = String(y);
    l.style.left = pos(y, min, max);
    labels.appendChild(l);
    labelEls.set(y, l);
  }
  track.append(rail, fill, input, marks, labels);
  root.append(play, yearEl, track);
  el.appendChild(root);
  const events = document.createElement('div');
  events.className = 'sld-events';
  events.setAttribute('role', 'group');
  events.setAttribute('aria-label', 'Jump to a major fire year');
  el.appendChild(events);

  let timer = null;
  function clearTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  function stop() {
    clearTimer();
    if (store.get().playing) store.set({ playing: false });
  }
  function tick() {
    const s = store.get();
    if (s.year >= max) {
      stop();
      return;
    }
    store.set({ year: s.year + 1 });
  }
  function start() {
    const s = store.get();
    store.set({ year: s.year >= max ? min : s.year, playing: true });
    clearTimer();
    timer = setInterval(tick, STEP_MS);
  }
  play.addEventListener('click', () => (store.get().playing ? stop() : start()));
  input.addEventListener('input', () => {
    if (store.get().playing) stop();
    store.set({ year: Number(input.value) });
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ' && ev.code !== 'Space') return;
    if (document.activeElement !== input && document.activeElement !== play) return;
    ev.preventDefault();
    if (store.get().playing) stop();
    else start();
  });

  let markerToken = 0;
  async function drawMarkers(state) {
    const my = ++markerToken;
    const scope = await data.getScope(state);
    if (my !== markerToken) return;
    marks.innerHTML = '';
    events.replaceChildren();
    const years = scope && scope.meta && Array.isArray(scope.meta.eventYears) ? scope.meta.eventYears : [];
    if (years.length) {
      const label = document.createElement('span');
      label.textContent = 'Investigate a fire year:';
      events.appendChild(label);
    }
    for (const y of years) {
      if (y < min || y > max) continue;
      const m = document.createElement('span');
      m.textContent = '▴';
      m.setAttribute('aria-hidden', 'true');
      const eventButton = document.createElement('button');
      eventButton.type = 'button';
      eventButton.className = 'sld-event-year';
      eventButton.textContent = String(y);
      eventButton.setAttribute('aria-label', `Explore major fire year ${y}`);
      eventButton.addEventListener('click', () => store.set({ year: y, playing: false }));
      events.appendChild(eventButton);
      m.className = 'sld-mark';
      m.title = `Major fire year ${y}`;
      m.style.left = pos(y, min, max);
      marks.appendChild(m);
    }
  }

  let lastYear = null;
  let lastPlaying = null;

  function render(state) {
    const year = Math.min(max, Math.max(min, Number(state.year) || min));
    const playing = !!state.playing;
    if (year !== lastYear || playing !== lastPlaying) {
      input.setAttribute('aria-valuetext', `${year}${playing ? ', playing' : ''}`);
    }
    if (year !== lastYear) {
      input.value = String(year);
      yearEl.textContent = String(year);
      const pct = max > min ? (year - min) / (max - min) : 0;
      fill.style.width = `calc((100% - 16px) * ${pct})`;
      if (lastYear !== null && labelEls.has(lastYear)) labelEls.get(lastYear).classList.remove('is-selected');
      if (labelEls.has(year)) labelEls.get(year).classList.add('is-selected');
      lastYear = year;
    }
    if (playing !== lastPlaying) {
      play.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
      play.setAttribute('aria-label', playing ? 'Pause' : 'Play through the years');
      play.setAttribute('aria-pressed', String(playing));
      lastPlaying = playing;
    }
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) {
      stop();
      drawMarkers(state);
    }
    if (!state.playing && timer) clearTimer();
    render(store.get());
  });
  cleanups.set(el, () => {
    clearTimer();
    unsubscribe();
  });
  render(store.get());
  drawMarkers(store.get());
}

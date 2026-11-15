// js/charts/fig3-chain.js
// Purpose: Fig. 3 (#fig3) — hand-built SVG chain Fire -> Air -> Water -> Fish with the selected year's values.
//          Optimized to build SVG geometry once per scope and patch node values/focus in-place.

const STYLE = `
.f3-root { padding: 10px 12px 8px; }
.f3-title { font-family: var(--f-serif); font-size: 16px; font-weight: 700; margin: 0 0 4px; color: var(--c-ink); }
.f3-svg { display: block; width: 100%; height: auto; font-family: var(--f-sans); animation: emberFadeIn 190ms var(--ease-out); }
.f3-node { cursor: pointer; transform-box: fill-box; transform-origin: center; transition: transform 170ms var(--ease-spring), opacity 160ms var(--ease-out); }
.f3-node:hover { transform: scale(1.045); }
.f3-node:active { transform: scale(0.95); transition-duration: 60ms; }
.f3-node circle { fill: var(--c-paper); stroke-width: 2.5; transition: stroke-width 160ms var(--ease-out), fill 160ms var(--ease-out); }
.f3-node.is-focus circle { stroke-width: 4; fill: var(--c-panel); }
.f3-node.is-missing circle { stroke-dasharray: 4 3; }
.f3-name { font-size: 13px; font-weight: 700; fill: var(--c-ink); text-anchor: middle; }
.f3-value { font-family: var(--f-mono); font-size: 12.5px; font-weight: 600; fill: var(--c-ink); text-anchor: middle; }
.f3-unit { font-size: 10px; fill: var(--c-muted); text-anchor: middle; }
.f3-arrow { fill: none; stroke-width: 2; }
.f3-label { font-family: var(--f-mono); font-size: 10.5px; fill: var(--c-muted); text-anchor: middle; }
.f3-link { font-size: 11px; font-weight: 600; fill: var(--c-link); text-anchor: middle; cursor: pointer; }
.f3-text { font-size: 13.5px; line-height: 1.55; margin: 8px 0 0; color: var(--c-ink); }
.f3-text strong { font-weight: 600; color: var(--c-ink); }
.f3-cap { font-size: 12.5px; font-style: italic; color: var(--c-muted); margin: 5px 0 0; }
`;
const NS = 'http://www.w3.org/2000/svg';
const NODES = ['fire', 'air', 'water', 'fish'];

function injectStyle() {
  if (document.querySelector('style[data-module="f3"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'f3';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

const linkLabel = (l, theme) => (l.rho === null
  ? ['ρ = —', 'too few pairs']
  : [`ρ = ${l.rho.toFixed(2)}`, `lag ${l.lag} ${l.lag_unit === 'month' ? 'mo' : 'yr'} · p_adj ${theme.fmtP(l.p_adj).replace('p ', '')}`]);

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sentenceHtml(meta, links, vars, theme) {
  const strength = (r) => (Math.abs(r) >= 0.5 ? 'strongly' : Math.abs(r) >= 0.3 ? 'moderately' : 'weakly');
  const parts = [];
  for (const l of links) {
    const from = escHtml(vars[l.from] ? vars[l.from].label.toLowerCase() : l.from);
    const to = escHtml(vars[l.to] ? vars[l.to].label.toLowerCase() : l.to);
    if (l.rho === null) {
      parts.push(`<strong>${from}</strong> and <strong>${to}</strong> have too few overlapping values to test`);
    } else if (l.p_adj !== null && l.p_adj < 0.05) {
      const lag = l.lag ? ` ${l.lag} ${l.lag_unit}${l.lag > 1 ? 's' : ''} later` : l.lag_unit === 'month' ? ' in the same month' : ' in the same year';
      const dir = l.rho > 0 ? 'higher' : 'lower';
      parts.push(`higher <strong>${from}</strong> is <strong>${strength(l.rho)} associated</strong> with ${dir} <strong>${to}</strong>${lag} (<strong>ρ = ${l.rho.toFixed(2)}</strong>, ${escHtml(theme.fmtP(l.p_adj).replace('p', 'adjusted p'))})`);
    } else {
      parts.push(`<strong>${from}</strong> is not clearly associated with <strong>${to}</strong> (ρ = ${l.rho.toFixed(2)}, ${escHtml(theme.fmtP(l.p_adj).replace('p', 'adjusted p'))})`);
    }
  }
  const [y0, y1] = meta.years || [2012, 2025];
  return `<strong>In ${escHtml(meta.name)} (${y0}–${y1}):</strong> ${parts.join('; ')}. <strong>Association is not causation.</strong>`;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, VARS } = theme;
  const TOKEN = { fire: COLORS.fire, air: COLORS.smoke, water: COLORS.water, fish: COLORS.fish };
  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f3-root';
  const title = document.createElement('h3');
  title.className = 'f3-title';
  title.textContent = 'Fig. 3 — The chain';
  const svg = svgEl('svg', { class: 'f3-svg', viewBox: '0 0 720 252', role: 'img', 'aria-label': 'Fire to air to water to fish chain with Spearman correlations' });
  const text = document.createElement('p');
  text.className = 'f3-text';
  const cap = document.createElement('p');
  cap.className = 'f3-cap';
  root.append(title, svg, text, cap);
  el.appendChild(root);

  let current = null;
  let token = 0;
  let nodeRefs = [];

  function drawStructure(scope, state) {
    const { meta, stats } = scope;
    const basin = meta.kind === 'basin';
    const varOf = { fire: 'fire_frp', air: 'aod', water: 'kd490', fish: meta.fishMetric };
    const links = stats && Array.isArray(stats.links) ? stats.links : [];
    const find = (a, b) => links.find((l) => l.from === a && l.to === b) || null;
    const chain = [find('fire_frp', 'aod'), find('aod', 'kd490'), find('kd490', meta.fishMetric)];
    const arc = find('fire_frp', meta.fishMetric);

    svg.innerHTML = '';
    nodeRefs = [];

    const defs = svgEl('defs');
    for (const g of NODES) {
      const m = svgEl('marker', { id: `f3-arrow-${g}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.appendChild(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: TOKEN[g] }));
      defs.appendChild(m);
    }
    const grey = svgEl('marker', { id: 'f3-arrow-grey', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    grey.appendChild(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: COLORS.rule }));
    defs.appendChild(grey);
    svg.appendChild(defs);

    const cx = [90, 270, 450, 630];
    const cy = 92;
    const R = 40;
    const drawArrow = (d, l, target, labelXY) => {
      const sig = l && l.rho !== null && l.p_adj !== null && l.p_adj < 0.05;
      const p = svgEl('path', {
        class: 'f3-arrow',
        d,
        stroke: sig ? TOKEN[target] : COLORS.rule,
        'stroke-dasharray': sig ? 'none' : '6 4',
        'marker-end': `url(#f3-arrow-${sig ? target : 'grey'})`,
      });
      svg.appendChild(p);
      if (l) {
        const [l1, l2] = linkLabel(l, theme);
        svg.appendChild(svgEl('text', { class: 'f3-label', x: labelXY[0], y: labelXY[1] }, l1));
        svg.appendChild(svgEl('text', { class: 'f3-label', x: labelXY[0], y: labelXY[1] + 13 }, l2));
      }
    };

    for (let i = 0; i < 3; i += 1) {
      const l = chain[i];
      const missing = !basin && i > 0;
      if (missing) continue;
      drawArrow(`M${cx[i] + R + 4} ${cy} L${cx[i + 1] - R - 6} ${cy}`, l, NODES[i + 1], [(cx[i] + cx[i + 1]) / 2, cy - R - 24]);
    }
    if (arc) {
      const ay = cy + R + 30;
      drawArrow(`M${cx[0]} ${ay} C ${cx[0] + 60} ${ay + 70}, ${cx[3] - 60} ${ay + 70}, ${cx[3]} ${ay + 2}`, arc, 'fish', [360, ay + 64]);
    }

    for (let i = 0; i < 4; i += 1) {
      const g = NODES[i];
      const varId = varOf[g];
      const v = VARS[varId];
      const unavailable = g === 'water' && !basin;
      const node = svgEl('g', { class: `f3-node${unavailable ? ' is-missing' : ''}`, tabindex: '0', role: 'button' });
      node.appendChild(svgEl('circle', { cx: cx[i], cy, r: R, stroke: TOKEN[g] }));
      node.appendChild(svgEl('text', { class: 'f3-name', x: cx[i], y: cy - 4 }, v ? v.short : g));

      if (unavailable) {
        node.appendChild(svgEl('text', { class: 'f3-link', x: cx[i], y: cy + 12 }, 'basin only'));
        const hint = svgEl('text', { class: 'f3-link', x: cx[i], y: cy + R + 18 }, 'Measured in the case-study basin →');
        hint.addEventListener('click', () => store.set({ view: 'basin' }));
        svg.appendChild(hint);
        node.addEventListener('click', () => store.set({ view: 'basin' }));
        nodeRefs.push({ node, varId, unavailable: true });
      } else {
        const valEl = svgEl('text', { class: 'f3-value', x: cx[i], y: cy + 13 }, '—');
        const unitStr = theme.unitFor(varId, meta);
        const unitEl = svgEl('text', { class: 'f3-unit', x: cx[i], y: cy + R + 16 }, `${state.year} · ${unitStr}`);
        node.appendChild(valEl);
        node.appendChild(unitEl);
        node.addEventListener('click', () => store.set({ focus: varId }));
        nodeRefs.push({ node, varId, group: g, unavailable: false, valEl, unitEl, unitStr });
      }
      node.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); node.dispatchEvent(new Event('click')); }
      });
      svg.appendChild(node);
    }

    text.innerHTML = links.length ? sentenceHtml(meta, links, VARS, theme) : 'No link statistics for this selection.';
    cap.innerHTML = `<strong>Fig. 3</strong> — Spearman rank correlation per link, lag with the largest |ρ| shown; solid when Benjamini-Hochberg adjusted p &lt; 0.05.${basin ? '' : ' Water links are tested in the case-study basin.'}`;
    updateValues(state);
  }

  function updateValues(state) {
    if (!current || !nodeRefs.length) return;
    const { meta, series } = current;
    const focusGroup = VARS[state.focus] ? VARS[state.focus].group : null;
    for (let i = 0; i < nodeRefs.length; i += 1) {
      const ref = nodeRefs[i];
      ref.node.classList.toggle('is-focus', state.focus === ref.varId || (focusGroup && focusGroup === ref.group));
      if (ref.unavailable) continue;
      const value = data.annualValue(series, ref.varId, state.year, ref.group === 'water' ? meta.primaryWaterBody : undefined);
      ref.valEl.textContent = theme.fmt(value, ref.varId);
      ref.unitEl.textContent = `${state.year} · ${ref.unitStr}`;
    }
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    current = scope && scope.meta ? scope : null;
    if (!current) {
      nodeRefs = [];
      theme.placeholder(el);
      return;
    }
    drawStructure(current, state);
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.focus !== prev.focus || state.year !== prev.year) updateValues(state);
  });
  await build(store.get());
}

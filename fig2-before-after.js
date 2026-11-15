// js/charts/fig2-before-after.js
// Purpose: Fig. 2 (#fig2) — before / after bars for the focused variable around a fire year.
//          Optimized to skip Plot SVG rebuilds when year changes resolve to the same event.
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm';

const STYLE = `
.f2-root { padding: 10px 12px 8px; }
.f2-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.f2-title { font-family: var(--f-serif); font-size: 16px; font-weight: 700; margin: 0; color: var(--c-ink); }
.f2-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.f2-chip {
  padding: 2px 9px; font-family: var(--f-mono); font-size: 12px; font-weight: 500;
  color: var(--c-muted); border: 1px solid var(--c-edge); border-radius: 8px; background: var(--c-paper);
  transition:
    background-color 160ms var(--ease-out),
    border-color 160ms var(--ease-out),
    color 160ms var(--ease-out),
    transform 100ms var(--ease-spring);
}
.f2-chip:hover:not([aria-pressed="true"]) { color: var(--c-ink); background: var(--c-panel); border-color: var(--c-edge-hover); }
.f2-chip:active { transform: scale(0.94); transition-duration: 60ms; }
.f2-chip[aria-pressed="true"] { color: var(--c-ink); border-color: var(--c-year); background: rgba(230, 159, 0, 0.1); font-weight: 700; }
.f2-plot { margin-top: 6px; min-height: 230px; }
.f2-plot svg { display: block; max-width: 100%; animation: emberFadeIn 190ms var(--ease-out); }
.f2-stats { font-family: var(--f-mono); font-size: 12px; margin: 6px 0 0; line-height: 1.55; color: var(--c-ink); }
.f2-stats strong { font-weight: 600; color: var(--c-ink); }
.f2-verdict { font-weight: 700; color: var(--c-ink); }
.f2-verdict.is-muted { font-weight: 500; color: var(--c-muted); }
.f2-cap { font-size: 12.5px; font-style: italic; color: var(--c-muted); margin: 4px 0 0; }
.f2-link { color: var(--c-link); font-weight: 600; }
`;
const ORDER = ['kd490', 'aod', 'chlor_a', 'fire_frp', 'fire_count'];

function injectStyle() {
  if (document.querySelector('style[data-module="f2"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'f2';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

const span = (years) => (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0]));

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, VARS } = theme;
  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f2-root';
  const head = document.createElement('div');
  head.className = 'f2-head';
  const title = document.createElement('h3');
  title.className = 'f2-title';
  title.textContent = 'Fig. 2 — Before / after a fire year';
  const chips = document.createElement('div');
  chips.className = 'f2-chips';
  chips.setAttribute('aria-label', 'Fire years');
  head.append(title, chips);
  const plotBox = document.createElement('div');
  plotBox.className = 'f2-plot';
  const stats = document.createElement('p');
  stats.className = 'f2-stats';
  const cap = document.createElement('p');
  cap.className = 'f2-cap';
  root.append(head, plotBox, stats, cap);
  el.appendChild(root);

  let current = null;
  let token = 0;
  let lastRenderKey = null;
  let lastWidth = 0;

  function pickEntries(state) {
    const { meta, stats: st } = current;
    const all = st && Array.isArray(st.beforeAfter) ? st.beforeAfter : [];
    const forVar = (v) => all.filter((e) => e.variable === v && (data.isWaterVar(v) ? e.waterBody === meta.primaryWaterBody : true));
    let entries = forVar(state.focus);
    for (const v of ORDER) if (!entries.length) entries = forVar(v);
    if (!entries.length && all.length) entries = forVar(all[0].variable);
    return entries.sort((a, b) => a.event - b.event);
  }

  function draw(state, force = false) {
    if (!current) return;
    const { meta, series } = current;
    const width = Math.max(260, plotBox.clientWidth || el.clientWidth - 40 || 420);

    if (data.isWaterVar(state.focus) && meta.kind !== 'basin') {
      const key = `${meta.path}|water-gate`;
      if (!force && key === lastRenderKey) return;
      lastRenderKey = key;
      plotBox.innerHTML = '';
      stats.innerHTML = '';
      chips.innerHTML = '';
      cap.textContent = '';
      const p = theme.placeholder(plotBox, 'Water is measured in the case-study basin. ');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'f2-link';
      a.textContent = 'Open the case study →';
      a.addEventListener('click', (ev) => { ev.preventDefault(); store.set({ view: 'basin' }); });
      p.appendChild(a);
      return;
    }

    const entries = pickEntries(state);
    if (!entries.length) {
      const key = `${meta.path}|empty`;
      if (!force && key === lastRenderKey) return;
      lastRenderKey = key;
      plotBox.innerHTML = '';
      stats.innerHTML = '';
      chips.innerHTML = '';
      theme.placeholder(plotBox);
      cap.textContent = `Fig. 2 — no before / after test available for ${meta.name}.`;
      return;
    }

    const upTo = entries.filter((e) => e.event <= state.year);
    const entry = upTo.length ? upTo[upTo.length - 1] : entries[0];
    const renderKey = `${meta.path}|${entry.variable}|${entry.event}|${width}`;
    if (!force && renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    lastWidth = width;

    plotBox.innerHTML = '';
    stats.innerHTML = '';
    chips.innerHTML = '';

    for (const e of entries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'f2-chip';
      b.textContent = String(e.event);
      b.setAttribute('aria-pressed', String(e === entry));
      b.addEventListener('click', () => store.set({ year: e.event }));
      chips.appendChild(b);
    }

    const v = VARS[entry.variable];
    const unit = theme.unitFor(entry.variable, meta);
    const wb = data.isWaterVar(entry.variable) ? entry.waterBody : undefined;
    const during = entry.after_years.length === 1 && entry.after_years[0] === entry.event;
    const beforeLabel = `Before (${span(entry.before_years)})`;
    const afterLabel = `${during ? 'During' : 'After'} (${span(entry.after_years)})`;
    const monthly = data.monthlySeries(series, entry.variable, wb);
    const dots = [];
    const pick = (years, cx, side) => {
      let i = 0;
      for (const d of monthly) {
        const y = d.date.getUTCFullYear();
        const m = d.date.getUTCMonth() + 1;
        if (!years.includes(y) || !entry.months.includes(m) || d.value === null) continue;
        dots.push({ x: cx + (((i * 7) % 11) - 5) / 25, value: d.value, side, label: `${d.month}: ${theme.fmt(d.value, entry.variable)}` });
        i += 1;
      }
    };
    pick(entry.before_years, 0.5, 'before');
    pick(entry.after_years, 1.5, 'after');
    const bars = [
      { x1: 0.2, x2: 0.8, y: entry.mean_before, side: 'before' },
      { x1: 1.2, x2: 1.8, y: entry.mean_after, side: 'after' },
    ];
    const color = (d) => (d.side === 'after' ? v.color : COLORS.muted);
    const fmtCompactTick = (val) => {
      if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
      if (Math.abs(val) >= 10_000) return `${Math.round(val / 1_000)}k`;
      return String(val);
    };
    const svg = Plot.plot({
      width, height: 248, marginLeft: 56, marginRight: 20, marginTop: 30, marginBottom: 28,
      style: { fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: '11px', color: COLORS.muted, background: 'transparent', overflow: 'visible' },
      x: { domain: [0, 2], ticks: [0.5, 1.5], tickFormat: (d) => (d < 1 ? beforeLabel : afterLabel), label: null },
      y: { label: `${v.short} (${unit})`, labelAnchor: 'top', nice: true, zero: true, tickFormat: fmtCompactTick },
      marks: [
        Plot.gridY({ stroke: COLORS.rule, strokeOpacity: 0.5 }),
        Plot.rectY(bars, { x1: 'x1', x2: 'x2', y: 'y', fill: color, fillOpacity: 0.18, stroke: color, strokeWidth: 1.5 }),
        Plot.dot(dots, { x: 'x', y: 'value', r: 3, fill: color, fillOpacity: 0.85, title: 'label' }),
        Plot.ruleY([0], { stroke: COLORS.rule }),
      ],
    });
    plotBox.appendChild(svg);
    const sig = entry.p < 0.05;
    stats.innerHTML = `<strong>Welch t</strong> = ${entry.welch_t.toFixed(2)} · <strong>df</strong> = ${entry.df.toFixed(1)} · ${theme.fmtP(entry.p)} · <strong>d</strong> = ${entry.cohens_d.toFixed(2)} `
      + `· <strong>Mann-Whitney</strong> ${theme.fmtP(entry.mannwhitney_p)} · n = ${entry.n_before}/${entry.n_after}<br>`
      + `<span class="f2-verdict${sig ? '' : ' is-muted'}">${sig ? 'Different (p &lt; 0.05)' : 'No clear difference'}</span>`;
    cap.innerHTML = `<strong>Fig. 2</strong> — ${v.label}, May–Sep, before vs ${during ? 'during' : 'after'} the <strong>${entry.event}</strong> fire season, ${meta.name}. Dots: monthly values. Bars: means.`;
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    current = scope && scope.meta ? scope : null;
    lastRenderKey = null;
    if (!current) {
      theme.placeholder(plotBox);
      return;
    }
    draw(state, true);
  }

  let resizeTimer = null;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const nextW = Math.max(260, plotBox.clientWidth || el.clientWidth - 40 || 420);
      if (nextW === lastWidth) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => draw(store.get()), 150);
    }).observe(el);
  }
  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.focus !== prev.focus || state.year !== prev.year) draw(state);
  });
  await build(store.get());
}

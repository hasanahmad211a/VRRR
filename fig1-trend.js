// js/charts/fig1-trend.js
// Purpose: Fig. 1 (#fig1) — annual line + monthly trace + thick Sen trend line for the focused variable.
//          Optimized to move only the year-marker SVG line during slider scrubbing/playback.
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm';

const STYLE = `
.f1-root { padding: 10px 12px 8px; }
.f1-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.f1-title { font-family: var(--f-serif); font-size: 16px; font-weight: 700; margin: 0; color: var(--c-ink); }
.f1-seg { display: inline-flex; border: 1px solid var(--c-edge); border-radius: 8px; overflow: hidden; background: var(--c-panel); padding: 2px; gap: 2px; }
.f1-seg button {
  border: 0; border-radius: 6px; padding: 3px 10px; font-size: 12.5px; font-weight: 500;
  color: var(--c-muted); background: transparent;
  transition:
    background-color 170ms var(--ease-out),
    color 170ms var(--ease-out),
    box-shadow 170ms var(--ease-out),
    transform 100ms var(--ease-spring);
}
.f1-seg button:hover:not([aria-pressed="true"]) { color: var(--c-ink); background: rgba(255, 255, 255, 0.7); }
.f1-seg button:active { transform: scale(0.95); transition-duration: 60ms; }
.f1-seg button[aria-pressed="true"] { color: var(--c-paper); font-weight: 600; background: var(--c-ink); box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16); }
.f1-seg button[data-group="fire"][aria-pressed="true"] { background: var(--c-fire); }
.f1-seg button[data-group="air"][aria-pressed="true"] { background: var(--c-smoke); }
.f1-seg button[data-group="water"][aria-pressed="true"] { background: var(--c-water); }
.f1-seg button[data-group="fish"][aria-pressed="true"] { background: var(--c-fish); }
.f1-plot { margin-top: 6px; min-height: 230px; }
.f1-plot svg { display: block; max-width: 100%; animation: emberFadeIn 190ms var(--ease-out); }
.f1-year-rule { pointer-events: none; transition: x1 160ms var(--ease-out), x2 160ms var(--ease-out); }
.f1-stats { font-family: var(--f-mono); font-size: 12px; color: var(--c-ink); margin: 6px 0 0; line-height: 1.55; }
.f1-stats strong { font-weight: 600; color: var(--c-ink); }
.f1-stats .f1-muted { color: var(--c-muted); }
.f1-stats .f1-muted strong { color: var(--c-muted); font-weight: 600; }
.f1-cap { font-size: 12.5px; font-style: italic; color: var(--c-muted); margin: 4px 0 0; }
.f1-link { color: var(--c-link); font-weight: 600; }
.f1-subseg { display: inline-flex; gap: 4px; margin-top: 6px; }
.f1-subseg button {
  border: 1px solid var(--c-edge); border-radius: 5px; padding: 2px 8px;
  font-family: var(--f-mono); font-size: 11px; font-weight: 500;
  color: var(--c-muted); background: var(--c-paper);
}
.f1-subseg button[aria-pressed="true"] {
  border-color: var(--c-fire); color: var(--c-fire); background: rgba(213, 94, 0, 0.08); font-weight: 600;
}
`;
const DAY = (y, m = 0, d = 1) => new Date(Date.UTC(y, m, d));
const NS = 'http://www.w3.org/2000/svg';
const PLOT_H = 248;
const MARGIN_L = 56;
const MARGIN_R = 20;
const MARGIN_T = 30;
const MARGIN_B = 28;

function injectStyle() {
  if (document.querySelector('style[data-module="f1"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'f1';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function signed(v, digits) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return `${v < 0 ? '−' : '+'}${abs}`;
}

function erfcApprox(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196
    + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398
    + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? ans : 2 - ans;
}

export function computeTrendStats(annualPoints, y0) {
  const pts = (annualPoints || []).filter((d) => d && d.value !== null && Number.isFinite(d.value));
  const n = pts.length;
  if (n < 4) return null;
  let S = 0;
  const slopes = [];
  const tieMap = new Map();
  for (let i = 0; i < n; i += 1) {
    tieMap.set(pts[i].value, (tieMap.get(pts[i].value) || 0) + 1);
    for (let j = i + 1; j < n; j += 1) {
      const diff = pts[j].value - pts[i].value;
      if (diff > 0) S += 1;
      else if (diff < 0) S -= 1;
      const dx = pts[j].year - pts[i].year;
      if (dx !== 0) slopes.push(diff / dx);
    }
  }
  slopes.sort((a, b) => a - b);
  const mid = slopes.length >> 1;
  const senSlope = slopes.length ? (slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2) : 0;
  const residuals = pts.map((p) => p.value - senSlope * (p.year - y0)).sort((a, b) => a - b);
  const rMid = residuals.length >> 1;
  const senIntercept = residuals.length % 2 ? residuals[rMid] : (residuals[rMid - 1] + residuals[rMid]) / 2;
  let tieAdj = 0;
  for (const t of tieMap.values()) {
    if (t > 1) tieAdj += t * (t - 1) * (2 * t + 5);
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieAdj) / 18;
  const z = varS > 0 ? (S > 0 ? (S - 1) : S < 0 ? (S + 1) : 0) / Math.sqrt(varS) : 0;
  const p = erfcApprox(Math.abs(z) / Math.SQRT2);
  const tau = S / ((n * (n - 1)) / 2);
  const direction = p < 0.05 ? (S > 0 ? 'increasing' : 'decreasing') : 'no clear trend';
  return { basis: 'annual', tau, p, sen_slope: senSlope, sen_intercept: senIntercept, direction, n };
}

function trendText(t, unit, theme) {
  if (!t) return null;
  const label = t.basis === 'annual' ? 'Mann-Kendall (annual)' : 'Seasonal Mann-Kendall (monthly)';
  const digits = Math.abs(t.sen_slope || 0) >= 100 ? 0 : 4;
  const tau = t.tau === null ? 'τ = —' : `τ = ${t.tau.toFixed(2).replace('-', '−')}`;
  return `<strong>${label}:</strong> ${tau} · ${theme.fmtP(t.p)} · <strong>Sen:</strong> ${signed(t.sen_slope, digits)} ${unit}/yr · <strong>${t.direction}</strong>${t.n ? ` (n = ${t.n})` : ''}`;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, VARS, GROUP_DEFAULT, GROUPS, GROUP_LABEL } = theme;
  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f1-root';
  const head = document.createElement('div');
  head.className = 'f1-head';
  const title = document.createElement('h3');
  title.className = 'f1-title';
  title.textContent = 'Fig. 1 — Trend';
  const seg = document.createElement('div');
  seg.className = 'f1-seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Variable group');
  const segButtons = {};
  for (const g of GROUPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.group = g;
    b.textContent = GROUP_LABEL[g];
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      let varId = GROUP_DEFAULT[g] || (current && current.meta.fishMetric);
      if (g === 'fire' && current && current.series) {
        const hasFrp = data.annualSeries(current.series, 'fire_frp').some((d) => d.value !== null);
        const hasCount = data.annualSeries(current.series, 'fire_count').some((d) => d.value !== null);
        if (!hasFrp && hasCount) varId = 'fire_count';
      }
      if (varId) store.set({ focus: varId });
    });
    seg.appendChild(b);
    segButtons[g] = b;
  }
  head.append(title, seg);
  const subSeg = document.createElement('div');
  subSeg.className = 'f1-subseg';
  subSeg.hidden = true;
  const plotBox = document.createElement('div');
  plotBox.className = 'f1-plot';
  const stats = document.createElement('p');
  stats.className = 'f1-stats';
  const cap = document.createElement('p');
  cap.className = 'f1-cap';
  root.append(head, subSeg, plotBox, stats, cap);
  el.appendChild(root);

  let current = null;
  let token = 0;
  let lastWidth = 0;
  let yearRuleState = null;

  function moveYearRule(year) {
    if (!yearRuleState) return;
    const { line, xForYear } = yearRuleState;
    const px = xForYear(Number(year));
    if (Number.isFinite(px)) {
      const s = px.toFixed(1);
      line.setAttribute('x1', s);
      line.setAttribute('x2', s);
    }
  }

  function draw(state) {
    if (!current) return;
    const { meta, series, stats: st } = current;
    let focus = VARS[state.focus] ? state.focus : 'fire_frp';
    if (focus === 'fire_frp' && series) {
      const hasFrp = data.annualSeries(series, 'fire_frp').some((d) => d.value !== null);
      const hasCount = data.annualSeries(series, 'fire_count').some((d) => d.value !== null);
      if (!hasFrp && hasCount) focus = 'fire_count';
    }
    const v = VARS[focus];
    for (const g of GROUPS) segButtons[g].setAttribute('aria-pressed', String(v.group === g));
    subSeg.innerHTML = '';
    if (v.group === 'fire' && series) {
      const fireVars = [
        { id: 'fire_frp', label: 'Fire power (MW)' },
        { id: 'fire_count', label: 'MODIS detections' },
        { id: 'viirs_count', label: 'VIIRS (2012+)' },
      ].filter((opt) => data.annualSeries(series, opt.id).some((d) => d.value !== null));
      subSeg.hidden = fireVars.length <= 1;
      for (const opt of fireVars) {
        const sb = document.createElement('button');
        sb.type = 'button';
        sb.textContent = opt.label;
        sb.setAttribute('aria-pressed', String(focus === opt.id));
        sb.addEventListener('click', () => store.set({ focus: opt.id }));
        subSeg.appendChild(sb);
      }
    } else {
      subSeg.hidden = true;
    }

    const unit = theme.unitFor(focus, meta);
    const [y0, y1] = meta.years || [2002, 2026];
    cap.innerHTML = `<strong>Fig. 1</strong> — ${v.label}, ${meta.name}, ${y0}–${y1}. Thick line: Sen slope.`;
    plotBox.innerHTML = '';
    stats.innerHTML = '';
    yearRuleState = null;

    if (data.isWaterVar(focus) && meta.kind !== 'basin') {
      const p = theme.placeholder(plotBox, '');
      p.textContent = 'Water variables are measured in the case-study basin. ';
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'f1-link';
      a.textContent = 'Open the case study →';
      a.addEventListener('click', (ev) => { ev.preventDefault(); store.set({ view: 'basin' }); });
      p.appendChild(a);
      return;
    }

    const wb = data.isWaterVar(focus) ? meta.primaryWaterBody : undefined;
    const annual = data.annualSeries(series, focus, wb).map((d) => ({ ...d, date: DAY(d.year, 6, 1) }));
    const monthly = data.monthlySeries(series, focus, wb).filter((d) => d.value !== null);
    if (!annual.some((d) => d.value !== null) && !monthly.length) {
      theme.placeholder(plotBox);
      return;
    }

    const trends = (st && st.trends ? st.trends : []).filter((t) => t.variable === focus && (wb ? t.waterBody === wb : !t.waterBody));
    const ta = trends.find((t) => t.basis === 'annual') || computeTrendStats(annual, y0);
    const tm = trends.find((t) => t.basis === 'monthly');
    const sen = ta && ta.sen_slope !== null && ta.sen_intercept !== null
      ? annual.map((d) => ({ date: d.date, value: ta.sen_intercept + ta.sen_slope * (d.year - y0) }))
      : [];
    const width = Math.max(260, plotBox.clientWidth || el.clientWidth - 40 || 420);
    lastWidth = width;
    const spanYears = y1 - y0 + 1;
    const step = spanYears > 16 ? (width < 480 ? 4 : 3) : (width < 520 ? 2 : 1);
    const ticks = [];
    for (let y = y0; y <= y1; y += step) ticks.push(DAY(y));
    const events = (meta.eventYears || []).map((y) => ({ date: DAY(y, 6, 1), year: y }));
    const isWater = data.isWaterVar(focus);
    const monthlyShown = isWater ? monthly.filter((d) => [5, 6, 7, 8, 9].includes(d.date.getUTCMonth() + 1)) : monthly;
    const fmtCompactTick = (val) => {
      if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
      if (Math.abs(val) >= 10_000) return `${Math.round(val / 1_000)}k`;
      return String(val);
    };
    const marks = [
      Plot.gridY({ stroke: COLORS.rule, strokeOpacity: 0.5 }),
      monthlyShown.length
        ? (isWater
          ? Plot.dot(monthlyShown, { x: 'date', y: 'value', r: 1.5, fill: COLORS.rule })
          : Plot.line(monthlyShown, { x: 'date', y: 'value', stroke: COLORS.rule, strokeWidth: 1 }))
        : null,
      sen.length ? Plot.line(sen, { x: 'date', y: 'value', stroke: v.color, strokeWidth: 5, strokeOpacity: 0.85 }) : null,
      Plot.line(annual, { x: 'date', y: 'value', stroke: COLORS.ink, strokeWidth: 1.5 }),
      Plot.dot(annual.filter((d) => d.value !== null), { x: 'date', y: 'value', r: 2.5, fill: COLORS.ink,
        title: (d) => `${d.year}: ${theme.fmt(d.value, focus)} ${unit}` }),
      events.length ? Plot.dot(events, { x: 'date', frameAnchor: 'bottom', dy: -3, symbol: 'triangle', r: 4, fill: COLORS.fire,
        title: (d) => `Major fire year ${d.year}` }) : null,
    ].filter(Boolean);

    const svg = Plot.plot({
      width,
      height: PLOT_H,
      marginLeft: MARGIN_L,
      marginRight: MARGIN_R,
      marginTop: MARGIN_T,
      marginBottom: MARGIN_B,
      style: { fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: '11px', color: COLORS.muted, background: 'transparent', overflow: 'visible' },
      x: { domain: [DAY(y0), DAY(y1 + 1)], ticks, tickFormat: '%Y', label: null },
      y: { label: `${v.short} (${unit})`, labelAnchor: 'top', nice: true, zero: !isWater, tickFormat: fmtCompactTick },
      marks,
    });

    const xScale = typeof svg.scale === 'function' ? svg.scale('x') : null;
    const xStart = DAY(y0).getTime();
    const xEnd = DAY(y1 + 1).getTime();
    const xForYear = (yr) => {
      const dt = DAY(yr, 6, 1);
      if (xScale && typeof xScale.apply === 'function') return xScale.apply(dt);
      const t = (dt.getTime() - xStart) / Math.max(1, xEnd - xStart);
      return MARGIN_L + t * (width - MARGIN_L - MARGIN_R);
    };

    const ruleLine = document.createElementNS(NS, 'line');
    ruleLine.setAttribute('class', 'f1-year-rule');
    ruleLine.setAttribute('y1', String(MARGIN_T));
    ruleLine.setAttribute('y2', String(PLOT_H - MARGIN_B));
    ruleLine.setAttribute('stroke', COLORS.year);
    ruleLine.setAttribute('stroke-width', '1.75');
    ruleLine.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(ruleLine);
    yearRuleState = { line: ruleLine, xForYear };
    moveYearRule(state.year);

    plotBox.appendChild(svg);
    const lines = [trendText(ta, unit, theme), trendText(tm, unit, theme)].filter(Boolean);
    if (!lines.length) lines.push('No trend test for this selection');
    stats.innerHTML = lines.map((l, i) => `<span class="${i ? 'f1-muted' : ''}">${l}</span>`).join('<br>');
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    current = scope && scope.meta ? scope : null;
    if (!current) {
      yearRuleState = null;
      theme.placeholder(plotBox);
      return;
    }
    draw(state);
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
    else if (state.focus !== prev.focus) draw(state);
    else if (state.year !== prev.year) {
      if (yearRuleState) moveYearRule(state.year);
      else draw(state);
    }
  });
  await build(store.get());
}

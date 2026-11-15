// js/map/legend.js
// Purpose: side-by-side Field Alert & Layer Guide (#map-legend) outside the map window.
//          Conveys live fire/smoke/river severity, peak hotspots, urgent causal context,
//          and intuitive visual scales in a vertical rail (>= 1200px) or horizontal deck (< 1200px).

const STYLE = `
.leg-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-paper);
  color: var(--c-ink);
  font-size: 12px;
  line-height: 1.4;
}
.leg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--c-edge);
  background: linear-gradient(180deg, rgba(246, 248, 250, 0.9), #FFFFFF);
}
.leg-title-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.leg-kicker {
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.leg-title {
  font-family: var(--f-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--c-ink);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 5px;
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--c-edge);
  background: var(--c-panel);
  color: var(--c-muted);
}
.leg-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.leg-badge.is-extreme {
  background: #FEF2F2;
  border-color: #FCA5A5;
  color: #B91C1C;
}
.leg-badge.is-extreme .leg-badge-dot {
  animation: legPulse 1.3s ease-in-out infinite;
}
.leg-badge.is-elevated {
  background: #FFFBEB;
  border-color: #FCD34D;
  color: #B45309;
}
.leg-badge.is-moderate {
  background: #FFF7ED;
  border-color: #FDBA74;
  color: #C2410C;
}
.leg-badge.is-baseline {
  background: #F0FDF4;
  border-color: #86EFAC;
  color: #15803D;
}
.leg-badge.is-loading {
  background: #EFF6FF;
  border-color: #93C5FD;
  color: #1D4ED8;
}
.leg-badge.is-loading .leg-badge-dot {
  animation: legPulse 0.9s ease-in-out infinite;
}

@keyframes legPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.35); }
}

.leg-telemetry {
  padding: 10px 14px;
  border-bottom: 1px solid var(--c-edge);
  background: var(--c-panel);
}
.leg-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.leg-kpi {
  background: var(--c-paper);
  border: 1px solid var(--c-edge);
  border-radius: 5px;
  padding: 6px 8px;
  min-width: 0;
}
.leg-kpi-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-muted);
}
.leg-kpi-val {
  display: block;
  margin-top: 1px;
  font-family: var(--f-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--c-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-kpi-sub {
  display: block;
  font-size: 10.5px;
  color: var(--c-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-kpi-val.is-hot { color: #B91C1C; }
.leg-kpi-val.is-warn { color: #C2410C; }
.leg-kpi-val.is-purple { color: #6A3093; }

.leg-brief {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--c-ink);
}
.leg-brief strong { color: var(--c-ink); }
.leg-brief.is-muted { color: var(--c-muted); }

.leg-layers {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 14px;
}
.leg-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--c-edge);
}
.leg-card:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.leg-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.leg-card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-ink);
}
.leg-card-tag {
  font-family: var(--f-mono);
  font-size: 10px;
  color: var(--c-muted);
}
.leg-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.leg-bar {
  flex: 1 1 auto;
  height: 8px;
  border-radius: 4px;
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.leg-bar--fire {
  background: linear-gradient(90deg, #FACC15 0%, #F59E0B 28%, #EA580C 56%, #DC2626 80%, #991B1B 100%);
}
.leg-bar--river {
  background: linear-gradient(90deg, #56B4E9 0%, #5B8FD9 36%, #6A58B7 68%, #7B3294 100%);
}
.leg-bar--smoke {
  background: linear-gradient(90deg, rgba(138, 127, 114, 0.12) 0%, rgba(126, 113, 99, 0.42) 55%, rgba(78, 66, 56, 0.8) 100%);
}
.leg-ticks {
  display: flex;
  justify-content: space-between;
  font-family: var(--f-mono);
  font-size: 9.5px;
  color: var(--c-muted);
}
.leg-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--c-muted);
}
.leg-ember-dot {
  transform-origin: center;
  animation: legEmber 2.3s ease-in-out infinite;
}
@keyframes legEmber {
  0%, 100% { fill-opacity: 0.72; }
  50% { fill-opacity: 0.94; }
}

.leg-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}
.leg-basin-btn {
  width: 100%;
  padding: 5px 9px;
  border-radius: 5px;
  border: 1px solid var(--c-edge);
  background: var(--c-panel);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-ink);
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.leg-basin-btn:hover:not([disabled]) {
  border-color: var(--c-basin);
  background: rgba(230, 159, 0, 0.08);
}

.leg-foot {
  padding: 9px 14px 11px;
  border-top: 1px solid var(--c-edge);
  background: var(--c-panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}
.leg-countries {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  width: 100%;
}
.leg-cbtn {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 7px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid var(--c-edge);
  background: var(--c-paper);
  color: var(--c-muted);
}
.leg-cbtn[aria-pressed="true"] {
  color: var(--c-ink);
  border-color: var(--c-win-border-hover, var(--c-ink));
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.leg-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}
.leg-swatch[data-country="canada"] { background: #2A9D8F; }
.leg-swatch[data-country="usa"] { background: #C84B59; }
.leg-swatch[data-country="russia"] { background: #3D6CB9; }

@media (max-width: 1199px) {
  .leg-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .leg-layers {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px 14px;
  }
  .leg-card {
    padding-bottom: 0;
    border-bottom: 0;
    padding-right: 12px;
    border-right: 1px dashed var(--c-edge);
  }
  .leg-card:last-child {
    padding-right: 0;
    border-right: 0;
  }
  .leg-countries {
    width: auto;
  }
}

@media (max-width: 799px) {
  .leg-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .leg-layers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .leg-card:nth-child(even) {
    padding-right: 0;
    border-right: 0;
  }
}

@media (max-width: 519px) {
  .leg-layers {
    grid-template-columns: 1fr;
  }
  .leg-card {
    padding-right: 0;
    border-right: 0;
    padding-bottom: 8px;
    border-bottom: 1px dashed var(--c-edge);
  }
  .leg-card:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
}
`;

const NS = 'http://www.w3.org/2000/svg';

function injectStyle() {
  if (document.querySelector('style[data-module="leg"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'leg';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function fmtCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString('en-US');
}

function makeFireDotsSvg(isBasin) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '52');
  svg.setAttribute('height', '22');
  svg.setAttribute('viewBox', '0 0 52 22');
  const k = isBasin ? 0.68 : 0.42;
  const r = (n) => (1.3 + k * Math.sqrt(n)).toFixed(1);
  svg.innerHTML = `<circle cx="7" cy="11" r="${r(8)}" fill="#FACC15" fill-opacity="0.72"/>`
    + `<circle cx="22" cy="11" r="${r(65)}" fill="#EA580C" fill-opacity="0.78"/>`
    + `<circle class="leg-ember-dot" cx="41" cy="11" r="${r(320)}" fill="#991B1B" fill-opacity="0.82"/>`;
  return svg;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const regions = await data.getRegions();

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'leg-root';

  const head = document.createElement('div');
  head.className = 'leg-head';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'leg-title-wrap';
  const kicker = document.createElement('span');
  kicker.className = 'leg-kicker';
  kicker.textContent = 'Live Field Signal';
  const title = document.createElement('div');
  title.className = 'leg-title';
  titleWrap.append(kicker, title);

  const badge = document.createElement('span');
  badge.className = 'leg-badge';
  const badgeDot = document.createElement('span');
  badgeDot.className = 'leg-badge-dot';
  const badgeText = document.createElement('span');
  badge.append(badgeDot, badgeText);
  head.append(titleWrap, badge);

  const telemetry = document.createElement('div');
  telemetry.className = 'leg-telemetry';
  const kpis = document.createElement('div');
  kpis.className = 'leg-kpis';
  const brief = document.createElement('p');
  brief.className = 'leg-brief';
  telemetry.append(kpis, brief);

  const layers = document.createElement('div');
  layers.className = 'leg-layers';

  const foot = document.createElement('div');
  foot.className = 'leg-foot';
  const cRow = document.createElement('div');
  cRow.className = 'leg-countries';
  const cBtns = new Map();
  if (regions && Array.isArray(regions.countries)) {
    for (const c of regions.countries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'leg-cbtn';
      btn.setAttribute('aria-pressed', 'false');
      const sw = document.createElement('span');
      sw.className = 'leg-swatch';
      sw.dataset.country = c.id;
      btn.append(sw, document.createTextNode(c.shortName || c.id));
      btn.addEventListener('click', () => store.set({ countryId: c.id, playing: false }));
      cRow.appendChild(btn);
      cBtns.set(c.id, btn);
    }
  }
  foot.appendChild(cRow);
  root.append(head, telemetry, layers, foot);
  el.appendChild(root);

  let token = 0;
  let lastScopeKey = null;
  let lastRiverSummary = null;
  let lastState = store.get();

  function buildLayers(meta) {
    const basin = meta && meta.kind === 'basin';
    layers.innerHTML = '';

    // 1. Wildfire Density
    const fireCard = document.createElement('div');
    fireCard.className = 'leg-card';
    fireCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">1. Wildfire Density</span><span class="leg-card-tag">per 5 km²</span></div>';
    const fireBarWrap = document.createElement('div');
    fireBarWrap.className = 'leg-bar-wrap';
    const fireBar = document.createElement('div');
    fireBar.className = 'leg-bar leg-bar--fire';
    fireBarWrap.append(makeFireDotsSvg(basin), fireBar);
    fireCard.appendChild(fireBarWrap);
    fireCard.insertAdjacentHTML('beforeend',
      '<div class="leg-ticks"><span>&lt;0.05 low</span><span>0.6+ active</span><span>6+ extreme</span></div>'
      + `<p class="leg-desc">Translucent ${basin ? '0.05°' : '0.2°'} clusters sort intense red cores on top.</p>`);

    // 2. River Runoff Exposure
    const riverCard = document.createElement('div');
    riverCard.className = 'leg-card';
    riverCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">2. River Ash &amp; Runoff</span><span class="leg-card-tag">width = order</span></div>'
      + '<div class="leg-bar leg-bar--river"></div>'
      + '<div class="leg-ticks"><span>Clean blue</span><span>Elevated</span><span>Toxic purple</span></div>'
      + '<p class="leg-desc">Post-burn erosion carries charcoal &amp; metals down salmon rivers.</p>';

    // 3. Downwind Smoke Choke
    const smokeCard = document.createElement('div');
    smokeCard.className = 'leg-card';
    smokeCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">3. Smoke Plume (AOD)</span><span class="leg-card-tag">May–Sep</span></div>'
      + '<div class="leg-bar leg-bar--smoke"></div>'
      + '<div class="leg-ticks"><span>0.0 clear</span><span>0.25 haze</span><span>0.60+ severe</span></div>'
      + '<p class="leg-desc">Airborne fine aerosols dim light &amp; stress downwind basins.</p>';

    // 4. Case Study & Terrain
    const ctxCard = document.createElement('div');
    ctxCard.className = 'leg-card';
    ctxCard.innerHTML = `<div class="leg-card-head"><span class="leg-card-title">4. ${basin ? '3D Basin Terrain' : 'Case-Study Focus'}</span><span class="leg-card-tag">${basin ? 'Kd490 + DEM' : 'contours on zoom'}</span></div>`
      + `<p class="leg-desc">${basin ? 'Green water box tracks coastal light attenuation downstream.' : 'Dashed orange border marks salmon watershed test zone.'}</p>`;
    if (basin || (meta && meta.basin)) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'leg-basin-btn';
      actionBtn.innerHTML = basin
        ? '<span>← Return to country map</span><span>Reset</span>'
        : `<span>Zoom to ${meta.basin.shortName} basin</span><span>3D →</span>`;
      actionBtn.addEventListener('click', () => store.set({ view: basin ? 'country' : 'basin' }));
      ctxCard.appendChild(actionBtn);
    }

    layers.append(fireCard, riverCard, smokeCard, ctxCard);
  }

  function makeKpi(label, val, sub, toneClass = '') {
    const box = document.createElement('div');
    box.className = 'leg-kpi';
    const l = document.createElement('span');
    l.className = 'leg-kpi-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = `leg-kpi-val${toneClass ? ` ${toneClass}` : ''}`;
    v.textContent = val;
    const s = document.createElement('span');
    s.className = 'leg-kpi-sub';
    s.textContent = sub;
    box.append(l, v, s);
    return box;
  }

  function computePeakDensity(fires, isBasin) {
    if (fires && fires.summary && Number.isFinite(fires.summary.peakDensity5km2)) {
      return fires.summary.peakDensity5km2;
    }
    if (!fires || !Array.isArray(fires.features) || !fires.features.length) return 0;
    const deg = (fires && fires.gridDeg) || (isBasin ? 0.1 : 0.5);
    let peak = 0;
    for (let i = 0; i < fires.features.length; i += 1) {
      const f = fires.features[i];
      const lat = f && f.geometry && Array.isArray(f.geometry.coordinates) ? Number(f.geometry.coordinates[1]) : 0;
      const cosLat = Math.max(0.15, Math.cos(lat * (Math.PI / 180)));
      const area = (deg * 110.574) * (deg * 111.32 * cosLat);
      const dens = area > 0 ? (Number(f.properties && f.properties.count) || 0) / (area / 5) : 0;
      if (dens > peak) peak = dens;
    }
    return Number(peak.toFixed(2));
  }

  function renderTelemetry(state, scope, fires, loading = false) {
    const meta = scope ? scope.meta : null;
    const basin = meta && meta.kind === 'basin';
    const yr = Number(state.year);

    for (const [id, b] of cBtns) b.setAttribute('aria-pressed', String(id === state.countryId));
    title.textContent = `${yr} · ${meta ? meta.shortName : state.countryId}`;

    if (loading) {
      badge.className = 'leg-badge is-loading';
      badgeText.textContent = 'Streaming CSV';
    }

    const summary = scope ? scope.summary : null;
    const yrRow = summary && summary.byYear ? summary.byYear.get(yr) : null;
    const fs = fires && fires.summary ? fires.summary : null;
    const mappedDetections = (fs && fs.detections) || (yrRow && (yrRow.detections || yrRow.modisTotal || yrRow.allTotal)) || null;
    const totalFrp = (fs && fs.totalFrpMw) || (yrRow && yrRow.totalFrpMw) || null;
    const peakDensity = computePeakDensity(fires, basin);
    const isMajorEvent = meta && Array.isArray(meta.eventYears) && meta.eventYears.includes(yr);
    const hasSpatialFires = !!(fires && Array.isArray(fires.features) && fires.features.length > 0);
    const medTotal = summary ? summary.medianTotal : null;
    const comparableTotal = yrRow ? (yrRow.modisTotal || yrRow.detections || yrRow.allTotal) : mappedDetections;

    let statusClass = 'is-baseline';
    let statusLabel = 'Baseline';
    if (loading && !yrRow) {
      statusClass = 'is-loading';
      statusLabel = 'Loading CSV';
    } else if (!hasSpatialFires && !comparableTotal) {
      statusClass = '';
      statusLabel = 'Awaiting CSV';
    } else if (peakDensity >= 2.2 || (summary && summary.p90Total && comparableTotal >= summary.p90Total) || isMajorEvent) {
      statusClass = 'is-extreme';
      statusLabel = 'Critical Surge';
    } else if (peakDensity >= 0.65 || (summary && summary.p75Total && comparableTotal >= summary.p75Total)) {
      statusClass = 'is-elevated';
      statusLabel = 'High Stress';
    } else if (hasSpatialFires || comparableTotal) {
      statusClass = 'is-moderate';
      statusLabel = 'Active Season';
    }
    badge.className = `leg-badge${statusClass ? ` ${statusClass}` : ''}`;
    badgeText.textContent = statusLabel;

    let detSub = fs && fs.sensor ? `${fs.sensor} detections` : 'mapped points';
    if (comparableTotal && medTotal && medTotal > 0) {
      const pct = Math.round(((comparableTotal - medTotal) / medTotal) * 100);
      detSub = `${pct >= 0 ? '+' : ''}${pct}% vs median`;
    }
    const detVal = mappedDetections ? fmtCompact(mappedDetections) : '—';
    const frpVal = totalFrp ? `${fmtCompact(totalFrp)} MW` : '—';
    const maxFrp = (fs && fs.maxFrpMw) || (yrRow && yrRow.maxFrpMw) || null;
    const frpSub = maxFrp ? `Peak ${fmtCompact(maxFrp)} MW` : 'radiative heat';
    const peakVal = peakDensity > 0 ? `${peakDensity.toFixed(2)} / 5km²` : '—';
    const topStateName = (fs && fs.topState && fs.topState.name)
      || (yrRow && yrRow.topStates && yrRow.topStates[0] && yrRow.topStates[0].name);
    const peakSub = topStateName
      ? `Top: ${topStateName}`
      : (fs && fs.activeCells ? `${fs.activeCells} hotspots` : 'hotspot density');

    const rSum = lastRiverSummary && lastRiverSummary.year === yr ? lastRiverSummary.summary : null;
    const riverVal = rSum
      ? (rSum.highRiskRivers > 0 ? `${rSum.highRiskRivers} severe` : rSum.elevatedRivers > 0 ? `${rSum.elevatedRivers} stressed` : 'Clear')
      : '—';
    const riverSub = rSum && rSum.worstRiverName && rSum.maxExposurePct > 0
      ? `${rSum.worstRiverName} (${rSum.maxExposurePct}%)`
      : 'watershed runoff';

    kpis.innerHTML = '';
    kpis.append(
      makeKpi('Detections', detVal, detSub, statusClass === 'is-extreme' ? 'is-hot' : ''),
      makeKpi('Fire Power', frpVal, frpSub, totalFrp > 2_500_000 ? 'is-warn' : ''),
      makeKpi('Peak Density', peakVal, peakSub, peakDensity >= 2.2 ? 'is-hot' : peakDensity >= 0.65 ? 'is-warn' : ''),
      makeKpi('River Risk', riverVal, riverSub, rSum && rSum.highRiskRivers > 0 ? 'is-purple' : ''),
    );

    const outageDates = summary && summary.viirsOutageByYear && summary.viirsOutageByYear[yr];
    const outageNote = outageDates && outageDates.length ? ` · ${outageDates.length} VIIRS outage day${outageDates.length > 1 ? 's' : ''}` : '';
    const topForestName = (fs && fs.topForest && fs.topForest.name)
      || (yrRow && yrRow.topForests && yrRow.topForests[0] && yrRow.topForests[0].name);

    if (loading) {
      brief.className = 'leg-brief is-muted';
      brief.textContent = `Streaming ${yr} fire detections for ${meta ? meta.shortName : state.countryId}…`;
    } else if (!hasSpatialFires && !comparableTotal) {
      brief.className = 'leg-brief is-muted';
      brief.innerHTML = `No fire CSV rows loaded for <strong>${meta ? meta.shortName : state.countryId}</strong> yet. Add CSVs in <code>data/${state.countryId}/</code>.`;
    } else if (yrRow && yrRow.viirsTotal > 0 && mappedDetections) {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>${fmtCompact(mappedDetections)}</strong> MODIS mapped + <strong>${fmtCompact(yrRow.viirsTotal)}</strong> VIIRS (${fmtCompact(yrRow.allTotal)} total)${topForestName ? ` · Top: <strong>${topForestName}</strong>` : ''}${outageNote}.`;
    } else if (topForestName && statusClass === 'is-extreme') {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>Alert:</strong> Peak pressure in <strong>${topForestName}</strong>${topStateName && !topForestName.includes(topStateName) ? ` (${topStateName})` : ''}${outageNote}.`;
    } else if (rSum && rSum.highRiskRivers > 0 && rSum.worstRiverName) {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>Runoff alert:</strong> <strong>${rSum.worstRiverName}</strong> shows high burn-zone ash exposure (${rSum.maxExposurePct}%).`;
    } else if (topForestName) {
      brief.className = 'leg-brief is-muted';
      brief.innerHTML = `Peak activity: <strong>${topForestName}</strong>${outageNote}.`;
    } else {
      brief.className = 'leg-brief is-muted';
      brief.textContent = `Compare fire clusters, smoke drift & downstream river color across years.`;
    }
  }

  async function render(state) {
    lastState = state;
    const my = ++token;
    const scopePath = data.scopePath(state);
    const scope = await data.getScope(state);
    if (my !== token) return;
    const meta = scope ? scope.meta : null;
    if (scopePath !== lastScopeKey) {
      lastScopeKey = scopePath;
      buildLayers(meta);
    }

    const shouldStream = !!(scope && scope.hasFireCsvs);
    if (shouldStream) renderTelemetry(state, scope, null, true);

    const fires = await data.getFires(state, state.year);
    if (my !== token) return;
    renderTelemetry(state, scope, fires, false);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('ember:rivers-scored', (ev) => {
      const d = ev && ev.detail;
      if (!d) return;
      lastRiverSummary = d;
      if (d.scope === lastScopeKey && d.year === Number(lastState.year)) {
        data.getScope(lastState).then((scope) => {
          data.getFires(lastState, lastState.year).then((fires) => {
            renderTelemetry(lastState, scope, fires, false);
          });
        });
      }
    });
  }

  store.subscribe((state, prev) => {
    if (state.year !== prev.year || state.countryId !== prev.countryId || state.view !== prev.view) {
      render(state);
    }
  });
  await render(store.get());
}

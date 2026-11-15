// js/ui/infobox.js
// Purpose: Wikipedia-style infobox (#infobox): the selected year's value, a sparkline and the change
//          against the timeline median for every variable of the current scope, plus full forest/sensor
//          inventory breakdown when summary tables are available.

const STYLE = `
.ibx-box { border: 1px solid var(--c-edge); background: var(--c-paper); border-radius: 2px; font-size: 14px; }
.ibx-caption { position: relative; padding: 10px 14px 8px; border-bottom: 1px solid var(--c-edge); }
.ibx-name { display: block; font-family: var(--f-serif); font-size: 18px; font-weight: 700; line-height: 1.25; color: var(--c-ink); }
.ibx-sub { display: block; margin-top: 3px; font-family: var(--f-mono); font-size: 12px; color: var(--c-muted); }
.ibx-sub strong { color: var(--c-ink); font-weight: 600; }
.ibx-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ibx-row[data-group="fire"] { --ibx-color: var(--c-fire); }
.ibx-row[data-group="air"] { --ibx-color: var(--c-smoke); }
.ibx-row[data-group="water"] { --ibx-color: var(--c-water); }
.ibx-row[data-group="fish"] { --ibx-color: var(--c-fish); }
.ibx-row th, .ibx-row td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--c-edge);
  vertical-align: middle;
  transition: background-color 160ms var(--ease-out), border-color 180ms var(--ease-out);
}
.ibx-row:last-of-type th, .ibx-row:last-of-type td { border-bottom: 0; }
.ibx-row th {
  width: 44%;
  font-weight: 600;
  color: var(--c-ink);
  border-left: 3px solid transparent;
  text-align: left;
  transition: background-color 160ms var(--ease-out), border-left-color 200ms var(--ease-out);
}
.ibx-row[role="button"] { cursor: pointer; }
.ibx-row[role="button"]:hover th, .ibx-row[role="button"]:hover td { background: var(--c-panel); }
.ibx-row[role="button"]:active th, .ibx-row[role="button"]:active td { background: #EEF2F6; }
.ibx-row.is-focus th { border-left-color: var(--ibx-color); background: rgba(15, 23, 42, 0.02); }
.ibx-row.is-focus td { background: rgba(15, 23, 42, 0.02); }
.ibx-row:focus-visible { outline: 2px solid var(--c-link); outline-offset: -2px; }
.ibx-sublabel { display: block; font-size: 11px; font-weight: 500; color: var(--c-muted); margin-top: 1px; }
.ibx-value { white-space: nowrap; }
.ibx-num { font-family: var(--f-mono); font-size: 15.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--c-ink); }
.ibx-unit { font-size: 12px; font-weight: 500; color: var(--c-muted); margin-left: 4px; }
.ibx-delta { display: block; font-size: 11.5px; color: var(--c-muted); margin-top: 2px; }
.ibx-delta strong { font-weight: 700; color: var(--c-ink); }
.ibx-delta strong.is-surge { color: #B91C1C; }
.ibx-delta strong.is-calm { color: #0F766E; }
.ibx-spark { width: 84px; text-align: right; }
.ibx-spark svg { display: inline-block; width: 72px; height: 18px; color: var(--ibx-color); overflow: visible; }
.ibx-spark polyline { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.ibx-spark circle { fill: var(--c-year); stroke: var(--c-paper); stroke-width: 1.2; transition: cx 180ms var(--ease-out), cy 180ms var(--ease-out); }
.ibx-link { color: var(--c-link); font-weight: 600; }
.ibx-foot { padding: 8px 14px; font-size: 12px; color: var(--c-muted); border-top: 1px solid var(--c-edge); }
.ibx-foot strong { color: var(--c-ink); font-weight: 600; }
.ibx-missing { font-style: italic; color: var(--c-muted); font-size: 13px; }
.ibx-detail { border-top: 1px solid var(--c-edge); padding: 10px 18px 12px; background: var(--c-panel); }
.ibx-detail-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
.ibx-detail-title { font-family: var(--f-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c-muted); }
.ibx-detail-tabs { display: inline-flex; gap: 4px; }
.ibx-detail-tabs button {
  padding: 2px 8px; font-size: 11px; font-family: var(--f-mono); font-weight: 500;
  border-radius: 5px; border: 1px solid var(--c-edge); background: var(--c-paper); color: var(--c-muted);
}
.ibx-detail-tabs button[aria-pressed="true"] {
  border-color: var(--c-ink); color: var(--c-ink); font-weight: 700;
}
.ibx-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.ibx-stat-chip {
  font-family: var(--f-mono); font-size: 11px; color: var(--c-ink);
  background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 5px; padding: 2px 7px;
}
.ibx-stat-chip span { color: var(--c-muted); }
.ibx-search {
  width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 4px 8px;
  font-family: var(--f-sans); font-size: 12px; color: var(--c-ink);
  background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 5px;
}
.ibx-forest-wrap { max-height: 148px; overflow-y: auto; border: 1px solid var(--c-edge); border-radius: 5px; background: var(--c-paper); }
.ibx-forest-tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.ibx-forest-tbl th, .ibx-forest-tbl td { padding: 4px 8px; border-bottom: 1px solid var(--c-edge); }
.ibx-forest-tbl th { position: sticky; top: 0; background: var(--c-panel); font-family: var(--f-mono); font-size: 10.5px; color: var(--c-muted); text-transform: uppercase; z-index: 1; }
.ibx-forest-tbl td.num, .ibx-forest-tbl th.num { text-align: right; font-family: var(--f-mono); white-space: nowrap; }
.ibx-forest-tbl tr:last-child td { border-bottom: 0; }
@media (max-width: 480px) {
  .ibx-row th { width: 38%; }
  .ibx-spark { width: 60px; }
  .ibx-spark svg { width: 52px; }
  .ibx-value { white-space: normal; }
  .ibx-row th, .ibx-row td { padding: 6px 6px; }
  .ibx-detail { padding: 8px 12px 10px; }
}
`;
const NS = 'http://www.w3.org/2000/svg';

function injectStyle() {
  if (document.querySelector('style[data-module="ibx"]')) return;
  const style = document.createElement('style');
  style.dataset.module = 'ibx';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function hasAny(series, varId) {
  const v = series && series.variables && series.variables[varId];
  if (!v) return false;
  return (v.annual || []).some((d) => d[1] !== null) || (v.monthly || []).some((d) => d[1] !== null);
}

function buildSparkline(points) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 72 18');
  svg.setAttribute('aria-hidden', 'true');
  const vals = points.map((p) => p.value).filter((v) => v !== null);
  if (vals.length < 2) return { svg, coordsByYear: new Map(), dot: null };
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const n = points.length;
  const x = (i) => 1 + (70 * i) / Math.max(1, n - 1);
  const y = (v) => (hi === lo ? 9 : 16 - (14 * (v - lo)) / (hi - lo));
  const coordsByYear = new Map();
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const pl = document.createElementNS(NS, 'polyline');
      pl.setAttribute('points', run.join(' '));
      svg.appendChild(pl);
    }
    run = [];
  };
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    if (p.value === null) {
      flush();
    } else {
      const cx = x(i).toFixed(1);
      const cy = y(p.value).toFixed(1);
      coordsByYear.set(p.year, [cx, cy]);
      run.push(`${cx},${cy}`);
    }
  }
  flush();
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '2.5');
  dot.style.display = 'none';
  svg.appendChild(dot);
  return { svg, coordsByYear, dot };
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const regions = await data.getRegions();
  if (!regions) {
    theme.placeholder(el);
    return;
  }
  const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2002, 2026];
  let current = null;
  let token = 0;
  let breakdownMode = 'year';
  let forestFilter = '';

  function rowSpecs(scope) {
    const { meta, series } = scope;
    const rows = [{ id: 'fire_count' }, { id: 'fire_frp' }];
    if (hasAny(series, 'viirs_count')) rows.push({ id: 'viirs_count', span: '2012–2026' });
    rows.push({ id: 'aod' });
    if (hasAny(series, 'pm25')) rows.push({ id: 'pm25' });
    if (meta.kind === 'basin') {
      const wb = meta.primaryWaterBody;
      const body = (meta.waterBodies || []).find((w) => w.id === wb);
      rows.push({ id: 'kd490', wb, sub: body ? body.name : wb }, { id: 'chlor_a', wb, sub: body ? body.name : wb });
    } else {
      rows.push({ link: true });
    }
    rows.push({ id: meta.fishMetric });
    return rows;
  }

  function renderForestBreakdown(scope, yr) {
    if (!current || !current.detailEl) return;
    const { detailChips, detailTableBody, detailTableHead, detailTitle, tabYearBtn, tabAllBtn } = current;
    const summary = scope.summary;
    if (!summary) {
      current.detailEl.hidden = true;
      return;
    }
    const yrRow = summary.byYear ? summary.byYear.get(yr) : null;
    const allForests = Array.isArray(summary.allForests) ? summary.allForests : [];
    const fyRows = summary.forestYearsByYear && summary.forestYearsByYear[yr] ? summary.forestYearsByYear[yr] : null;
    const hasDetails = !!(yrRow || allForests.length || fyRows);
    current.detailEl.hidden = !hasDetails;
    if (!hasDetails) return;

    tabYearBtn.setAttribute('aria-pressed', String(breakdownMode === 'year'));
    tabAllBtn.setAttribute('aria-pressed', String(breakdownMode === 'all'));
    tabAllBtn.hidden = !allForests.length;

    detailChips.innerHTML = '';
    if (yrRow) {
      const chips = [];
      const modisHi = yrRow.highFrpCount ?? yrRow.modisHighFrp;
      const modisLo = yrRow.lowFrpCount ?? yrRow.modisLowFrp;
      if (modisHi || modisLo) {
        chips.push(['MODIS FRP', `${Number(modisHi || 0).toLocaleString()} high / ${Number(modisLo || 0).toLocaleString()} low`]);
      }
      if (yrRow.viirsHighFrp || yrRow.viirsLowFrp) {
        chips.push(['VIIRS FRP', `${Number(yrRow.viirsHighFrp || 0).toLocaleString()} high / ${Number(yrRow.viirsLowFrp || 0).toLocaleString()} low`]);
      }
      if (yrRow.inNationalForestCount || yrRow.otherForestCount) {
        chips.push(['Forests', `${Number(yrRow.inNationalForestCount || 0).toLocaleString()} NF / ${Number(yrRow.otherForestCount || 0).toLocaleString()} state`]);
      }
      if (yrRow.terraCount || yrRow.aquaCount) {
        chips.push(['Satellites', `Terra ${Number(yrRow.terraCount || 0).toLocaleString()} · Aqua ${Number(yrRow.aquaCount || 0).toLocaleString()}`]);
      }
      if (yrRow.dayCount || yrRow.nightCount) {
        chips.push(['Cycle', `Day ${Number(yrRow.dayCount || 0).toLocaleString()} · Night ${Number(yrRow.nightCount || 0).toLocaleString()}`]);
      }
      const outages = summary.viirsOutageByYear && summary.viirsOutageByYear[yr];
      if (outages && outages.length) {
        chips.push(['VIIRS outages', `${outages.length}d (${outages.slice(0, 2).join(', ')}${outages.length > 2 ? '…' : ''})`]);
      }
      for (const [label, val] of chips) {
        const span = document.createElement('span');
        span.className = 'ibx-stat-chip';
        span.innerHTML = `<span>${label}:</span> ${val}`;
        detailChips.appendChild(span);
      }
    }

    const q = forestFilter.trim().toLowerCase();
    detailTableBody.innerHTML = '';

    if (breakdownMode === 'all' && allForests.length) {
      detailTitle.textContent = `All ${allForests.length} Forests & Regions (${y0}–${y1})`;
      detailTableHead.innerHTML = '<tr><th>Forest / Area</th><th>State</th><th class="num">MODIS</th><th class="num">VIIRS</th><th class="num">Max MW</th></tr>';
      const filtered = q
        ? allForests.filter((f) => f.name.toLowerCase().includes(q) || (f.state && f.state.toLowerCase().includes(q)))
        : allForests;
      for (const f of filtered) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${f.name}</td><td>${f.state || '—'}</td><td class="num">${f.modis.toLocaleString()}</td><td class="num">${f.viirs.toLocaleString()}</td><td class="num">${Math.round(f.maxFrpMw).toLocaleString()}</td>`;
        detailTableBody.appendChild(tr);
      }
      if (!filtered.length) {
        detailTableBody.innerHTML = '<tr><td colspan="5" class="ibx-missing">No matching forests</td></tr>';
      }
      current.forestWrap.hidden = false;
      current.searchInput.hidden = allForests.length <= 3 && !q;
      return;
    }

    if (fyRows && fyRows.length) {
      detailTitle.textContent = `${yr} Forest Breakdown (${fyRows.length} active)`;
      detailTableHead.innerHTML = '<tr><th>Forest / Area</th><th class="num">MODIS</th><th class="num">VIIRS</th><th class="num">Total</th></tr>';
      const filtered = q ? fyRows.filter(([name]) => name.toLowerCase().includes(q)) : fyRows;
      for (const [name, modis, viirs] of filtered) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${name}</td><td class="num">${modis.toLocaleString()}</td><td class="num">${viirs.toLocaleString()}</td><td class="num">${(modis + viirs).toLocaleString()}</td>`;
        detailTableBody.appendChild(tr);
      }
      if (!filtered.length) {
        detailTableBody.innerHTML = '<tr><td colspan="4" class="ibx-missing">No matching forests in this year</td></tr>';
      }
      current.forestWrap.hidden = false;
      current.searchInput.hidden = fyRows.length <= 3 && !q;
    } else if (yrRow && Array.isArray(yrRow.topForests) && yrRow.topForests.length) {
      detailTitle.textContent = `${yr} Active Forests & Regions`;
      detailTableHead.innerHTML = '<tr><th>Forest / Area</th><th>State</th><th class="num">MODIS</th><th class="num">FRP MW</th></tr>';
      const filtered = q
        ? yrRow.topForests.filter((f) => f.name.toLowerCase().includes(q) || (f.state && f.state.toLowerCase().includes(q)))
        : yrRow.topForests;
      for (const f of filtered) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${f.name}</td><td>${f.state || '—'}</td><td class="num">${f.count.toLocaleString()}</td><td class="num">${f.frpMw.toLocaleString()}</td>`;
        detailTableBody.appendChild(tr);
      }
      current.forestWrap.hidden = false;
      current.searchInput.hidden = yrRow.topForests.length <= 3 && !q;
    } else {
      current.forestWrap.hidden = true;
      current.searchInput.hidden = true;
    }
  }

  function render(scope, state) {
    const { meta } = scope;
    const country = regions.countries.find((c) => c.id === meta.countryId);
    el.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'ibx-box';
    const cap = document.createElement('div');
    cap.className = 'ibx-caption';
    const name = document.createElement('span');
    name.className = 'ibx-name';
    name.textContent = meta.name;
    const sub = document.createElement('span');
    sub.className = 'ibx-sub';
    const subLead = document.createElement('strong');
    subLead.textContent = meta.kind === 'basin' ? 'Case study' : 'Whole country';
    const subMid = document.createTextNode(meta.kind === 'basin' ? ` in ${country ? country.shortName : meta.countryId} · ` : ' · ');
    const subYear = document.createElement('strong');
    sub.append(subLead, subMid, subYear);
    cap.append(name, sub);

    const table = document.createElement('table');
    table.className = 'ibx-table';
    const tbody = document.createElement('tbody');
    const rows = rowSpecs(scope).map((spec) => {
      const tr = document.createElement('tr');
      tr.className = 'ibx-row';
      const th = document.createElement('th');
      th.scope = 'row';
      if (spec.link) {
        tr.dataset.group = 'water';
        th.textContent = 'Water';
        const td = document.createElement('td');
        td.colSpan = 2;
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'ibx-link';
        a.textContent = 'Measured in the case-study basin →';
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          store.set({ view: 'basin' });
        });
        td.appendChild(a);
        tr.append(th, td);
        tbody.appendChild(tr);
        return { spec, tr };
      }
      const v = theme.VARS[spec.id];
      tr.dataset.group = v ? v.group : 'fire';
      tr.dataset.var = spec.id;
      tr.setAttribute('role', 'button');
      tr.tabIndex = 0;
      th.textContent = v ? v.label : spec.id;
      if (spec.sub) {
        const s = document.createElement('span');
        s.className = 'ibx-sublabel';
        s.textContent = spec.sub;
        th.appendChild(s);
      }

      const tdVal = document.createElement('td');
      tdVal.className = 'ibx-value';
      const numEl = document.createElement('span');
      numEl.className = 'ibx-num';
      const unitEl = document.createElement('span');
      unitEl.className = 'ibx-unit';
      unitEl.textContent = theme.unitFor(spec.id, meta);
      const deltaEl = document.createElement('span');
      deltaEl.className = 'ibx-delta';
      const deltaValEl = document.createElement('strong');
      const deltaSuffixEl = document.createTextNode(` vs ${spec.span || `${y0}–${y1}`} median`);
      deltaEl.append(deltaValEl, deltaSuffixEl);
      tdVal.append(numEl, unitEl, deltaEl);

      const tdSpark = document.createElement('td');
      tdSpark.className = 'ibx-spark';
      const points = data.annualSeries(scope.series, spec.id, spec.wb);
      const spark = buildSparkline(points);
      tdSpark.appendChild(spark.svg);

      tr.append(th, tdVal, tdSpark);
      const focus = () => store.set({ focus: spec.id });
      tr.addEventListener('click', focus);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          focus();
        }
      });
      tbody.appendChild(tr);
      const med = data.annualMedian(scope.series, spec.id, spec.wb);
      return { spec, tr, numEl, unitEl, deltaValEl, spark, med };
    });
    table.appendChild(tbody);

    const detailEl = document.createElement('div');
    detailEl.className = 'ibx-detail';
    detailEl.hidden = true;
    const detailHead = document.createElement('div');
    detailHead.className = 'ibx-detail-head';
    const detailTitle = document.createElement('span');
    detailTitle.className = 'ibx-detail-title';
    const detailTabs = document.createElement('div');
    detailTabs.className = 'ibx-detail-tabs';
    const tabYearBtn = document.createElement('button');
    tabYearBtn.type = 'button';
    tabYearBtn.textContent = 'Selected year';
    const tabAllBtn = document.createElement('button');
    tabAllBtn.type = 'button';
    tabAllBtn.textContent = 'All 2002–2026';
    tabYearBtn.addEventListener('click', () => {
      breakdownMode = 'year';
      renderForestBreakdown(scope, Number(store.get().year));
    });
    tabAllBtn.addEventListener('click', () => {
      breakdownMode = 'all';
      renderForestBreakdown(scope, Number(store.get().year));
    });
    detailTabs.append(tabYearBtn, tabAllBtn);
    detailHead.append(detailTitle, detailTabs);

    const detailChips = document.createElement('div');
    detailChips.className = 'ibx-chips';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'ibx-search';
    searchInput.placeholder = 'Filter forests or states…';
    searchInput.value = forestFilter;
    searchInput.setAttribute('aria-label', 'Filter forests or states');
    searchInput.addEventListener('input', () => {
      forestFilter = searchInput.value;
      renderForestBreakdown(scope, Number(store.get().year));
    });

    const forestWrap = document.createElement('div');
    forestWrap.className = 'ibx-forest-wrap';
    const forestTbl = document.createElement('table');
    forestTbl.className = 'ibx-forest-tbl';
    const detailTableHead = document.createElement('thead');
    const detailTableBody = document.createElement('tbody');
    forestTbl.append(detailTableHead, detailTableBody);
    forestWrap.appendChild(forestTbl);

    detailEl.append(detailHead, detailChips, searchInput, forestWrap);

    const foot = document.createElement('div');
    foot.className = 'ibx-foot';
    foot.innerHTML = '<strong>Sources:</strong> NASA FIRMS (MODIS &amp; VIIRS), USFS National Forests, MERRA-2, MODIS-Aqua · DFO, NOAA, FAO';
    box.append(cap, table, detailEl, foot);
    el.appendChild(box);
    current = {
      scope,
      rows,
      subYear,
      detailEl,
      detailTitle,
      detailChips,
      detailTableHead,
      detailTableBody,
      tabYearBtn,
      tabAllBtn,
      searchInput,
      forestWrap,
    };
    update(state);
  }

  async function update(state) {
    if (!current) return;
    const { scope, rows, subYear } = current;
    const yr = Number(state.year);
    subYear.textContent = String(yr);
    renderForestBreakdown(scope, yr);

    let fireSummary = null;
    if (scope && scope.hasFireCsvs) {
      const fires = await data.getFires(state, yr);
      fireSummary = fires && fires.summary ? fires.summary : null;
    }
    if (!current || Number(store.get().year) !== yr) return;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.spec.link) continue;
      const { spec, tr, numEl, unitEl, deltaValEl, spark, med } = row;
      tr.classList.toggle('is-focus', state.focus === spec.id);
      let value = data.annualValue(scope.series, spec.id, yr, spec.wb);
      if (value === null && fireSummary) {
        if (spec.id === 'fire_frp' && fireSummary.totalFrpMw > 0) value = fireSummary.totalFrpMw;
        else if (spec.id === 'fire_count' && fireSummary.detections > 0) value = fireSummary.detections;
      }
      numEl.textContent = theme.fmt(value, spec.id);
      unitEl.hidden = value === null;
      deltaValEl.classList.remove('is-surge', 'is-calm');
      if (value !== null && med !== null && med !== 0) {
        const pct = ((value - med) / Math.abs(med)) * 100;
        const sign = pct >= 0 ? '+' : '−';
        deltaValEl.textContent = `${sign}${Math.abs(pct).toFixed(0)}%`;
        if (pct >= 20) deltaValEl.classList.add('is-surge');
        else if (pct <= -15) deltaValEl.classList.add('is-calm');
      } else if (spec.id === 'viirs_count' && yr < 2012) {
        deltaValEl.textContent = 'Pre-VIIRS era';
      } else if (value !== null && spec.id === 'fire_frp' && fireSummary && fireSummary.sensor) {
        deltaValEl.textContent = `${fireSummary.sensor} live`;
      } else {
        deltaValEl.textContent = '—';
      }
      if (spark.dot) {
        const pt = spark.coordsByYear.get(yr);
        if (pt) {
          spark.dot.setAttribute('cx', pt[0]);
          spark.dot.setAttribute('cy', pt[1]);
          spark.dot.style.display = '';
        } else {
          spark.dot.style.display = 'none';
        }
      }
    }
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    if (!scope || !scope.meta) {
      current = null;
      theme.placeholder(el);
      return;
    }
    render(scope, state);
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.year !== prev.year || state.focus !== prev.focus) update(state);
  });
  await build(store.get());
}

// js/data.js
// Purpose: cached loader for ./data/ (GeoJSON/JSON + streaming large-CSV adapter & grid aggregator)
//          with automatic discovery of copy-pasted csv_by_year folders, pre-indexed multi-year series,
//          dynamic before/after statistical tests, and basin bbox filtering.

import { DATA_CONFIG } from './data-config.js';

const BASE = './data/';
const cache = new Map();        // url or key -> Promise
const csvIndexCache = new Map(); // cacheKey -> Promise<Map<year, FeatureCollection>>
const csvOverrides = new Map();  // `${scopePath}:${kind}` -> string (url) | File | Blob
let regionsSync = null;

async function fetchJson(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`data: ${url} -> HTTP ${res.status}`);
          return null;
        }
        return await res.json();
      } catch (err) {
        console.warn(`data: ${url} failed (${err && err.message ? err.message : err})`);
        return null;
      }
    })());
  }
  return cache.get(url);
}

async function fetchJsonOptional(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const res = await fetch(url);
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    })());
  }
  return cache.get(url);
}

async function getManifest() {
  if (typeof fetch !== 'function') return null;
  return fetchJsonOptional(`${BASE}manifest.json`);
}

async function getScopeIndex() {
  if (typeof fetch !== 'function') return null;
  return fetchJsonOptional(`${BASE}scope-index.json`);
}

// ---- Streaming, non-blocking CSV parser & spatial aggregator for 20–60+ MB CSVs ----------------

function splitCsvRow(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// Fast zero-allocation field extractor for unquoted CSV lines (standard NASA FIRMS rows)
function fastSplit(line, out) {
  out.length = 0;
  let start = 0;
  const len = line.length;
  for (let i = 0; i < len; i += 1) {
    if (line.charCodeAt(i) === 44) {
      out.push(line.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(line.slice(start).trim());
  return out;
}

function resolveColumns(headerLine) {
  const headers = splitCsvRow(headerLine);
  const lower = headers.map((h) => h.toLowerCase().trim());
  const cols = {};
  for (const [k, aliases] of Object.entries(DATA_CONFIG.columns)) {
    let idx = -1;
    for (const alias of aliases) {
      const found = lower.indexOf(alias.toLowerCase());
      if (found >= 0) {
        idx = found;
        break;
      }
    }
    cols[k] = idx;
  }
  return { cols, headers };
}

function toNum(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || s === 'NA' || s === 'NaN' || s === 'null' || s === '-9999') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseYear(rawYear, rawDate) {
  if (rawYear !== undefined && rawYear !== '') {
    const y = Number(rawYear);
    if (Number.isInteger(y) && y >= 1900 && y <= 2100) return y;
  }
  if (rawDate) {
    const m = String(rawDate).match(/(\d{4})/);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Parse a CSV string in non-blocking chunks and invoke onRow(cells, cols, headers).
 */
export async function parseCsv(text, onRow, chunkRows = DATA_CONFIG.chunkRows) {
  if (!text) return;
  let pos = 0;
  const len = text.length;
  let cols = null;
  let headers = null;
  let count = 0;
  const rowBuf = [];

  while (pos < len) {
    let nl = text.indexOf('\n', pos);
    if (nl < 0) nl = len;
    const rawLine = text.slice(pos, nl);
    pos = nl + 1;

    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || !line.trim()) continue;

    if (!cols) {
      ({ cols, headers } = resolveColumns(line));
      continue;
    }

    const cells = line.indexOf('"') >= 0 ? splitCsvRow(line) : fastSplit(line, rowBuf);
    onRow(cells, cols, headers);
    count += 1;
    if (chunkRows > 0 && count % chunkRows === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/**
 * Stream a CSV source (URL string or File/Blob) line-by-line via ReadableStream so multi-decade
 * 20–60+ MB FIRMS files never allocate massive intermediate string arrays.
 */
async function streamCsv(source, onRow, chunkRows = DATA_CONFIG.chunkRows) {
  if (!source) return false;
  if (typeof source !== 'string') {
    if (typeof source.text === 'function') {
      await parseCsv(await source.text(), onRow, chunkRows);
      return true;
    }
    return false;
  }

  let res;
  try {
    res = await fetch(source);
  } catch {
    return false;
  }
  if (!res.ok) return false;

  if (!res.body || typeof res.body.getReader !== 'function') {
    await parseCsv(await res.text(), onRow, chunkRows);
    return true;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  let cols = null;
  let headers = null;
  let rowCount = 0;
  const rowBuf = [];

  const handleLine = (raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line || !line.trim()) return;
    if (!cols) {
      ({ cols, headers } = resolveColumns(line));
      return;
    }
    const cells = line.indexOf('"') >= 0 ? splitCsvRow(line) : fastSplit(line, rowBuf);
    onRow(cells, cols, headers);
    rowCount += 1;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = carry + decoder.decode(value, { stream: true });
    let start = 0;
    while (true) {
      const nl = chunk.indexOf('\n', start);
      if (nl < 0) break;
      handleLine(chunk.slice(start, nl));
      start = nl + 1;
      if (chunkRows > 0 && rowCount > 0 && rowCount % chunkRows === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    carry = chunk.slice(start);
  }
  carry += decoder.decode();
  if (carry.trim()) handleLine(carry);
  return true;
}

/**
 * Register a runtime CSV override (URL string or browser File/Blob) for any scope + kind ('fires'|'air'|'series').
 */
export function setCsvOverride(scope, kind, source) {
  const key = `${scope}:${kind}`;
  if (!source) csvOverrides.delete(key);
  else csvOverrides.set(key, source);
  for (const k of Array.from(csvIndexCache.keys())) {
    if (k.startsWith(`${key}:`)) csvIndexCache.delete(k);
  }
}

function selectSensorEntries(entries, year) {
  const matches = entries.filter((e) => e.year === null || e.year === year);
  if (!matches.length) return [];
  const pref = DATA_CONFIG.sensorPreference || 'viirs-first';
  if (pref === 'merge') return matches.map((e) => e.url);
  const primary = pref === 'modis-first' ? 'modis' : 'viirs';
  const secondary = primary === 'viirs' ? 'modis' : 'viirs';
  const pickedPrimary = matches.filter((e) => e.sensor === primary);
  if (pickedPrimary.length) return pickedPrimary.map((e) => e.url);
  const pickedSecondary = matches.filter((e) => e.sensor === secondary);
  if (pickedSecondary.length) return pickedSecondary.map((e) => e.url);
  return matches.map((e) => e.url);
}

async function resolveSourcesForYear(scope, kind, year) {
  const override = csvOverrides.get(`${scope}:${kind}`);
  if (override) return { sources: [override], clipBbox: null };

  const scopeCfg = DATA_CONFIG.scopes && DATA_CONFIG.scopes[scope];
  const prop = kind === 'fires' ? 'firesCsv' : kind === 'air' ? 'airCsv' : 'seriesCsv';
  if (scopeCfg && scopeCfg[prop]) {
    return { sources: [scopeCfg[prop].replace('{scope}', scope).replace('{year}', String(year))], clipBbox: null };
  }

  const manifest = await getManifest();
  if (manifest && manifest.scopes) {
    const entry = manifest.scopes[scope];
    if (kind === 'fires') {
      if (entry && Array.isArray(entry.fires) && entry.fires.length) {
        const picked = selectSensorEntries(entry.fires, year);
        if (picked.length) return { sources: picked, clipBbox: null };
      }
      // If a case-study basin has no dedicated fire CSVs, filter the parent country's CSV by basin bbox
      if (scope.includes('/')) {
        const [countryId, basinId] = scope.split('/');
        const parentEntry = manifest.scopes[countryId];
        if (parentEntry && Array.isArray(parentEntry.fires) && parentEntry.fires.length) {
          const picked = selectSensorEntries(parentEntry.fires, year);
          if (picked.length) {
            const c = countryEntry(countryId);
            const bbox = c && c.basin && c.basin.id === basinId && Array.isArray(c.basin.bbox) ? c.basin.bbox : null;
            return { sources: picked, clipBbox: bbox };
          }
        }
      }
      return { sources: [], clipBbox: null };
    }
    const direct = entry && entry[kind];
    return { sources: direct ? [direct] : [], clipBbox: null };
  }

  // Static fallback when no manifest is available
  const pat = DATA_CONFIG.patterns && DATA_CONFIG.patterns[prop];
  return {
    sources: pat ? [pat.replace('{scope}', scope).replace('{year}', String(year))] : [],
    clipBbox: null,
  };
}

async function loadSeriesCsv(sources, scope) {
  const list = Array.isArray(sources) ? sources : [sources];
  if (!list.length) return null;
  const variables = {};
  const waterBodies = {};
  const ensureVar = (bucket, id) => {
    if (!bucket[id]) bucket[id] = { annualMap: new Map(), monthlyMap: new Map() };
    return bucket[id];
  };

  let loadedAny = false;
  for (const src of list) {
    const ok = await streamCsv(src, (cells, cols) => {
      const varId = cols.variable >= 0 ? String(cells[cols.variable] || '').trim() : '';
      const val = cols.value >= 0 ? toNum(cells[cols.value]) : null;
      if (!varId || val === null) return;
      const wb = cols.waterBody >= 0 ? String(cells[cols.waterBody] || '').trim() : '';
      const bucket = wb ? (waterBodies[wb] || (waterBodies[wb] = {})) : variables;
      const target = ensureVar(bucket, varId);
      const dateRaw = cols.date >= 0 ? String(cells[cols.date] || '').trim() : '';
      const ym = dateRaw.match(/^(\d{4})-(\d{2})/);
      if (ym) {
        target.monthlyMap.set(`${ym[1]}-${ym[2]}`, val);
      } else {
        const yr = parseYear(cols.year >= 0 ? cells[cols.year] : undefined, dateRaw);
        if (yr !== null) target.annualMap.set(yr, val);
      }
    });
    if (ok) loadedAny = true;
  }

  if (!loadedAny) return null;
  const finalize = (bucket) => {
    const out = {};
    for (const [id, entry] of Object.entries(bucket)) {
      const annual = Array.from(entry.annualMap.entries()).sort((a, b) => a[0] - b[0]);
      const monthly = Array.from(entry.monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      out[id] = { annual, monthly };
    }
    return out;
  };
  const wbOut = {};
  for (const [wb, b] of Object.entries(waterBodies)) wbOut[wb] = finalize(b);
  const finalized = finalize(variables);
  if (!Object.keys(finalized).length && !Object.keys(wbOut).length) return null;
  return { scope, variables: finalized, waterBodies: wbOut };
}

function topKeyFromCounts(map) {
  let bestKey = null;
  let bestVal = -1;
  for (const [k, v] of map.entries()) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey ? { name: bestKey, value: bestVal } : null;
}

function quantileSorted(sorted, q) {
  if (!sorted.length) return null;
  const pos = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[pos];
}

async function loadSummaryData(entry, preIndexed) {
  const byYear = new Map();
  const allForests = [];

  if (preIndexed && Array.isArray(preIndexed.summaryByYear) && preIndexed.summaryByYear.length) {
    for (const row of preIndexed.summaryByYear) {
      byYear.set(row.year, { ...row });
    }
  } else if (entry && entry.summaryByYear) {
    await streamCsv(entry.summaryByYear, (cells, cols, headers) => {
      const yr = parseYear(cols.year >= 0 ? cells[cols.year] : undefined, undefined);
      if (!Number.isInteger(yr)) return;
      const idxOf = (name) => headers.findIndex((h) => h.toLowerCase() === name);
      const getN = (name) => {
        const idx = idxOf(name);
        return idx >= 0 ? (toNum(cells[idx]) ?? 0) : 0;
      };
      const modisHigh = getN('modis_high_frp');
      const modisLow = getN('modis_low_frp');
      const viirsHigh = getN('viirs_high_frp');
      const viirsLow = getN('viirs_low_frp');
      const modisTotal = getN('modis_total') || (modisHigh + modisLow);
      const viirsTotal = getN('viirs_total') || (viirsHigh + viirsLow);
      const allTotal = getN('all_total') || (modisTotal + viirsTotal);
      byYear.set(yr, {
        year: yr,
        modisHighFrp: modisHigh,
        modisLowFrp: modisLow,
        viirsHighFrp: viirsHigh,
        viirsLowFrp: viirsLow,
        modisTotal,
        viirsTotal,
        allTotal,
      });
    }, 0);
  }

  if (preIndexed && preIndexed.years) {
    for (const [yrStr, detail] of Object.entries(preIndexed.years)) {
      const yr = Number(yrStr);
      const prev = byYear.get(yr) || { year: yr, modisTotal: detail.detections, viirsTotal: 0, allTotal: detail.detections };
      byYear.set(yr, {
        ...prev,
        detections: detail.detections,
        totalFrpMw: detail.totalFrpMw,
        maxFrpMw: detail.maxFrpMw,
        meanFrpMw: detail.meanFrpMw,
        highFrpCount: detail.highFrpCount,
        lowFrpCount: detail.lowFrpCount,
        inNationalForestCount: detail.inNationalForestCount,
        otherForestCount: detail.otherForestCount,
        terraCount: detail.terraCount,
        aquaCount: detail.aquaCount,
        dayCount: detail.dayCount,
        nightCount: detail.nightCount,
        topStates: detail.topStates,
        topForests: detail.topForests,
        topNationalForests: detail.topNationalForests,
        sensor: detail.sensor,
      });
    }
  }

  if (preIndexed && Array.isArray(preIndexed.allForests) && preIndexed.allForests.length) {
    allForests.push(...preIndexed.allForests);
  } else if (entry && entry.summaryByForest) {
    await streamCsv(entry.summaryByForest, (cells, cols, headers) => {
      const idxOf = (name) => headers.findIndex((h) => h.toLowerCase() === name);
      const fIdx = cols.forest >= 0 ? cols.forest : idxOf('forest_name');
      const sIdx = cols.state >= 0 ? cols.state : idxOf('state');
      const mModis = idxOf('modis');
      const mViirs = idxOf('viirs');
      const tIdx = idxOf('total');
      const mIdx = idxOf('max_frp_mw');
      const name = fIdx >= 0 ? String(cells[fIdx] || '').trim() : '';
      const state = sIdx >= 0 ? String(cells[sIdx] || '').trim() : '';
      const modis = mModis >= 0 ? (toNum(cells[mModis]) ?? 0) : 0;
      const viirs = mViirs >= 0 ? (toNum(cells[mViirs]) ?? 0) : 0;
      const total = tIdx >= 0 ? (toNum(cells[tIdx]) ?? 0) : 0;
      const maxFrpMw = mIdx >= 0 ? (toNum(cells[mIdx]) ?? 0) : 0;
      if (name && total > 0) {
        allForests.push({ name, state, modis, viirs, total, maxFrpMw });
      }
    }, 0);
  }

  if (!byYear.size && !allForests.length && !preIndexed) return null;

  const modisTotals = Array.from(byYear.values())
    .map((d) => d.modisTotal || d.detections || d.allTotal)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const frpTotals = Array.from(byYear.values())
    .map((d) => d.totalFrpMw)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  return {
    byYear,
    allForests,
    topForests: allForests.slice(0, 15),
    forestYearsByYear: (preIndexed && preIndexed.forestYearsByYear) || {},
    viirsOutageDates: (preIndexed && preIndexed.viirsOutageDates) || [],
    viirsOutageByYear: (preIndexed && preIndexed.viirsOutageByYear) || {},
    medianTotal: quantileSorted(modisTotals, 0.5),
    p75Total: quantileSorted(modisTotals, 0.75),
    p90Total: quantileSorted(modisTotals, 0.9),
    medianFrp: quantileSorted(frpTotals, 0.5),
    p75Frp: quantileSorted(frpTotals, 0.75),
    p90Frp: quantileSorted(frpTotals, 0.9),
  };
}

// ---- Dynamic statistical helpers (for CSV-only datasets without pre-baked stats.json) -----------

function erfcApprox(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196
    + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398
    + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? ans : 2 - ans;
}

function normalCdf(z) {
  return 0.5 * erfcApprox(-z / Math.SQRT2);
}

// Accurate two-tailed p-value for Student's t using Peizer-Pratt approximation for small df
function studentTTwoTailedP(tAbs, df) {
  if (!Number.isFinite(tAbs) || !Number.isFinite(df) || df <= 0) return 1;
  if (df > 200) return 2 * (1 - normalCdf(tAbs));
  // Numerical integration of Student's t PDF tail via Simpson's rule over transformed u in [0, 1]
  // where t = tAbs + (1 - u)/u? Simpler: integrate PDF from 0 to tAbs and subtract from 0.5!
  // For tAbs > 20, use asymptotic expansion / normal approx clamped safely.
  if (tAbs === 0) return 1;
  const logGamma = (z) => {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
    let x = z;
    let y = z;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j += 1) { y += 1; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  };
  const betacf = (a, b, x) => {
    const MAXIT = 100;
    const EPS = 3e-7;
    const FPMIN = 1e-30;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m += 1) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  const a = df / 2;
  const b = 0.5;
  const x = df / (df + tAbs * tAbs);
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return Math.min(1, Math.max(0, (bt * betacf(a, b, x)) / a));
  return Math.min(1, Math.max(0, 1 - (bt * betacf(b, a, 1 - x)) / b));
}

function mannWhitneyP(xs, ys) {
  const n1 = xs.length;
  const n2 = ys.length;
  if (n1 < 2 || n2 < 2) return 1;
  const all = [
    ...xs.map((v) => ({ v, g: 0 })),
    ...ys.map((v) => ({ v, g: 1 })),
  ].sort((a, b) => a.v - b.v);
  let r1 = 0;
  let tieAdj = 0;
  let i = 0;
  while (i < all.length) {
    let j = i + 1;
    while (j < all.length && all[j].v === all[i].v) j += 1;
    const t = j - i;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) if (all[k].g === 0) r1 += avgRank;
    if (t > 1) tieAdj += t * t * t - t;
    i = j;
  }
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const n = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieAdj / (n * (n - 1))));
  if (!sigma) return 1;
  const z = Math.abs(u1 - mu) / sigma;
  return Math.min(1, Math.max(0, 2 * (1 - normalCdf(z))));
}

function welchTest(beforeVals, afterVals) {
  const n1 = beforeVals.length;
  const n2 = afterVals.length;
  if (n1 < 2 || n2 < 2) return null;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const m1 = mean(beforeVals);
  const m2 = mean(afterVals);
  const var1 = beforeVals.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1);
  const var2 = afterVals.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1);
  const se2 = var1 / n1 + var2 / n2;
  if (se2 <= 0) return { mean_before: m1, mean_after: m2, welch_t: 0, df: n1 + n2 - 2, p: 1, cohens_d: 0, mannwhitney_p: 1 };
  const t = (m2 - m1) / Math.sqrt(se2);
  const df = (se2 * se2) / (((var1 / n1) ** 2) / (n1 - 1) + ((var2 / n2) ** 2) / (n2 - 1));
  const pooled = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / Math.max(1, n1 + n2 - 2));
  const d = pooled > 0 ? (m2 - m1) / pooled : 0;
  return {
    mean_before: m1,
    mean_after: m2,
    welch_t: t,
    df,
    p: studentTTwoTailedP(Math.abs(t), df),
    cohens_d: d,
    mannwhitney_p: mannWhitneyP(beforeVals, afterVals),
  };
}

export function computeBeforeAfterStats(series, meta) {
  if (!series || !series.variables || !meta || !Array.isArray(meta.eventYears) || !meta.eventYears.length) {
    return null;
  }
  const [y0] = Array.isArray(meta.years) ? meta.years : [2002, 2026];
  const months = [5, 6, 7, 8, 9];
  const beforeAfter = [];
  const candidateVars = ['fire_frp', 'fire_count', 'aod', 'kd490', 'chlor_a'];

  for (const varId of candidateVars) {
    const wb = isWaterVar(varId) ? meta.primaryWaterBody : undefined;
    const pts = monthlySeries(series, varId, wb);
    if (!pts.length) continue;

    const byYear = new Map();
    for (const p of pts) {
      if (p.value === null) continue;
      const y = p.date.getUTCFullYear();
      const m = p.date.getUTCMonth() + 1;
      if (!months.includes(m)) continue;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(p.value);
    }

    for (const event of meta.eventYears) {
      const beforeYears = [];
      for (let y = Math.max(y0, event - 3); y < event; y += 1) {
        if (byYear.has(y)) beforeYears.push(y);
      }
      const afterYears = byYear.has(event) ? [event] : [];
      if (!beforeYears.length || !afterYears.length) continue;
      const bVals = beforeYears.flatMap((y) => byYear.get(y));
      const aVals = afterYears.flatMap((y) => byYear.get(y));
      const res = welchTest(bVals, aVals);
      if (!res) continue;
      beforeAfter.push({
        variable: varId,
        waterBody: wb || null,
        event,
        before_years: beforeYears,
        after_years: afterYears,
        months,
        n_before: bVals.length,
        n_after: aVals.length,
        ...res,
      });
    }
  }

  return beforeAfter.length ? { beforeAfter, links: [], trends: [] } : null;
}

async function loadSpatialCsvByYear(sources, kind, scope, isBasin, defaultYear, clipBbox) {
  const sourceKey = sources.map((s) => (typeof s === 'string' ? s : 'blob')).join('|');
  const bboxKey = clipBbox ? clipBbox.join(',') : '';
  const cacheKey = `${scope}:${kind}:${sourceKey}:${bboxKey}`;
  if (csvIndexCache.has(cacheKey)) return csvIndexCache.get(cacheKey);

  const promise = (async () => {
    const gridDeg = kind === 'fires'
      ? (isBasin ? DATA_CONFIG.gridDeg.basinFires : DATA_CONFIG.gridDeg.countryFires)
      : (isBasin ? DATA_CONFIG.gridDeg.basinAir : DATA_CONFIG.gridDeg.countryAir);

    const byYear = new Map();
    const statsByYear = new Map();
    const minLon = clipBbox ? clipBbox[0] : -Infinity;
    const minLat = clipBbox ? clipBbox[1] : -Infinity;
    const maxLon = clipBbox ? clipBbox[2] : Infinity;
    const maxLat = clipBbox ? clipBbox[3] : Infinity;

    const getStats = (yr, src) => {
      let s = statsByYear.get(yr);
      if (!s) {
        const lowerSrc = typeof src === 'string' ? src.toLowerCase() : '';
        const sensor = lowerSrc.includes('viirs') ? 'VIIRS' : lowerSrc.includes('modis') ? 'MODIS' : null;
        s = {
          detections: 0,
          totalFrpMw: 0,
          maxFrpMw: 0,
          highFrpCount: 0,
          lowFrpCount: 0,
          inNationalForestCount: 0,
          otherForestCount: 0,
          terraCount: 0,
          aquaCount: 0,
          dayCount: 0,
          nightCount: 0,
          sensor,
          stateCounts: new Map(),
          forestCounts: new Map(),
          nationalForestCounts: new Map(),
        };
        statsByYear.set(yr, s);
      }
      return s;
    };

    for (const src of sources) {
      await streamCsv(src, (cells, cols) => {
        const lat = cols.lat >= 0 ? toNum(cells[cols.lat]) : null;
        const lon = cols.lon >= 0 ? toNum(cells[cols.lon]) : null;
        if (lat === null || lon === null) return;
        if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) return;

        const yr = parseYear(
          cols.year >= 0 ? cells[cols.year] : undefined,
          cols.date >= 0 ? cells[cols.date] : undefined,
        ) ?? defaultYear;
        if (!Number.isInteger(yr)) return;

        let yearMap = byYear.get(yr);
        if (!yearMap) {
          yearMap = new Map();
          byYear.set(yr, yearMap);
        }

        const snapLat = gridDeg > 0 ? Math.floor(lat / gridDeg) * gridDeg + gridDeg / 2 : lat;
        const snapLon = gridDeg > 0 ? Math.floor(lon / gridDeg) * gridDeg + gridDeg / 2 : lon;
        const key = `${snapLon.toFixed(4)},${snapLat.toFixed(4)}`;

        if (kind === 'fires') {
          const count = cols.count >= 0 ? (toNum(cells[cols.count]) ?? 1) : 1;
          const frp = cols.frp >= 0 ? (toNum(cells[cols.frp]) ?? 0) : 0;
          const dateStr = cols.date >= 0 ? (cells[cols.date] || `${yr}-07-01`) : `${yr}-07-01`;
          const frpClass = cols.frpClass >= 0 ? String(cells[cols.frpClass] || '').trim().toLowerCase() : '';
          const isHighFrp = frpClass === 'high';
          const inNf = cols.inNationalForest >= 0 ? String(cells[cols.inNationalForest] || '').trim().toLowerCase() === 'true' : false;
          const sat = cols.satellite >= 0 ? String(cells[cols.satellite] || '').trim().toLowerCase() : '';
          const dn = cols.dayNight >= 0 ? String(cells[cols.dayNight] || '').trim().toLowerCase() : '';
          const stateName = cols.state >= 0 ? String(cells[cols.state] || '').trim() : '';
          const fName = cols.forest >= 0 ? String(cells[cols.forest] || '').trim() : '';

          const cur = yearMap.get(key);
          if (!cur) {
            yearMap.set(key, {
              lon: snapLon,
              lat: snapLat,
              count,
              frp_sum: frp,
              max_frp: frp,
              high_frp: isHighFrp ? count : 0,
              first: dateStr,
              last: dateStr,
              state: stateName,
              forest: fName,
            });
          } else {
            cur.count += count;
            cur.frp_sum += frp;
            if (frp > cur.max_frp) {
              cur.max_frp = frp;
              if (stateName) cur.state = stateName;
              if (fName) cur.forest = fName;
            }
            if (isHighFrp) cur.high_frp += count;
            if (dateStr < cur.first) cur.first = dateStr;
            if (dateStr > cur.last) cur.last = dateStr;
          }

          const st = getStats(yr, src);
          st.detections += count;
          st.totalFrpMw += frp;
          if (frp > st.maxFrpMw) st.maxFrpMw = frp;
          if (isHighFrp) st.highFrpCount += count;
          else if (frpClass === 'low') st.lowFrpCount += count;
          if (inNf) st.inNationalForestCount += count;
          else st.otherForestCount += count;
          if (sat === 'terra') st.terraCount += count;
          else if (sat === 'aqua') st.aquaCount += count;
          if (dn === 'day') st.dayCount += count;
          else if (dn === 'night') st.nightCount += count;

          if (stateName) st.stateCounts.set(stateName, (st.stateCounts.get(stateName) || 0) + count);
          if (fName) {
            st.forestCounts.set(fName, (st.forestCounts.get(fName) || 0) + count);
            if (inNf || !fName.startsWith('Other forest land')) {
              st.nationalForestCounts.set(fName, (st.nationalForestCounts.get(fName) || 0) + count);
            }
          }
        } else {
          const aod = cols.aod >= 0 ? toNum(cells[cols.aod]) : null;
          const pm25 = cols.pm25 >= 0 ? toNum(cells[cols.pm25]) : null;
          if (aod === null && pm25 === null) return;
          const cur = yearMap.get(key);
          if (!cur) {
            yearMap.set(key, { lon: snapLon, lat: snapLat, aodSum: aod ?? 0, aodN: aod !== null ? 1 : 0, pmSum: pm25 ?? 0, pmN: pm25 !== null ? 1 : 0 });
          } else {
            if (aod !== null) { cur.aodSum += aod; cur.aodN += 1; }
            if (pm25 !== null) { cur.pmSum += pm25; cur.pmN += 1; }
          }
        }
      });
    }

    const collections = new Map();
    for (const [yr, yearMap] of byYear.entries()) {
      const features = [];
      for (const item of yearMap.values()) {
        if (kind === 'fires') {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
            properties: {
              count: Math.round(item.count),
              frp_sum: Number(item.frp_sum.toFixed(1)),
              max_frp: Number(item.max_frp.toFixed(1)),
              high_frp: Math.round(item.high_frp),
              first: item.first,
              last: item.last,
              state: item.state || undefined,
              forest: item.forest || undefined,
            },
          });
        } else {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
            properties: {
              aod: item.aodN ? Number((item.aodSum / item.aodN).toFixed(4)) : 0,
              pm25: item.pmN ? Number((item.pmSum / item.pmN).toFixed(2)) : null,
            },
          });
        }
      }
      const st = statsByYear.get(yr);
      const summary = st ? {
        detections: Math.round(st.detections),
        totalFrpMw: Math.round(st.totalFrpMw),
        maxFrpMw: Math.round(st.maxFrpMw),
        highFrpCount: Math.round(st.highFrpCount),
        lowFrpCount: Math.round(st.lowFrpCount),
        inNationalForestCount: Math.round(st.inNationalForestCount),
        otherForestCount: Math.round(st.otherForestCount),
        terraCount: Math.round(st.terraCount),
        aquaCount: Math.round(st.aquaCount),
        dayCount: Math.round(st.dayCount),
        nightCount: Math.round(st.nightCount),
        sensor: st.sensor,
        topState: topKeyFromCounts(st.stateCounts),
        topForest: topKeyFromCounts(st.forestCounts),
        topNationalForest: topKeyFromCounts(st.nationalForestCounts),
      } : null;
      collections.set(yr, { type: 'FeatureCollection', scope, year: yr, gridDeg, features, summary });
    }
    return collections;
  })();

  csvIndexCache.set(cacheKey, promise);
  return promise;
}

// ---- Public API ---------------------------------------------------------------------------------

/** Parsed data/regions.json (or null). */
export async function getRegions() {
  const regions = await fetchJson(`${BASE}regions.json`);
  if (regions && !regionsSync) regionsSync = regions;
  return regions;
}

export function regionsCached() {
  return regionsSync;
}

function countryEntry(countryId, regions = regionsSync) {
  if (!regions || !Array.isArray(regions.countries)) return null;
  return regions.countries.find((c) => c.id === countryId) || null;
}

export function scopePath(state) {
  const country = countryEntry(state.countryId);
  if (state.view === 'basin' && country && country.basin && country.basin.id) {
    return `${state.countryId}/${country.basin.id}`;
  }
  return state.countryId;
}

export function buildMeta(country, view, regions) {
  const common = { years: regions.years };
  if (view === 'basin' && country.basin) {
    const b = country.basin;
    return {
      kind: 'basin', id: b.id, countryId: country.id, name: b.name, shortName: b.shortName,
      bbox: b.bbox, camera: b.camera, eventYears: b.eventYears, fishMetric: b.fishMetric,
      currency: b.currency, primaryWaterBody: b.primaryWaterBody, waterBodies: b.waterBodies || [],
      basin: null, path: `${country.id}/${b.id}`, ...common,
    };
  }
  return {
    kind: 'country', id: country.id, countryId: country.id, name: country.name, shortName: country.shortName,
    bbox: country.bbox, camera: country.camera, eventYears: country.eventYears, fishMetric: country.fishMetric,
    currency: country.currency, primaryWaterBody: null, waterBodies: [],
    basin: country.basin ? { id: country.basin.id, name: country.basin.name, shortName: country.basin.shortName } : null,
    path: country.id, ...common,
  };
}

export async function getScope(state) {
  const regions = await getRegions();
  const country = countryEntry(state.countryId, regions);
  if (!country) return null;
  const view = state.view === 'basin' && country.basin ? 'basin' : 'country';
  const path = view === 'basin' ? `${country.id}/${country.basin.id}` : country.id;
  const key = `scope:${path}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const csvOnly = DATA_CONFIG.mode === 'csv';
      const [resolvedSeries, manifest, scopeIndex] = await Promise.all([
        DATA_CONFIG.mode !== 'geojson' ? resolveSourcesForYear(path, 'series', '') : Promise.resolve({ sources: [] }),
        getManifest(),
        DATA_CONFIG.mode !== 'geojson' ? getScopeIndex() : Promise.resolve(null),
      ]);
      const mEntry = manifest && manifest.scopes ? manifest.scopes[path] : null;
      const preIndexed = scopeIndex && scopeIndex.scopes ? scopeIndex.scopes[path] : null;
      const [geo, rivers, seriesJson, statsJson, seriesFromCsv, summary] = await Promise.all([
        fetchJson(`${BASE}${path}/geo.geojson`),
        fetchJson(`${BASE}${path}/rivers.geojson`),
        csvOnly ? Promise.resolve(null) : fetchJson(`${BASE}${path}/series.json`),
        csvOnly ? Promise.resolve(null) : fetchJson(`${BASE}${path}/stats.json`),
        resolvedSeries.sources.length ? loadSeriesCsv(resolvedSeries.sources, path) : Promise.resolve(null),
        DATA_CONFIG.mode !== 'geojson' ? loadSummaryData(mEntry, preIndexed) : Promise.resolve(null),
      ]);

      const meta = buildMeta(country, view, regions);
      const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2002, 2026];
      const filterByYears = (pairs) => (pairs || []).filter(([yr]) => Number(yr) >= y0 && Number(yr) <= y1);
      const filterMonthlyByYears = (pairs) => (pairs || []).filter(([ym]) => {
        const yr = Number(String(ym).slice(0, 4));
        return yr >= y0 && yr <= y1;
      });

      let mergedSeries = seriesFromCsv || seriesJson;
      if (preIndexed && preIndexed.series) {
        if (!mergedSeries) mergedSeries = { scope: path, variables: {}, waterBodies: {} };
        if (!mergedSeries.variables.fire_count && preIndexed.series.fire_count) {
          mergedSeries.variables.fire_count = {
            annual: filterByYears(preIndexed.series.fire_count.annual),
            monthly: filterMonthlyByYears(preIndexed.series.fire_count.monthly),
          };
        }
        if (!mergedSeries.variables.fire_frp && preIndexed.series.fire_frp) {
          mergedSeries.variables.fire_frp = {
            annual: filterByYears(preIndexed.series.fire_frp.annual),
            monthly: filterMonthlyByYears(preIndexed.series.fire_frp.monthly),
          };
        }
      }

      if (summary && summary.byYear && summary.byYear.size) {
        if (!mergedSeries) mergedSeries = { scope: path, variables: {}, waterBodies: {} };
        const rows = Array.from(summary.byYear.values())
          .filter((r) => r.year >= y0 && r.year <= y1)
          .sort((a, b) => a.year - b.year);
        if (!mergedSeries.variables.fire_count) {
          const annual = rows
            .map((r) => [r.year, r.modisTotal || r.detections || r.allTotal])
            .filter(([, v]) => v > 0);
          if (annual.length) mergedSeries.variables.fire_count = { annual, monthly: [] };
        }
        if (!mergedSeries.variables.viirs_count) {
          const viirsAnnual = rows
            .filter((r) => r.viirsTotal > 0)
            .map((r) => [r.year, r.viirsTotal]);
          if (viirsAnnual.length) mergedSeries.variables.viirs_count = { annual: viirsAnnual, monthly: [] };
        }
      }

      const stats = statsJson || computeBeforeAfterStats(mergedSeries, meta);
      const fireEntries = mEntry && Array.isArray(mEntry.fires)
        ? mEntry.fires
        : (view === 'basin' && manifest && manifest.scopes && manifest.scopes[country.id] && manifest.scopes[country.id].fires) || [];
      return {
        meta,
        geo,
        rivers,
        series: mergedSeries,
        stats,
        summary,
        hasFireCsvs: fireEntries.length > 0,
      };
    })());
  }
  return cache.get(key);
}

/** Load accurate 50m country borders (falls back cleanly to 50m data/<country>/geo.geojson). */
export async function getAllCountriesGeo() {
  const regions = await getRegions();
  if (!regions || !Array.isArray(regions.countries)) return [];
  const bordersFc = (await fetchJsonOptional('./country-borders.geojson'))
    || (await fetchJsonOptional('./public/country-borders.geojson'));
  if (bordersFc && Array.isArray(bordersFc.features) && bordersFc.features.length) {
    const byId = new Map();
    for (const f of bordersFc.features) {
      const id = f && f.properties && f.properties.id;
      if (id) byId.set(id, f);
    }
    const accurate = regions.countries
      .map((c) => {
        const feat = byId.get(c.id);
        if (!feat) return null;
        return {
          country: c,
          geo: {
            type: 'FeatureCollection',
            features: [{ ...feat, properties: { ...feat.properties, kind: 'country' } }],
          },
        };
      })
      .filter(Boolean);
    if (accurate.length === regions.countries.length) return accurate;
  }
  const list = await Promise.all(regions.countries.map(async (c) => {
    const geo = await fetchJson(`${BASE}${c.id}/geo.geojson`);
    return { country: c, geo };
  }));
  return list.filter((x) => x.geo && Array.isArray(x.geo.features));
}

async function yearLayer(state, folder, year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return null;
  const scope = scopePath(state);
  const isBasin = scope.includes('/');

  if (DATA_CONFIG.mode !== 'geojson') {
    const { sources, clipBbox } = await resolveSourcesForYear(scope, folder, y);
    if (sources.length) {
      const indexed = await loadSpatialCsvByYear(sources, folder, scope, isBasin, y, clipBbox);
      if (indexed && indexed.has(y)) return indexed.get(y);
    }
    if (DATA_CONFIG.mode === 'csv') return { type: 'FeatureCollection', scope, year: y, features: [] };
  }
  return fetchJson(`${BASE}${scope}/${folder}/${y}.geojson`);
}

export function getFires(state, year) {
  return yearLayer(state, 'fires', year);
}

export function getAir(state, year) {
  return yearLayer(state, 'air', year);
}

export function isWaterVar(varId) {
  return varId === 'kd490' || varId === 'chlor_a';
}

function pickVariable(series, varId, waterBodyId) {
  if (!series || !varId) return null;
  if (isWaterVar(varId)) {
    if (!waterBodyId || !series.waterBodies) return null;
    const body = series.waterBodies[waterBodyId];
    return body && body[varId] ? body[varId] : null;
  }
  return series.variables && series.variables[varId] ? series.variables[varId] : null;
}

function num(v) {
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

const seriesIndexCache = new WeakMap();

function getIndexedVariable(series, varId, waterBodyId) {
  const v = pickVariable(series, varId, waterBodyId);
  if (!v) return null;
  let perSeries = seriesIndexCache.get(series);
  if (!perSeries) {
    perSeries = new Map();
    seriesIndexCache.set(series, perSeries);
  }
  const key = `${waterBodyId || ''}:${varId}`;
  let entry = perSeries.get(key);
  if (entry) return entry;

  const annual = Array.isArray(v.annual)
    ? v.annual.map(([year, value]) => ({ year: Number(year), value: num(value) }))
    : [];
  const annualMap = new Map();
  const valid = [];
  for (let i = 0; i < annual.length; i += 1) {
    annualMap.set(annual[i].year, annual[i].value);
    if (annual[i].value !== null) valid.push(annual[i].value);
  }
  valid.sort((a, b) => a - b);
  let median = null;
  if (valid.length) {
    const mid = valid.length >> 1;
    median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  }
  const monthly = Array.isArray(v.monthly)
    ? v.monthly.map(([month, value]) => {
      const [y, m] = String(month).split('-').map(Number);
      return { date: new Date(Date.UTC(y, (m || 1) - 1, 1)), month: String(month), value: num(value) };
    })
    : [];

  entry = { annual, annualMap, monthly, median };
  perSeries.set(key, entry);
  return entry;
}

export function annualSeries(series, varId, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  return entry ? entry.annual : [];
}

export function monthlySeries(series, varId, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  return entry ? entry.monthly : [];
}

export function annualValue(series, varId, year, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  if (!entry) return null;
  const val = entry.annualMap.get(Number(year));
  return val === undefined ? null : val;
}

export function annualMedian(series, varId, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  return entry ? entry.median : null;
}

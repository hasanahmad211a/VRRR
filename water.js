// js/map/water.js
// Purpose: rivers rendered with a data-driven blue-to-purple pollution gradient
//          (low = blue, high = purple) plus basin water box with hover/click tooltips.

const EMPTY = { type: 'FeatureCollection', features: [] };
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;
const WIDTH = ['interpolate', ['linear'], ['get', 'order'], 1, 0.7, 4, 1.25, 6, 2.0, 9, 3.4];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sampleLine(coords, maxSamples = 5) {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  if (coords.length <= maxSamples) return coords;
  const out = [];
  const step = (coords.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples; i += 1) out.push(coords[Math.round(i * step)]);
  return out;
}

function extractSamples(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return sampleLine(geometry.coordinates, 7);
  if (geometry.type === 'MultiLineString') {
    const pts = [];
    for (const line of geometry.coordinates || []) {
      for (const p of sampleLine(line, 4)) pts.push(p);
    }
    return pts.length > 10 ? sampleLine(pts, 10) : pts;
  }
  return [];
}

function featureCentroid(f) {
  if (!f || !f.geometry) return null;
  if (f.geometry.type === 'Point') return f.geometry.coordinates;
  const ring = f.geometry.type === 'Polygon'
    ? f.geometry.coordinates[0]
    : f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates[0] && f.geometry.coordinates[0][0]
      : null;
  if (!ring || !ring.length) return null;
  let sx = 0;
  let sy = 0;
  const len = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < len; i += 1) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return len ? [sx / len, sy / len] : null;
}

export function prepareRivers(rivers) {
  if (!rivers || !Array.isArray(rivers.features)) return [];
  const prepared = [];
  for (const f of rivers.features) {
    const samples = extractSamples(f.geometry);
    if (!samples.length) continue;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of samples) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const cosLat = Math.max(0.18, Math.cos(((minLat + maxLat) * 0.5) * (Math.PI / 180)));
    prepared.push({ feature: f, samples, minLon, maxLon, minLat, maxLat, cosLat });
  }
  return prepared;
}

export function scoreRiversForYear({ preparedRivers, fires, air, isBasin = false, kdNorm = null }) {
  if (!Array.isArray(preparedRivers) || preparedRivers.length === 0) return EMPTY;

  const firePts = [];
  if (fires && Array.isArray(fires.features)) {
    for (const f of fires.features) {
      const c = featureCentroid(f);
      if (!c) continue;
      const p = f.properties || {};
      const frp = Number(p.frp_sum);
      const count = Number(p.count);
      firePts.push({
        lon: c[0],
        lat: c[1],
        power: (Number.isFinite(frp) && frp > 0 ? frp : 0) + (Number.isFinite(count) && count > 0 ? count * 4 : 0),
      });
    }
  }

  const airPts = [];
  if (air && Array.isArray(air.features)) {
    for (const f of air.features) {
      const c = featureCentroid(f);
      if (!c) continue;
      const p = f.properties || {};
      const aod = Number(p.aod);
      const pm25 = p.pm25 === null || p.pm25 === undefined ? NaN : Number(p.pm25);
      airPts.push({
        lon: c[0],
        lat: c[1],
        aod: Number.isFinite(aod) ? aod : 0,
        pm25: Number.isFinite(pm25) ? pm25 : null,
      });
    }
  }

  const fireRadiusKm = isBasin ? 45 : 95;
  const fireHalfKm = isBasin ? 18 : 38;
  const airRadiusKm = isBasin ? 85 : 175;
  const airHalfKm = isBasin ? 40 : 85;
  const fireLatPad = fireRadiusKm / KM_PER_DEG_LAT;
  const airLatPad = airRadiusKm / KM_PER_DEG_LAT;
  const frpScale = isBasin ? 3200 : 28000;
  const kdBoost = isBasin && kdNorm !== null && Number.isFinite(kdNorm) ? (kdNorm - 0.4) * 0.22 : 0;

  const features = new Array(preparedRivers.length);
  for (let i = 0; i < preparedRivers.length; i += 1) {
    const r = preparedRivers[i];
    const samples = r.samples;
    const kmPerLon = KM_PER_DEG_LON * r.cosLat;
    const fireLonPad = fireRadiusKm / kmPerLon;
    const airLonPad = airRadiusKm / kmPerLon;

    let peakFireScore = 0;
    const fireMinLon = r.minLon - fireLonPad;
    const fireMaxLon = r.maxLon + fireLonPad;
    const fireMinLat = r.minLat - fireLatPad;
    const fireMaxLat = r.maxLat + fireLatPad;

    for (let s = 0; s < samples.length; s += 1) {
      const [sx, sy] = samples[s];
      let localPower = 0;
      for (let j = 0; j < firePts.length; j += 1) {
        const fp = firePts[j];
        if (fp.lon < fireMinLon || fp.lon > fireMaxLon || fp.lat < fireMinLat || fp.lat > fireMaxLat) continue;
        const dx = (fp.lon - sx) * kmPerLon;
        const dy = (fp.lat - sy) * KM_PER_DEG_LAT;
        const d2 = dx * dx + dy * dy;
        if (d2 > fireRadiusKm * fireRadiusKm) continue;
        localPower += fp.power / (1 + d2 / (fireHalfKm * fireHalfKm));
      }
      if (localPower > peakFireScore) peakFireScore = localPower;
    }

    const fireNorm = peakFireScore > 0 ? clamp(Math.log1p(peakFireScore / frpScale) / Math.log1p(4.5), 0, 1) : 0;

    let airWeightedSum = 0;
    let airWeightTotal = 0;
    const airMinLon = r.minLon - airLonPad;
    const airMaxLon = r.maxLon + airLonPad;
    const airMinLat = r.minLat - airLatPad;
    const airMaxLat = r.maxLat + airLatPad;

    for (let s = 0; s < samples.length; s += 1) {
      const [sx, sy] = samples[s];
      for (let j = 0; j < airPts.length; j += 1) {
        const ap = airPts[j];
        if (ap.lon < airMinLon || ap.lon > airMaxLon || ap.lat < airMinLat || ap.lat > airMaxLat) continue;
        const dx = (ap.lon - sx) * kmPerLon;
        const dy = (ap.lat - sy) * KM_PER_DEG_LAT;
        const d2 = dx * dx + dy * dy;
        if (d2 > airRadiusKm * airRadiusKm) continue;
        const w = 1 / (1 + d2 / (airHalfKm * airHalfKm));
        const aodExcess = clamp((ap.aod - 0.075) / 0.24, 0, 1);
        const pmExcess = ap.pm25 !== null ? clamp((ap.pm25 - 5) / 22, 0, 1) : aodExcess;
        airWeightedSum += (0.65 * aodExcess + 0.35 * pmExcess) * w;
        airWeightTotal += w;
      }
    }

    const airNorm = airWeightTotal > 0 ? clamp(airWeightedSum / airWeightTotal, 0, 1) : 0;
    const raw = 0.64 * fireNorm + 0.36 * airNorm + kdBoost;
    const pollution = raw <= 0.08 ? 0 : Number(clamp((raw - 0.08) / 0.78, 0, 1).toFixed(3));

    features[i] = {
      type: 'Feature',
      geometry: r.feature.geometry,
      properties: { ...(r.feature.properties || {}), pollution },
    };
  }

  let moderateCount = 0;
  let highCount = 0;
  let maxPollution = 0;
  let worstRiverName = null;
  for (let i = 0; i < features.length; i += 1) {
    const p = features[i].properties;
    const val = p.pollution || 0;
    if (val >= 0.3) moderateCount += 1;
    if (val >= 0.65) highCount += 1;
    if (val > maxPollution) {
      maxPollution = val;
      worstRiverName = p.name || null;
    }
  }

  return {
    type: 'FeatureCollection',
    features,
    summary: {
      totalRivers: features.length,
      elevatedRivers: moderateCount,
      highRiskRivers: highCount,
      maxExposurePct: Math.round(maxPollution * 100),
      worstRiverName,
    },
  };
}

export function addLayer(map, ctx) {
  const { data, theme } = ctx;
  const { COLORS, fmt } = theme;
  map.addSource('water-rivers', { type: 'geojson', data: EMPTY, attribution: 'Rivers: Natural Earth, HydroSHEDS' });
  map.addSource('water-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'water-box',
    type: 'fill',
    source: 'water-geo',
    filter: ['==', ['get', 'kind'], 'water'],
    paint: { 'fill-color': COLORS.water, 'fill-opacity': 0.3 },
  });
  map.addLayer({
    id: 'water-box-line',
    type: 'line',
    source: 'water-geo',
    filter: ['==', ['get', 'kind'], 'water'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.water, 'line-width': 1.4 },
  });
  map.addLayer({
    id: 'water-rivers-casing',
    type: 'line',
    source: 'water-rivers',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': 'rgba(255, 255, 255, 0.72)',
      'line-width': ['+', WIDTH, ['*', ['coalesce', ['get', 'pollution'], 0], 1.5], 1.2],
    },
  });
  map.addLayer({
    id: 'water-rivers',
    type: 'line',
    source: 'water-rivers',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'pollution'], 0],
        0.0, COLORS.river,
        0.26, '#5B8FD9',
        0.52, '#6A58B7',
        0.78, COLORS.polluted,
      ],
      'line-width': ['+', WIDTH, ['*', ['coalesce', ['get', 'pollution'], 0], 1.5]],
      'line-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'pollution'], 0], 0, 0.88, 1, 1],
    },
  });

  const popup = new window.maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 6 });
  let info = {};
  let lastScopeKey = null;
  let lastBoxes = [];
  let preparedRivers = [];
  let scoredByYear = new Map();

  map.on('click', 'water-box', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const i = info[f.properties.id] || { name: f.properties.name, kd: null, chl: null };
    popup.setLngLat(e.lngLat).setHTML(`<strong>${i.name}</strong><br>Kd490 ${fmt(i.kd, 'kd490')} m⁻¹ · Chl-a ${fmt(i.chl, 'chlor_a')} mg/m³<br>`
      + `<span style="opacity:.75">Satellite average over this box</span>`).addTo(map);
  });
  map.on('mouseenter', 'water-box', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'water-box', () => { map.getCanvas().style.cursor = ''; });
  map.on('mousemove', 'water-rivers', (e) => {
    const f = e.features && e.features[0];
    if (!f || !f.properties || !f.properties.name) return;
    const pct = Math.round((Number(f.properties.pollution) || 0) * 100);
    const tier = pct >= 65 ? 'high' : pct >= 30 ? 'moderate' : 'low';
    map.getCanvas().title = `${f.properties.name} · ${pct}% wildfire/smoke exposure (${tier})`;
  });
  map.on('mouseleave', 'water-rivers', () => { map.getCanvas().title = ''; });

  return {
    update(state, payload) {
      const scope = payload && payload.scope;
      const scopeKey = scope && scope.meta ? scope.meta.path : null;
      const isBasin = !!(scope && scope.meta && scope.meta.kind === 'basin');

      if (scopeKey !== lastScopeKey) {
        lastScopeKey = scopeKey;
        const geo = scope && scope.geo && Array.isArray(scope.geo.features) ? scope.geo : EMPTY;
        lastBoxes = geo.features.filter((f) => f.properties && f.properties.kind === 'water');
        map.getSource('water-geo').setData({ type: 'FeatureCollection', features: lastBoxes });
        const rivers = scope && scope.rivers && Array.isArray(scope.rivers.features) ? scope.rivers : EMPTY;
        preparedRivers = prepareRivers(rivers);
        scoredByYear = new Map();
      }

      info = {};
      let kdNormAvg = null;
      if (lastBoxes.length && scope && scope.series) {
        const match = ['match', ['get', 'id']];
        let kdSum = 0;
        let kdCount = 0;
        for (const f of lastBoxes) {
          const id = f.properties.id;
          const annual = data.annualSeries(scope.series, 'kd490', id);
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = 0; i < annual.length; i += 1) {
            const v = annual[i].value;
            if (v !== null) {
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          }
          const kd = data.annualValue(scope.series, 'kd490', state.year, id);
          const chl = data.annualValue(scope.series, 'chlor_a', state.year, id);
          info[id] = { name: f.properties.name, kd, chl };
          const t = kd === null || !Number.isFinite(lo) || hi === lo ? 0.5 : (kd - lo) / (hi - lo);
          kdSum += t;
          kdCount += 1;
          match.push(id, 0.15 + 0.6 * t);
        }
        if (kdCount > 0) kdNormAvg = kdSum / kdCount;
        match.push(0.3);
        map.setPaintProperty('water-box', 'fill-opacity', match);
      } else {
        map.setPaintProperty('water-box', 'fill-opacity', 0.3);
      }

      const yr = Number(state.year);
      let scored = scoredByYear.get(yr);
      if (!scored) {
        scored = scoreRiversForYear({
          preparedRivers,
          fires: payload && payload.fires,
          air: payload && payload.air,
          isBasin,
          kdNorm: kdNormAvg,
        });
        scoredByYear.set(yr, scored);
      }
      map.getSource('water-rivers').setData(scored);
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ember:rivers-scored', {
          detail: { scope: scopeKey, year: yr, summary: scored.summary || null },
        }));
      }
      popup.remove();
    },
  };
}

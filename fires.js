// js/map/fires.js
// Purpose: wildfire dots sorted ascending by detection density per 5 km^2 with translucent
//          yellow-to-red layering and subtle GPU-interpolated ember breathing animation.

const EMPTY = { type: 'FeatureCollection', features: [] };
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;
const enrichedCache = new WeakMap();

export function cellAreaKm2(lat, deg = 0.5) {
  const cosLat = Math.max(0.15, Math.cos((Number(lat) || 0) * (Math.PI / 180)));
  return (deg * KM_PER_DEG_LAT) * (deg * KM_PER_DEG_LON * cosLat);
}

/**
 * Compute detections per 5 km^2 for every fire cell and sort ascending by density
 * so higher-density red hotspots render cleanly on top of lower-density yellow dots.
 */
export function enrichAndSortFires(fires, { isBasin = false, gridDeg = null } = {}) {
  if (!fires || !Array.isArray(fires.features) || fires.features.length === 0) {
    return EMPTY;
  }
  const deg = gridDeg || (isBasin ? 0.1 : 0.5);
  let perDeg = enrichedCache.get(fires);
  if (!perDeg) {
    perDeg = new Map();
    enrichedCache.set(fires, perDeg);
  }
  if (perDeg.has(deg)) return perDeg.get(deg);

  const features = new Array(fires.features.length);
  let peakDensity5km2 = 0;
  let elevatedCells = 0;
  let extremeCells = 0;
  let totalCount = 0;
  let totalFrp = 0;

  for (let i = 0; i < fires.features.length; i += 1) {
    const f = fires.features[i];
    const coords = f && f.geometry && f.geometry.coordinates;
    const lat = Array.isArray(coords) ? Number(coords[1]) : 0;
    const props = f.properties || {};
    const count = Math.max(0, Number(props.count) || 0);
    const frp = Math.max(0, Number(props.frp_sum) || 0);
    const area = cellAreaKm2(lat, deg);
    const density = area > 0 ? Number((count / (area / 5)).toFixed(2)) : 0;
    totalCount += count;
    totalFrp += frp;
    if (density > peakDensity5km2) peakDensity5km2 = density;
    if (density >= 2.0) elevatedCells += 1;
    if (density >= 4.25) extremeCells += 1;
    features[i] = {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        ...props,
        density_5km2: density,
      },
    };
  }

  features.sort((a, b) => a.properties.density_5km2 - b.properties.density_5km2);
  const out = {
    type: 'FeatureCollection',
    features,
    summary: {
      ...(fires.summary || {}),
      activeCells: features.length,
      peakDensity5km2,
      elevatedCells,
      extremeCells,
      detections: (fires.summary && fires.summary.detections) || Math.round(totalCount),
      totalFrpMw: (fires.summary && fires.summary.totalFrpMw) || Math.round(totalFrp),
    },
  };
  perDeg.set(deg, out);
  return out;
}

const DENSITY_COLOR = [
  'interpolate', ['linear'], ['coalesce', ['get', 'density_5km2'], 0],
  0.03, '#FACC15',
  0.18, '#F59E0B',
  0.65, '#EA580C',
  2.20, '#DC2626',
  6.00, '#991B1B',
];

function radius(k) {
  const s = ['sqrt', ['max', 1, ['get', 'count']]];
  const at = (f) => ['+', 1.4, ['*', f * k, s]];
  return ['interpolate', ['linear'], ['zoom'], 1, at(0.24), 3, at(0.42), 6, at(0.75), 9, at(1.25)];
}

export function addLayer(map, ctx) {
  const { fmt } = ctx.theme;
  map.addSource('fires-src', { type: 'geojson', data: EMPTY, attribution: 'Fires: NASA FIRMS MODIS/VIIRS' });

  map.addLayer({
    id: 'fires-glow',
    type: 'circle',
    source: 'fires-src',
    layout: {
      'circle-sort-key': ['coalesce', ['get', 'density_5km2'], 0],
    },
    paint: {
      'circle-color': DENSITY_COLOR,
      'circle-blur': 1.15,
      'circle-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'density_5km2'], 0], 0.02, 0.1, 0.5, 0.16, 4.0, 0.24],
      'circle-radius': radius(2.1),
      'circle-opacity-transition': { duration: 1050, delay: 0 },
      'circle-radius-transition': { duration: 1050, delay: 0 },
    },
  });

  map.addLayer({
    id: 'fires-dot',
    type: 'circle',
    source: 'fires-src',
    layout: {
      'circle-sort-key': ['coalesce', ['get', 'density_5km2'], 0],
    },
    paint: {
      'circle-color': DENSITY_COLOR,
      'circle-radius': radius(0.98),
      'circle-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'density_5km2'], 0], 0.02, 0.42, 0.5, 0.6, 4.0, 0.8],
      'circle-stroke-width': 0,
      'circle-opacity-transition': { duration: 360, delay: 0 },
      'circle-radius-transition': { duration: 1050, delay: 0 },
    },
  });

  // Subtle GPU-interpolated ember pulse (~1.1s cycle), disabled when reduced motion is requested
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pulseHigh = false;
  let pulseTimer = null;
  if (!reducedMotion) {
    pulseTimer = setInterval(() => {
      if (document.hidden || !map.getLayer('fires-glow')) return;
      pulseHigh = !pulseHigh;
      map.setPaintProperty('fires-glow', 'circle-opacity', pulseHigh
        ? ['interpolate', ['linear'], ['coalesce', ['get', 'density_5km2'], 0], 0.02, 0.13, 0.5, 0.2, 4.0, 0.28]
        : ['interpolate', ['linear'], ['coalesce', ['get', 'density_5km2'], 0], 0.02, 0.09, 0.5, 0.15, 4.0, 0.21]);
      map.setPaintProperty('fires-glow', 'circle-radius', radius(pulseHigh ? 2.35 : 2.05));
      map.setPaintProperty('fires-dot', 'circle-radius', radius(pulseHigh ? 1.03 : 0.96));
    }, 1150);
    map.on('remove', () => clearInterval(pulseTimer));
  }

  const popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  map.on('mouseenter', 'fires-dot', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties;
    const dens = Number(p.density_5km2 || 0).toFixed(2);
    const locParts = [p.forest, p.state].filter(Boolean);
    const locLine = locParts.length ? `<br>${locParts.join(' · ')}` : '';
    const highLine = Number(p.high_frp) > 0 ? ` (${fmt(p.high_frp, 'fire_count')} high-FRP)` : '';
    const peakLine = Number(p.max_frp) > 0 ? ` · peak ${fmt(p.max_frp, 'fire_frp')} MW` : '';
    map.getCanvas().style.cursor = 'pointer';
    popup.setLngLat(e.lngLat)
      .setHTML(`<strong>${dens} / 5 km²</strong> · ${fmt(p.count, 'fire_count')} detections${highLine}<br>${fmt(p.frp_sum, 'fire_frp')} MW sum${peakLine} · ${p.first}–${p.last}${locLine}`)
      .addTo(map);
  });
  map.on('mousemove', 'fires-dot', (e) => popup.setLngLat(e.lngLat));
  map.on('mouseleave', 'fires-dot', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  let lastKey = null;

  return {
    update(state, payload) {
      const fires = payload && payload.fires && Array.isArray(payload.fires.features) ? payload.fires : null;
      const isBasin = !!(payload && payload.scope && payload.scope.meta && payload.scope.meta.kind === 'basin');
      const key = fires ? `${fires.scope || ''}:${fires.year || state.year}:${isBasin ? 'b' : 'c'}:${fires.gridDeg || ''}` : 'empty';
      if (key !== lastKey) {
        lastKey = key;
        const sorted = fires ? enrichAndSortFires(fires, { isBasin, gridDeg: fires.gridDeg || null }) : EMPTY;
        map.getSource('fires-src').setData(sorted);
      }
      popup.remove();
    },
  };
}

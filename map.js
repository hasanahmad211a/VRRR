// js/map/map.js
// Purpose: optimized MapLibre map (#map) with accurate 1:50m country/basin borders,
//          distinct colors for Canada/USA/Russia, topographic contours, terrain, and coalesced updates.

import { addLayer as addAirLayer } from './air.js';
import { addLayer as addFiresLayer } from './fires.js';
import { addLayer as addWaterLayer } from './water.js';
import { mountFallback } from './fallback.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EMPTY = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const CSS = `
.map-canvas { position: absolute; inset: 0; }
.map-back {
  position: absolute; top: 10px; left: 10px; z-index: 3; font-size: 13px; font-weight: 600;
  padding: 5px 11px; background: var(--c-paper); border: 1px solid var(--c-edge);
  transition: background-color 160ms var(--ease-out), border-color 160ms var(--ease-out), transform 100ms var(--ease-spring);
}
.map-back:hover { background: var(--c-panel); border-color: var(--c-edge-hover); }
.map-back:active { transform: scale(0.95); transition-duration: 60ms; }
.map-back[hidden] { display: none; }
.map-note {
  position: absolute; top: 10px; right: 52px; z-index: 3; font-size: 12px; font-weight: 500;
  color: var(--c-muted); background: rgba(255, 255, 255, 0.94); border: 1px solid var(--c-edge);
  padding: 4px 10px; border-radius: 8px; backdrop-filter: blur(4px);
}
.map-note strong { color: var(--c-ink); font-weight: 600; }
.map-note[hidden] { display: none; }
#map .maplibregl-popup-content { font-family: var(--f-mono); font-size: 12px; color: var(--c-ink); padding: 7px 10px; border-radius: 8px; border: 1px solid var(--c-edge); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1); }
#map .maplibregl-ctrl-group { border-radius: 8px; box-shadow: none; border: 1px solid var(--c-edge); }
#map .maplibregl-ctrl-attrib { font-size: 10px; }
`;

function injectStyle() {
  if (document.querySelector('style[data-module="map"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'map';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let dem = null;
function demSource() {
  if (dem || !window.mlcontour) return dem;
  dem = new window.mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: 12, worker: true, cacheSize: 150, timeoutMs: 10000 });
  dem.setupMaplibre(window.maplibregl);
  return dem;
}

function addTerrain(map, COLORS) {
  const d = demSource();
  map.addSource('map-dem', {
    type: 'raster-dem',
    tiles: [d ? d.sharedDemProtocolUrl : DEM_URL],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 12,
    attribution: 'Terrain: AWS Terrain Tiles',
  });
  map.addSource('map-hillshade-dem', {
    type: 'raster-dem',
    tiles: [d ? d.sharedDemProtocolUrl : DEM_URL],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 12,
  });
  map.addLayer({
    id: 'map-hillshade',
    type: 'hillshade',
    source: 'map-hillshade-dem',
    layout: { visibility: 'none' },
    paint: {
      'hillshade-exaggeration': 0.42,
      'hillshade-shadow-color': COLORS.contour,
      'hillshade-highlight-color': COLORS.paper,
      'hillshade-illumination-anchor': 'viewport',
    },
  });
  if (!d) return;
  map.addSource('map-contours', {
    type: 'vector',
    maxzoom: 12,
    tiles: [d.contourProtocolUrl({
      multiplier: 1,
      overzoom: 1,
      thresholds: { 5: [400, 2000], 6: [250, 1250], 7: [150, 750], 8: [100, 500], 9: [50, 250], 11: [25, 100] },
      elevationKey: 'ele',
      levelKey: 'level',
      contourLayer: 'contours',
    })],
  });
  map.addLayer({
    id: 'map-contour-minor',
    type: 'line',
    source: 'map-contours',
    'source-layer': 'contours',
    filter: ['==', ['get', 'level'], 0],
    layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.contourMinor || COLORS.contour, 'line-width': 0.65, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.25, 8, 0.4] },
  });
  map.addLayer({
    id: 'map-contour-major',
    type: 'line',
    source: 'map-contours',
    'source-layer': 'contours',
    filter: ['>=', ['get', 'level'], 1],
    layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.contour, 'line-width': 1.25, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.45, 8, 0.72] },
  });
}

function addCountryLayers(map) {
  map.addSource('map-countries', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'map-countries-fill',
    type: 'fill',
    source: 'map-countries',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.1,
    },
  });
  map.addLayer({
    id: 'map-countries-casing',
    type: 'line',
    source: 'map-countries',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 2.6,
      'line-opacity': 0.72,
    },
  });
  map.addLayer({
    id: 'map-countries-line',
    type: 'line',
    source: 'map-countries',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.6,
      'line-opacity': 0.88,
    },
  });
}

function addBasinOutlines(map, COLORS) {
  map.addSource('map-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'map-basin-fill',
    type: 'fill',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    paint: { 'fill-color': COLORS.basin, 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'map-basin-casing',
    type: 'line',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 3.4, 'line-opacity': 0.78 },
  });
  map.addLayer({
    id: 'map-basin-line',
    type: 'line',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.basin, 'line-width': 2.0, 'line-dasharray': [3, 2] },
  });
}

function addLabels(map, COLORS) {
  map.addLayer({
    id: 'map-basin-label',
    type: 'symbol',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.4], 'symbol-placement': 'point' },
    paint: { 'text-color': COLORS.ink, 'text-halo-color': COLORS.paper, 'text-halo-width': 1.8 },
  });
  if (map.getSource('map-contours')) {
    map.addLayer({
      id: 'map-contour-label',
      type: 'symbol',
      source: 'map-contours',
      'source-layer': 'contours',
      filter: ['>=', ['get', 'level'], 1],
      layout: { visibility: 'none', 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'], 'text-font': FONT, 'text-size': 10.5 },
      paint: { 'text-color': COLORS.contour, 'text-halo-color': COLORS.paper, 'text-halo-width': 1.4 },
    });
  }
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, COUNTRY_COLORS } = theme;
  // Module scripts can finish before a deferred CDN script on a slow connection.
  // Give the library a bounded chance to arrive instead of permanently replacing
  // the whole map with the generic module error.
  if (!window.maplibregl) {
    await new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.maplibregl || Date.now() - started >= 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }
  if (!window.maplibregl) {
    await mountFallback(el, ctx, 'Interactive map library unavailable. Showing a flat map from the project’s own data.');
    return;
  }
  for (const p of el.querySelectorAll(':scope > .placeholder')) p.remove();
  let container = el.querySelector('.map-canvas');
  if (!container) {
    container = document.createElement('div');
    container.className = 'map-canvas';
    el.insertBefore(container, el.firstChild);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'map-back';
  back.hidden = true;
  back.addEventListener('click', () => store.set({ view: 'country' }));
  const note = document.createElement('div');
  note.className = 'map-note';
  note.hidden = true;
  el.append(back, note);

  const regions = await data.getRegions();
  const first = regions && regions.countries ? regions.countries[0] : null;
  const cam = first ? first.camera : { center: [0, 40], zoom: 1.5, pitch: 0, bearing: 0 };
  let map;
  try {
    map = new window.maplibregl.Map({
    container,
    style: STYLE_URL,
    center: cam.center,
    zoom: cam.zoom,
    pitch: cam.pitch,
    bearing: cam.bearing,
    maxPitch: 70,
    fadeDuration: 120,
    maxTileCacheSize: 150,
    attributionControl: false,
    });
  } catch (err) {
    console.info('map: interactive renderer unavailable', err);
    await mountFallback(el, ctx, 'The 3D renderer is unavailable in this browser. Showing a flat map from the project’s own data.');
    return;
  }
  map.on('error', (e) => console.warn('map:', e && e.error ? e.error.message : e));
  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  let userOpenedAttrib = false;
  function syncAttribState() {
    const attr = el.querySelector('.maplibregl-ctrl-attrib');
    if (!attr || userOpenedAttrib) return;
    attr.classList.add('maplibregl-compact');
    attr.classList.remove('maplibregl-compact-show');
    attr.removeAttribute('open');
  }
  const attrBtn = el.querySelector('.maplibregl-ctrl-attrib-button');
  if (attrBtn) {
    attrBtn.addEventListener('click', () => {
      const attr = attrBtn.closest('.maplibregl-ctrl-attrib');
      requestAnimationFrame(() => {
        userOpenedAttrib = !!(attr && (attr.hasAttribute('open') || attr.classList.contains('maplibregl-compact-show')));
      });
    });
  }
  syncAttribState();
  ctx.map = map;
  const layers = [];
  let ready = false;
  let fallbackShown = false;
  let refreshing = false;
  let queued = null;
  const loadingTimer = setTimeout(() => {
    if (!ready) showFallback('The online basemap could not load. Showing a flat map from the project’s own data.');
  }, 15000);

  async function showFallback(reason) {
    if (fallbackShown) return;
    fallbackShown = true;
    ready = false;
    clearTimeout(loadingTimer);
    map.remove();
    delete ctx.map;
    await mountFallback(el, ctx, reason);
  }

  function registerLayer(addFn) {
    try {
      const api = addFn(map, ctx);
      if (api && typeof api.update === 'function') layers.push(api);
    } catch (err) {
      console.info(`map: layer failed (${err && err.message ? err.message : err})`);
    }
  }

  function styleCountryFocus(state) {
    const basin = state.view === 'basin';
    const active = state.countryId;
    map.setPaintProperty('map-countries-fill', 'fill-opacity', basin
      ? 0.035
      : ['case', ['==', ['get', 'id'], active], 0.14, 0.06]);
    map.setPaintProperty('map-countries-line', 'line-width', ['case', ['==', ['get', 'id'], active], 1.85, 1.0]);
    map.setPaintProperty('map-countries-line', 'line-opacity', basin
      ? ['case', ['==', ['get', 'id'], active], 0.55, 0.25]
      : ['case', ['==', ['get', 'id'], active], 0.92, 0.48]);
    map.setPaintProperty('map-countries-casing', 'line-width', ['case', ['==', ['get', 'id'], active], 3.2, 1.8]);
  }

  function applyView(state, meta, animate) {
    const basin = state.view === 'basin';
    if (!basin) map.setTerrain(null);
    map.setProjection({ type: basin ? 'mercator' : 'globe' });
    if (map.getLayer('map-hillshade')) {
      map.setLayoutProperty('map-hillshade', 'visibility', basin ? 'visible' : 'none');
    }
    if (basin && map.getSource('map-dem')) map.setTerrain({ source: 'map-dem', exaggeration: 1.7 });

    if (map.getLayer('map-contour-minor')) {
      map.setPaintProperty('map-contour-minor', 'line-opacity', basin
        ? 0.36
        : ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.24, 8, 0.36]);
    }
    if (map.getLayer('map-contour-major')) {
      map.setPaintProperty('map-contour-major', 'line-opacity', basin
        ? 0.68
        : ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.42, 8, 0.68]);
    }
    if (map.getLayer('map-contour-label')) {
      map.setLayoutProperty('map-contour-label', 'visibility', basin ? 'visible' : 'none');
    }

    styleCountryFocus(state);
    map.setPaintProperty('map-basin-fill', 'fill-opacity', basin ? 0 : 0.12);
    map.setPaintProperty('map-basin-line', 'line-color', basin ? COLORS.ink : COLORS.basin);
    if (map.getLayer('map-basin-label')) map.setLayoutProperty('map-basin-label', 'visibility', basin ? 'none' : 'visible');

    const country = regions.countries.find((c) => c.id === state.countryId) || regions.countries[0];
    back.hidden = !basin;
    back.textContent = `← Back to ${country ? country.shortName : 'country'}`;
    note.hidden = basin || !meta || !meta.basin;
    if (meta && meta.basin) {
      note.innerHTML = `Click the orange outline to open the <strong>${meta.basin.shortName}</strong> case study`;
    } else {
      note.textContent = '';
    }
    const camera = meta ? meta.camera : cam;
    if (animate) map.flyTo({ ...camera, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
    else map.jumpTo(camera);
  }

  async function loadAllCountries() {
    const items = await data.getAllCountriesGeo();
    const features = [];
    for (const { country, geo } of items) {
      const color = (COUNTRY_COLORS && COUNTRY_COLORS[country.id]) || COLORS.country;
      for (const f of geo.features) {
        if (f.properties && f.properties.kind === 'country') {
          features.push({
            type: 'Feature',
            geometry: f.geometry,
            properties: { ...f.properties, id: country.id, color },
          });
        }
      }
    }
    if (map.getSource('map-countries')) {
      map.getSource('map-countries').setData({ type: 'FeatureCollection', features });
    }
  }

  async function runRefresh(state, viewChanged) {
    const [scope, fires, air] = await Promise.all([
      data.getScope(state),
      data.getFires(state, state.year),
      data.getAir(state, state.year),
    ]);
    if (!ready) return;
    const meta = scope ? scope.meta : null;
    if (viewChanged) {
      applyView(state, meta, viewChanged !== 'first');
      const geo = scope && scope.geo ? scope.geo : EMPTY;
      const basinFeatures = (geo.features || [])
        .filter((f) => f.properties && f.properties.kind === 'basin')
        .map((f) => ({
          ...f,
          properties: meta && meta.basin
            ? { ...f.properties, label: `Case study: ${meta.basin.shortName} — click to zoom` }
            : f.properties,
        }));
      map.getSource('map-geo').setData({ type: 'FeatureCollection', features: basinFeatures });
    }
    for (let i = 0; i < layers.length; i += 1) {
      try {
        layers[i].update(state, { scope, fires, air });
      } catch (err) {
        console.info('map: layer update failed', err && err.message ? err.message : err);
      }
    }
    // Warm next year quietly during playback
    const maxY = regions && Array.isArray(regions.years) ? regions.years[1] : 2025;
    if (state.playing && state.year < maxY) {
      data.getFires(state, state.year + 1);
      data.getAir(state, state.year + 1);
    }
  }

  async function refresh(state, viewChanged) {
    if (refreshing) {
      queued = {
        state,
        viewChanged: (queued && queued.viewChanged) || viewChanged,
      };
      return;
    }
    refreshing = true;
    try {
      await runRefresh(state, viewChanged);
      while (queued) {
        const next = queued;
        queued = null;
        await runRefresh(next.state, next.viewChanged);
      }
    } finally {
      refreshing = false;
    }
  }

  map.on('load', async () => {
    if (fallbackShown) return;
    try {
    // Sharpen OpenFreeMap basemap international borders cleanly
    if (map.getLayer('boundary_2')) {
      map.setPaintProperty('boundary_2', 'line-color', '#475569');
      map.setPaintProperty('boundary_2', 'line-opacity', ['interpolate', ['linear'], ['zoom'], 0, 0.55, 4, 0.9]);
    }

    addTerrain(map, COLORS);
    addCountryLayers(map);
    registerLayer(addAirLayer);
    registerLayer(addFiresLayer);
    registerLayer(addWaterLayer);
    addBasinOutlines(map, COLORS);
    addLabels(map, COLORS);

    map.on('click', 'map-basin-fill', () => { if (store.get().view !== 'basin') store.set({ view: 'basin' }); });
    map.on('mouseenter', 'map-basin-fill', () => { if (store.get().view !== 'basin') map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'map-basin-fill', () => { map.getCanvas().style.cursor = ''; });

    map.on('click', 'map-countries-fill', (e) => {
      if (store.get().view === 'basin') return;
      const basinHit = map.queryRenderedFeatures(e.point, { layers: ['map-basin-fill'] });
      if (basinHit && basinHit.length) return;
      const f = e.features && e.features[0];
      const cid = f && f.properties && f.properties.id;
      if (cid && cid !== store.get().countryId) store.set({ countryId: cid, playing: false });
    });
    map.on('mousemove', 'map-countries-fill', (e) => {
      if (store.get().view === 'basin') return;
      const f = e.features && e.features[0];
      const cid = f && f.properties && f.properties.id;
      if (cid && cid !== store.get().countryId) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'map-countries-fill', () => { map.getCanvas().style.cursor = ''; });

    await loadAllCountries();
    ready = true;
    clearTimeout(loadingTimer);
    el.dataset.mapReady = 'true';
    syncAttribState();
    refresh(store.get(), 'first');
    } catch (err) {
      console.info('map: layer setup unavailable', err);
      await showFallback('The interactive layers could not load. Showing a flat map from the project’s own data.');
    }
  });

  store.subscribe((state, prev) => {
    if (fallbackShown) return;
    const viewChanged = state.countryId !== prev.countryId || state.view !== prev.view;
    if (viewChanged || state.year !== prev.year) refresh(state, viewChanged);
  });
  if (typeof ResizeObserver !== 'undefined') {
    let t = null;
    new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (fallbackShown) return;
        map.resize();
        syncAttribState();
      }, 100);
    }).observe(el);
  }
}

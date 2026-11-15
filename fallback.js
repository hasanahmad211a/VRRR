// A lightweight map that keeps the explorer useful without WebGL or a basemap CDN.
const NS = 'http://www.w3.org/2000/svg';

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

export async function mountFallback(el, ctx, reason) {
  el.replaceChildren();
  el.dataset.mapReady = 'fallback';
  const style = document.createElement('style');
  style.textContent = `
    .map-fallback { position:absolute; inset:0; display:flex; flex-direction:column; background:#e9f0ed; }
    .map-fallback-head { padding:18px 20px 8px; display:flex; gap:12px; justify-content:space-between; align-items:start; }
    .map-fallback-head strong { display:block; font-family:var(--f-serif); font-size:22px; }
    .map-fallback-head p { font-size:12px; margin:3px 0 0; color:var(--c-muted); }
    .map-fallback svg { flex:1; width:100%; min-height:0; }
    .map-fallback-foot { padding:9px 20px 13px; font-size:11px; color:var(--c-muted); border-top:1px solid #ccd8d1; }
    .map-fallback-status { margin-top:4px; }
    .map-fallback button { font-size:12px; white-space:nowrap; }
    @media(max-width:480px) { .map-fallback-head {padding:12px;} .map-fallback-head strong {font-size:18px;} .map-fallback-head {flex-wrap:wrap;} }
  `;
  const root = document.createElement('div');
  root.className = 'map-fallback';
  const head = document.createElement('div');
  head.className = 'map-fallback-head';
  const heading = document.createElement('div');
  const title = document.createElement('strong');
  const subtitle = document.createElement('p');
  subtitle.textContent = reason;
  heading.append(title, subtitle);
  const basinButton = document.createElement('button');
  basinButton.type = 'button';
  basinButton.addEventListener('click', () => ctx.store.set({ view: ctx.store.get().view === 'basin' ? 'country' : 'basin', playing: false }));
  head.append(heading, basinButton);
  const svg = svgNode('svg', {viewBox:'0 0 800 450', role:'img', 'aria-label':'Country boundaries and satellite fire detection cells'});
  const foot = document.createElement('div');
  foot.className = 'map-fallback-foot';
  const key = document.createElement('div');
  key.textContent = 'Orange dots: satellite detection cells · Blue lines: rivers · Dashed outline: case-study basin';
  const status = document.createElement('div');
  status.className = 'map-fallback-status';
  status.setAttribute('aria-live', 'polite');
  foot.append(key, status);
  root.append(head, svg, foot);
  el.append(style, root);

  let token = 0;
  const regions = await ctx.data.getRegions();
  const countries = await ctx.data.getAllCountriesGeo();

  async function render(state) {
    const current = ++token;
    const country = regions?.countries?.find(c => c.id === state.countryId);
    if (!country) {
      title.textContent = 'Map data unavailable';
      status.textContent = 'The charts below remain available while map data loads.';
      return;
    }
    const basin = state.view === 'basin' && country.basin;
    const area = basin || country;
    const bbox = area.bbox;
    const [west, south, east, north] = bbox;
    const scaleX = 740 / (east - west);
    const scaleY = 390 / (north - south);
    const project = ([lon, lat]) => [30 + (lon - west) * scaleX, 420 - (lat - south) * scaleY];
    const linePath = points => points.map((point, i) => `${i ? 'L' : 'M'}${project(point).map(n => n.toFixed(1)).join(',')}`).join('');
    const geometryPath = geometry => {
      if (!geometry) return '';
      if (geometry.type === 'Polygon') return geometry.coordinates.map(ring => `${linePath(ring)}Z`).join('');
      if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(poly => poly.map(ring => `${linePath(ring)}Z`)).join('');
      if (geometry.type === 'LineString') return linePath(geometry.coordinates);
      if (geometry.type === 'MultiLineString') return geometry.coordinates.map(linePath).join('');
      return '';
    };
    title.textContent = `${area.shortName || area.name} · ${state.year}`;
    basinButton.hidden = !country.basin;
    basinButton.textContent = basin ? '← Whole country' : `Explore ${country.basin?.shortName || 'river basin'} →`;
    svg.setAttribute('aria-label', `${area.name} in ${state.year}: country boundaries, rivers and available fire detection cells`);
    svg.replaceChildren();
    for (let i = 1; i < 6; i++) {
      svg.append(svgNode('path', {d:`M${i * 160},0V450 M0,${i * 90}H800`, stroke:'#d5e0d8', 'stroke-width':'.7', fill:'none'}));
    }
    const item = countries.find(c => c.country.id === country.id);
    for (const feature of item?.geo?.features || []) {
      svg.append(svgNode('path', { d:geometryPath(feature.geometry), fill:'#d4dfcd', stroke:'#879f85', 'stroke-width':'.7', 'fill-rule':'evenodd' }));
    }
    status.textContent = 'Loading the selected year’s observations…';
    const scope = await ctx.data.getScope(state);
    if (current !== token) return;
    for (const feature of scope?.rivers?.features || []) {
      svg.append(svgNode('path', { d:geometryPath(feature.geometry), fill:'none', stroke:'#6f9fb0', 'stroke-width':'1.1', opacity:'.8' }));
    }
    for (const feature of scope?.geo?.features || []) {
      if (feature.properties?.kind !== 'basin') continue;
      svg.append(svgNode('path', { d:geometryPath(feature.geometry), fill:'none', stroke:'#b76b25', 'stroke-width':'2', 'stroke-dasharray':'7 5' }));
    }
    const fires = await ctx.data.getFires(state, state.year);
    if (current !== token) return;
    const features = fires?.features || [];
    const stride = Math.max(1, Math.ceil(features.length / 2500));
    for (let i = 0; i < features.length; i += stride) {
      const feature = features[i];
      if (feature.geometry?.type !== 'Point') continue;
      const [lon, lat] = feature.geometry.coordinates;
      if (lon < west || lon > east || lat < south || lat > north) continue;
      const [cx, cy] = project([lon, lat]);
      const count = Number(feature.properties?.count) || 1;
      const circle = svgNode('circle', {cx, cy, r:Math.min(7, 1.5 + Math.log10(count + 1)), fill:'#cd5c2e', opacity:'.68'});
      const tooltip = svgNode('title');
      tooltip.textContent = `${count.toLocaleString()} satellite detections in this cell`;
      circle.append(tooltip);
      svg.append(circle);
    }
    status.textContent = features.length
      ? `${features.length.toLocaleString()} detection cells available.${stride > 1 ? ' Dots are sampled for display.' : ''} Detections are not individual fires. Flat overview; use the controls above to change place or year.`
      : 'No spatial fire detections available for this selection. Missing observations do not mean no fires. Flat overview; use the controls above to change place or year.';
  }
  ctx.store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view || state.year !== prev.year) render(state).catch(() => { status.textContent = 'Map observations could not load. The charts and country controls remain available.'; });
  });
  render(ctx.store.get()).catch(() => {
    status.textContent = 'Map observations could not load. The charts and country controls remain available.';
  });
}

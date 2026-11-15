// js/main.js
// Purpose: app entry. Builds ctx = { store, data, theme } and mounts every module into its slot.

import { store } from './store.js';
import * as data from './data.js';
import * as theme from './theme.js';
import * as headerMod from './ui/header.js';
import * as challengeMod from './ui/field-challenge.js';
import * as sliderMod from './ui/slider.js';
import * as mapMod from './map/map.js';
import * as legendMod from './map/legend.js';
import * as infoboxMod from './ui/infobox.js';
import * as fig1Mod from './charts/fig1-trend.js';
import * as fig2Mod from './charts/fig2-before-after.js';
import * as fig3Mod from './charts/fig3-chain.js';

export const ctx = { store, data, theme };

const MODULES = [
  { id: 'site-header', mod: headerMod },
  { id: 'year-slider', mod: sliderMod },
  { id: 'field-challenge', mod: challengeMod },
  { id: 'map', mod: mapMod },
  { id: 'map-legend', mod: legendMod },
  { id: 'infobox', mod: infoboxMod },
  { id: 'fig1', mod: fig1Mod },
  { id: 'fig2', mod: fig2Mod },
  { id: 'fig3', mod: fig3Mod },
];

async function mountModule(id, mod) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    await mod.mount(el, ctx);
  } catch (err) {
    console.info(`main: #${id} failed (${err && err.message ? err.message : err})`);
    theme.placeholder(el, 'Module not ready');
  }
}

function syncFrame(state) {
  const root = document.documentElement;
  root.dataset.country = state.countryId;
  root.dataset.view = state.view;
}

export async function main() {
  const params = new URLSearchParams(location.search);
  const countryId = params.get('country');
  const year = Number(params.get('year'));
  const patch = {};
  if (['canada', 'usa', 'russia'].includes(countryId)) patch.countryId = countryId;
  if (params.get('view') === 'basin') patch.view = 'basin';
  const focus = params.get('focus');
  if (Object.prototype.hasOwnProperty.call(theme.VARS, focus)) patch.focus = focus;
  if (params.has('year') && Number.isInteger(year)) patch.year = Math.max(2002, Math.min(2026, year));
  store.set(patch);
  const shareButton = document.querySelector('.share-view');
  shareButton?.addEventListener('click', async () => {
    const state = store.get();
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ country: state.countryId, view: state.view, year: state.year, focus: state.focus })) url.searchParams.set(key, value);
    url.hash = 'explore';
    try {
      await navigator.clipboard.writeText(url.href);
      shareButton.textContent = 'View copied ✓';
      document.getElementById('share-status').textContent = 'A link to this country, year, and map view was copied.';
    } catch {
      history.replaceState(null, '', url);
      shareButton.textContent = 'Link ready in address bar';
      document.getElementById('share-status').textContent = 'Copy the address bar to share this view.';
    }
  });
  const regions = await data.getRegions();
  if (!regions) {
    console.info('main: data/regions.json could not be loaded; modules will show placeholders');
  } else {
    const defScope = await data.getScope(store.get());
    const defHasData = !!(defScope && (defScope.hasFireCsvs || (defScope.series && Object.keys(defScope.series.variables || {}).length)));
    if (!defHasData && !['canada', 'usa', 'russia'].includes(countryId) && Array.isArray(regions.countries)) {
      for (const c of regions.countries) {
        if (c.id === store.get().countryId) continue;
        const sc = await data.getScope({ countryId: c.id, view: 'country' });
        if (sc && (sc.hasFireCsvs || (sc.series && Object.keys(sc.series.variables || {}).length))) {
          const bestYear = Array.isArray(c.eventYears) && c.eventYears.length
            ? c.eventYears[c.eventYears.length - 1]
            : store.get().year;
          const focus = sc.series && sc.series.variables && sc.series.variables.fire_frp
            ? 'fire_frp'
            : (sc.series && sc.series.variables && sc.series.variables.fire_count ? 'fire_count' : 'fire_frp');
          store.set({ countryId: c.id, view: 'country', year: bestYear, focus });
          break;
        }
      }
    }
  }

  syncFrame(store.get());
  store.subscribe(syncFrame);

  for (const entry of MODULES) {
    await mountModule(entry.id, entry.mod);
  }
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => console.info('main: unexpected failure', err));

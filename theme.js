// js/theme.js
// Purpose: colours, variable table and number formatting shared by every module.

export const COLORS = Object.freeze({
  fire: '#D55E00',
  smoke: '#8A7F72',
  water: '#009E73',
  river: '#56B4E9',
  polluted: '#7B3294',
  fish: '#0072B2',
  year: '#E69F00',
  ink: '#1A1D21',
  muted: '#54595D',
  rule: '#D0D7DE',
  panel: '#F6F8FA',
  link: '#2B5FC7',
  paper: '#FFFFFF',
  contour: '#6E6256',
  contourMinor: '#8E8174',
  country: '#202122',
  basin: '#E69F00',
});

/** Distinct cartographic colours for the three countries on the map. */
export const COUNTRY_COLORS = Object.freeze({
  canada: '#2A9D8F',
  usa: '#C84B59',
  russia: '#3D6CB9',
});

/** Variable table. ids are fixed by the contract; digits = decimals shown by fmt(). */
export const VARS = Object.freeze({
  fire_count: { label: 'Fire detections (MODIS)', short: 'Fires', unit: 'detections', group: 'fire', color: COLORS.fire, digits: 0 },
  viirs_count: { label: 'Fire detections (VIIRS)', short: 'VIIRS fires', unit: 'detections', group: 'fire', color: COLORS.fire, digits: 0 },
  fire_frp: { label: 'Fire radiative power', short: 'Fire power', unit: 'MW (annual sum)', group: 'fire', color: COLORS.fire, digits: 0 },
  aod: { label: 'Aerosol optical depth 550 nm', short: 'AOD', unit: 'unitless', group: 'air', color: COLORS.smoke, digits: 3 },
  pm25: { label: 'Surface PM2.5', short: 'PM2.5', unit: 'µg/m³', group: 'air', color: COLORS.smoke, digits: 1 },
  kd490: { label: 'Water turbidity (Kd490)', short: 'Kd490', unit: 'm⁻¹', group: 'water', color: COLORS.water, digits: 3 },
  chlor_a: { label: 'Chlorophyll-a', short: 'Chl-a', unit: 'mg/m³', group: 'water', color: COLORS.water, digits: 2 },
  fish_value: { label: 'Salmon landed value', short: 'Value', unit: 'million (2024 prices, local currency)', group: 'fish', color: COLORS.fish, digits: 1 },
  fish_catch: { label: 'Salmon catch', short: 'Catch', unit: 'thousand tonnes', group: 'fish', color: COLORS.fish, digits: 1 },
});

export const GROUP_DEFAULT = Object.freeze({ fire: 'fire_frp', air: 'aod', water: 'kd490', fish: null });
export const GROUPS = Object.freeze(['fire', 'air', 'water', 'fish']);
export const GROUP_LABEL = Object.freeze({ fire: 'Fire', air: 'Air', water: 'Water', fish: 'Fish' });

export function fmt(value, varId) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = VARS[varId] ? VARS[varId].digits : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtP(p) {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return 'p = —';
  const v = Number(p);
  if (v < 0.001) return 'p < 0.001';
  return `p = ${v.toFixed(3)}`;
}

export function unitFor(varId, meta) {
  const v = VARS[varId];
  if (!v) return '';
  if (varId === 'fish_value' && meta && meta.currency) return `${meta.currency} million (2024 prices)`;
  return v.unit;
}

export function placeholder(el, text = 'No data for this selection') {
  if (!el) return null;
  for (const child of Array.from(el.childNodes)) {
    if (!(child.nodeType === 1 && child.id)) child.remove();
  }
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  el.appendChild(p);
  return p;
}

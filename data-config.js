// js/data-config.js
// Purpose: Flexible CSV configuration. You can copy-paste an entire yearly CSV folder
//          (such as `USA_forest_fires_final` or `csv_by_year` containing `USA_VIIRS_2021.csv` /
//          `USA_MODIS_2021.csv`) straight into `./data/` or `./data/<country>/`, and the app
//          discovers and aggregates it automatically without changing code.

export const DATA_CONFIG = {
  // 'csv'     = read discovered / configured CSV files (no mock JSON requests)
  // 'geojson' = read legacy .geojson/.json files
  // 'auto'    = try CSV first, otherwise fall back to .geojson/.json
  mode: 'csv',

  // When a csv_by_year folder includes both VIIRS and MODIS files for the same year:
  //   'viirs-first' = use VIIRS if present for that year, else MODIS (avoids double-counting)
  //   'modis-first' = use MODIS if present for that year, else VIIRS
  //   'merge'       = combine all files found for that year
  sensorPreference: 'viirs-first',

  // Direct single-file fallback patterns per scope ({scope} = 'canada', 'usa', 'russia', etc.)
  patterns: {
    firesCsv: './data/{scope}/fires.csv',
    airCsv: './data/{scope}/air.csv',
    seriesCsv: './data/{scope}/series.csv',
  },

  // Optional per-scope overrides (e.g. scopes['usa'] = { firesCsv: './data/usa/custom.csv' })
  scopes: {},

  // Flexible column-name aliases (case-insensitive, first matching header wins)
  columns: {
    lat: ['lat', 'latitude', 'y', 'lat_deg'],
    lon: ['lon', 'lng', 'longitude', 'long', 'x', 'lon_deg'],
    year: ['year', 'yr', 'acq_year'],
    date: ['date', 'acq_date', 'time', 'month', 'timestamp'],
    count: ['count', 'detections', 'n', 'fire_count'],
    frp: ['frp_mw', 'frp_sum', 'frp', 'fire_frp', 'radiative_power', 'power'],
    aod: ['aod', 'totexttau', 'aod_550', 'aod550', 'value'],
    pm25: ['pm25', 'pm2_5', 'surface_pm25'],
    variable: ['variable', 'var', 'var_id', 'metric'],
    value: ['value', 'val', 'mean', 'v'],
    waterBody: ['water_body', 'waterbody', 'water_body_id', 'wb'],
    state: ['state', 'province', 'region_name', 'admin1'],
    forest: ['forest_name', 'forest', 'unit_name'],
    frpClass: ['frp_class'],
    inNationalForest: ['in_national_forest'],
    satellite: ['satellite'],
    dayNight: ['day_night'],
  },

  // Grid cell size (degrees) used to aggregate large point-level CSVs (like NASA FIRMS 20–60 MB files)
  gridDeg: {
    countryFires: 0.2,
    basinFires: 0.05,
    countryAir: 2.0,
    basinAir: 0.5,
  },

  // Rows parsed per event-loop yield so large CSVs never freeze the UI
  chunkRows: 15000,
};

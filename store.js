// js/store.js
// Purpose: observable application state store { countryId, view, year, focus, playing }.

export const INITIAL_STATE = Object.freeze({
  countryId: 'usa',
  view: 'country',
  year: 2020,
  focus: 'fire_frp',
  playing: false,
});

let state = { ...INITIAL_STATE };
const listeners = new Set();

export const store = {
  get() {
    return state;
  },

  set(patch) {
    if (!patch || typeof patch !== 'object') return false;
    const next = { ...state };
    let changed = false;
    for (const key of Object.keys(patch)) {
      const value = patch[key];
      if (value === undefined) continue;
      if (!Object.is(next[key], value)) {
        next[key] = value;
        changed = true;
      }
    }
    if (!changed) return false;
    const prev = state;
    state = Object.freeze(next);
    for (const fn of Array.from(listeners)) {
      try {
        fn(state, prev);
      } catch (err) {
        console.warn('store: a subscriber threw', err);
      }
    }
    return true;
  },

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  reset() {
    state = { ...INITIAL_STATE };
  },
};

export default store;

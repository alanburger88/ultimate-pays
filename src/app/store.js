/** Minimal observable store. State is plain data; updates are shallow patches or reducer functions. */
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  let scheduled = false;
  let pending = [];

  function notify(changedKeys) {
    for (const fn of Array.from(listeners)) {
      try { fn(state, changedKeys); } catch (err) { console.error('store listener failed', err); }
    }
  }

  function flush() {
    scheduled = false;
    const keys = new Set(pending.flat());
    pending = [];
    notify(keys);
  }

  return {
    get: () => state,
    /** set(partial) or set(fn(state) => partial). Only top-level keys in the partial are replaced. */
    set(patch) {
      const partial = typeof patch === 'function' ? patch(state) : patch;
      if (!partial) return;
      const keys = Object.keys(partial);
      let changed = false;
      for (const k of keys) if (partial[k] !== state[k]) { changed = true; break; }
      if (!changed) return;
      state = { ...state, ...partial };
      pending.push(keys);
      if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    },
    /** update a nested slice: update('nav', nav => ({...nav, section:'x'})) */
    update(key, fn) {
      this.set({ [key]: fn(state[key]) });
    },
    subscribe(fn, keys = null) {
      const wrapped = keys ? (s, changed) => { for (const k of keys) if (changed.has(k)) return fn(s, changed); } : fn;
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
  };
}

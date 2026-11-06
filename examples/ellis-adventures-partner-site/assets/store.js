/* Ellis Adventures prototype — data store.
 * In the prototype everything lives in localStorage so the demo is fully clickable offline.
 * The shape mirrors supabase/schema.sql one-to-one; in production each mutation below becomes a
 * Supabase insert/update guarded by row-level security, and `emit` is replaced by Realtime channels.
 */
window.EA = window.EA || {};
(function (EA) {
  'use strict';
  const KEY = 'ellis-adventures-demo';
  let state = null;
  const subs = {};

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.v === EA.SEED_VERSION) { state = s; return; }
      }
    } catch (e) { /* private mode or corrupted — fall back to seed */ }
    state = EA.seed();
    save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: demo still works in-memory */ } }
  function reset() { state = EA.seed(); save(); emit('reset'); }

  function on(evt, fn) { (subs[evt] = subs[evt] || []).push(fn); return () => { subs[evt] = subs[evt].filter((f) => f !== fn); }; }
  function emit(evt, data) { (subs[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

  const find = (table, id) => state[table].find((r) => r.id === id);

  /** Live counter values — derived from records, never hand-edited. */
  function counters() {
    const s = state;
    return {
      partnerships: s.stats.partnershipsBase + s.projects.filter((p) => p.stage === 'complete').length,
      adventures: s.stats.adventuresBase + s.stats.tripsLogged,
      experiences: s.stats.experiencesBase + s.experiences.length,
      countries: s.stats.countries,
    };
  }

  const user = () => (state.session.userId ? find('users', state.session.userId) : null);
  const isHQ = () => { const u = user(); return !!(u && u.role === 'creator'); };
  const partner = (id) => find('partners', id);
  const myPartner = () => { const u = user(); return u && u.partnerId ? partner(u.partnerId) : null; };

  function login(userId) { state.session.userId = userId; save(); emit('auth'); }
  function logout() { state.session.userId = null; save(); emit('auth'); }

  /** Unread count from the current viewer's side ("hq" or "partner"). */
  function unread(thread, side) {
    return thread.messages.filter((m) => {
      const fromHQ = m.from === 'kelsey' || m.from === 'zach';
      const mine = side === 'hq' ? fromHQ : !fromHQ;
      return !mine && !(m.readBy || []).includes(side);
    }).length;
  }
  function visibleThreads() {
    const u = user();
    if (!u) return [];
    const list = isHQ() ? state.threads : state.threads.filter((t) => t.partnerId === u.partnerId);
    return list.slice().sort((a, b) => new Date(last(b).at) - new Date(last(a).at));
  }
  const last = (t) => t.messages[t.messages.length - 1] || { at: 0 };
  function unreadTotal() {
    const side = isHQ() ? 'hq' : 'partner';
    return visibleThreads().reduce((n, t) => n + unread(t, side), 0);
  }
  /** Rows the current viewer may see — the client-side twin of the RLS policies. */
  function scoped(table) {
    const u = user();
    if (!u) return [];
    if (u.role === 'creator') return state[table];
    return state[table].filter((r) => r.partnerId === u.partnerId);
  }

  // Keep tabs in sync: complete a project in the portal tab and the home-page counter ticks in the other.
  window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); emit('sync'); } });

  EA.store = {
    get state() { return state; },
    load, save, reset, on, emit, find, counters, user, isHQ, partner, myPartner, login, logout, unread, unreadTotal, visibleThreads, last, scoped,
  };
})(window.EA);

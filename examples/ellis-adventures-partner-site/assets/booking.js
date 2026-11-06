/* Ellis Adventures prototype — shared booking component.
 * One component, two entry points:
 *   mode "new"      → discovery call inside the new-partner inquiry wizard (selection only)
 *   mode "existing" → check-ins / content reviews / strategy sessions in the partner portal
 * Availability = Kelsey's and Zach's working hours, minus existing bookings, minus "on location"
 * travel days. "Both" shows only times when they are both free (a collective event).
 * Production: slots come from Cal.com collective event types (see netlify/functions/bookings.mjs).
 */
window.EA = window.EA || {};
(function (EA) {
  'use strict';
  const { esc, icon, fmt, etDate, tzParts, dayKey, keyOf, uid, avatar, whoLabel, localTz } = EA.ui;
  const S = () => EA.store.state;

  const TYPES = {
    discovery: { label: 'Discovery call', min: 30, desc: 'Meet us, share your goals and see if we’re a fit.' },
    checkin: { label: 'Project check-in', min: 30, desc: 'Timelines, logistics and next steps.' },
    review: { label: 'Content review', min: 45, desc: 'Walk through drafts and edits together.' },
    strategy: { label: 'Strategy session', min: 60, desc: 'Plan the next campaign or season.' },
  };
  // Working hours in ET (sample). Different patterns so "both" is a real intersection.
  const HOURS = { kelsey: [[10, 16]], zach: [[9, 12], [14, 18]] };
  const MIN_NOTICE_H = 24;

  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const tripOn = (key) => S().blackouts.find((b) => b.from <= key && key <= b.to);

  function personFree(person, y, m, d) {
    const key = dayKey(y, m, d);
    const wd = new Date(Date.UTC(y, m, d)).getUTCDay();
    const free = new Set();
    if (wd === 0 || wd === 6 || tripOn(key)) return free;
    const r = rng(person + key);
    for (const [a, b] of HOURS[person]) for (let t = a * 60; t < b * 60; t += 30) if (r() > 0.3) free.add(t);
    for (const bk of S().bookings) {
      if (bk.status === 'cancelled' || !(bk.with === 'both' || bk.with === person) || keyOf(bk.start) !== key) continue;
      const p = tzParts(new Date(bk.start));
      const s = p.h * 60 + p.mi;
      for (let t = s - (s % 30); t < s + bk.minutes; t += 30) free.delete(t);
    }
    return free;
  }

  function slotsFor(who, y, m, d, minutes) {
    const sets = who === 'both' ? [personFree('kelsey', y, m, d), personFree('zach', y, m, d)] : [personFree(who, y, m, d)];
    const need = Math.ceil(minutes / 30);
    const earliest = Date.now() + MIN_NOTICE_H * 36e5;
    const out = [];
    for (const t of [...sets[0]].sort((a, b) => a - b)) {
      let ok = true;
      for (let k = 0; k < need && ok; k++) ok = sets.every((s) => s.has(t + k * 30));
      if (!ok) continue;
      const dt = etDate(y, m, d, Math.floor(t / 60), t % 60);
      if (dt.getTime() >= earliest) out.push(dt.toISOString());
    }
    return out;
  }

  /** Create + persist a booking and fire the "booking.created" automation. */
  function create({ type, who, start, notes = '', partnerId = null, inquiryId = null, projectId = null, company, partnerEmail, partnerPhone, partnerSms, silent }) {
    const st = S();
    const T = TYPES[type];
    const b = { id: uid('bk'), type, with: who, start, minutes: T.min, title: `${T.label} — ${company}`, notes, partnerId, inquiryId, projectId, status: 'confirmed', createdAt: new Date().toISOString() };
    st.bookings.push(b);
    EA.store.save();
    const sent = EA.notify.dispatch('booking.created', {
      company, typeLabel: T.label, withLabel: whoLabel(who), when: fmt.when(start), minutes: T.min, notes,
      only: who === 'both' ? null : [who], partnerEmail, partnerPhone, partnerSms, silent,
    });
    return { booking: b, sent };
  }

  function calendarLinks(b, company) {
    const ev = { title: `${TYPES[b.type].label}: ${company || 'Partner'} × Kelsey & Zach`, start: b.start, minutes: b.minutes, description: `${b.notes || ''}\nVideo link: https://meet.ellisadventures.example/${b.id}` };
    return { ics: () => EA.ui.download(`ellis-adventures-${b.type}.ics`, EA.ui.icsFile(ev)), gcal: EA.ui.gcalUrl(ev) };
  }

  /**
   * Mount the booking UI.
   * opts: { mode: 'new'|'existing', partner, projects, initial, onSelect(sel), onBooked(result) }
   */
  function mount(el, opts) {
    const mode = opts.mode || 'existing';
    const now = tzParts(new Date());
    const st = {
      type: mode === 'new' ? 'discovery' : (opts.initial && opts.initial.type) || 'checkin',
      who: (opts.initial && opts.initial.who) || 'both',
      y: now.y, m: now.m, day: null, slot: null,
      projectId: (opts.initial && opts.initial.projectId) || '', notes: '',
      done: null,
    };
    const maxMonth = now.y * 12 + now.m + 3;

    function firstOpenDay() {
      for (let i = 1; i < 70; i++) {
        const dt = new Date(Date.UTC(now.y, now.m, now.d + i));
        const y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate();
        if (slotsFor(st.who, y, m, d, TYPES[st.type].min).length) return { y, m, d };
      }
      return null;
    }
    function autoPick() {
      const f = firstOpenDay();
      if (f) { st.y = f.y; st.m = f.m; st.day = dayKey(f.y, f.m, f.d); } else st.day = null;
      st.slot = null;
    }

    function render() {
      if (st.done) return renderDone();
      const minutes = TYPES[st.type].min;
      const first = new Date(Date.UTC(st.y, st.m, 1));
      const lead = first.getUTCDay();
      const daysIn = new Date(Date.UTC(st.y, st.m + 1, 0)).getUTCDate();
      const todayKey = dayKey(now.y, now.m, now.d);
      let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="bk-dow">${d}</div>`).join('');
      for (let i = 0; i < lead; i++) cells += '<div></div>';
      for (let d = 1; d <= daysIn; d++) {
        const k = dayKey(st.y, st.m, d);
        const trip = tripOn(k);
        const open = k > todayKey && slotsFor(st.who, st.y, st.m, d, minutes).length > 0;
        const cls = ['bk-day', open ? 'open' : '', trip ? 'trip' : '', k === st.day ? 'sel' : '', k === todayKey ? 'today' : ''].join(' ');
        cells += `<button type="button" class="${cls}" ${open ? `data-day="${k}"` : 'disabled'} aria-label="${esc(fmt.date(k + 'T12:00:00Z'))}${trip ? ' — ' + esc(trip.label) : open ? ' — times available' : ' — unavailable'}" ${trip ? `title="${esc(trip.label)}"` : ''}>${d}${trip ? icon('plane') : ''}</button>`;
      }
      const monthLabel = new Date(Date.UTC(st.y, st.m, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const canPrev = st.y * 12 + st.m > now.y * 12 + now.m;
      const canNext = st.y * 12 + st.m < maxMonth;

      let slotsHtml = '';
      if (st.day) {
        const [y, m, d] = st.day.split('-').map(Number);
        const slots = slotsFor(st.who, y, m - 1, d, minutes);
        slotsHtml = `<div class="bk-slots-h">${esc(fmt.day(st.day + 'T16:00:00Z'))}</div>
          <small class="muted">${minutes}-minute ${esc(TYPES[st.type].label.toLowerCase())} with ${esc(whoLabel(st.who))}</small>
          <div class="bk-slot-list">${slots.map((s) => `<button type="button" class="bk-slot ${s === st.slot ? 'on' : ''}" data-slot="${s}">${esc(fmt.time(s))}${localTz !== EA.ui.TZ ? `<small>${esc(fmt.localTime(s))} your time</small>` : ''}</button>`).join('')}</div>`;
      } else {
        slotsHtml = '<div class="bk-empty">Pick a highlighted day to see open times.</div>';
      }
      const upcomingTrip = S().blackouts.find((b) => b.to >= todayKey);

      const typeCards = mode === 'new'
        ? `<div class="bk-type single on"><span class="row-ico">${icon('calendar')}</span><div><b>Discovery call · 30 min</b><small>${esc(TYPES.discovery.desc)} Video call — link sent with your confirmation.</small></div></div>`
        : ['checkin', 'review', 'strategy'].map((k) => `<button type="button" class="bk-type ${st.type === k ? 'on' : ''}" data-type="${k}"><b>${esc(TYPES[k].label)}</b><small>${esc(TYPES[k].desc)}</small><span class="dur">${icon('clock')} ${TYPES[k].min} min</span></button>`).join('');

      const projects = opts.projects || [];
      el.innerHTML = `<div class="bk">
        <div><div class="bk-label">${mode === 'new' ? 'Your call' : '1 · What are we meeting about?'}</div><div class="bk-types">${typeCards}</div></div>
        <div><div class="bk-label">${mode === 'new' ? 'Who would you like to meet?' : '2 · Who would you like to meet?'}</div>
          <div class="bk-who" role="radiogroup" aria-label="Meet with">
            ${['both', 'kelsey', 'zach'].map((w) => `<button type="button" role="radio" aria-checked="${st.who === w}" class="who-btn ${st.who === w ? 'on' : ''}" data-who="${w}">${avatar(w)} ${w === 'both' ? 'Both of us' : whoLabel(w)}</button>`).join('')}
          </div></div>
        <div><div class="bk-label">${mode === 'new' ? 'Pick a time' : '3 · Pick a time'}</div>
          <div class="bk-main">
            <div class="bk-cal">
              <div class="bk-month"><button type="button" class="icon-btn" data-nav="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">${icon('chevL')}</button><b>${esc(monthLabel)}</b><button type="button" class="icon-btn" data-nav="1" ${canNext ? '' : 'disabled'} aria-label="Next month">${icon('chevR')}</button></div>
              <div class="bk-grid">${cells}</div>
              <div class="bk-legend"><span><i style="background:var(--lagoon-l)"></i>Open</span><span><i style="background:var(--gold-l)"></i>On location ✈</span><span>Times in New York (ET)</span></div>
            </div>
            <div class="bk-slots">${slotsHtml}
              ${upcomingTrip ? `<div class="bk-trip-note">${icon('plane')}<span><b>Heads up:</b> we’re ${esc(upcomingTrip.label.toLowerCase())} ${esc(fmt.short(upcomingTrip.from + 'T16:00:00Z'))}–${esc(fmt.short(upcomingTrip.to + 'T16:00:00Z'))}. Messages still reach us by text.</span></div>` : ''}
            </div>
          </div></div>
        ${mode === 'existing' ? `<div class="grid-2">
            <div class="field"><label for="bk-proj">Related collaboration</label><select id="bk-proj" data-proj><option value="">General / not project-specific</option>${projects.map((p) => `<option value="${p.id}" ${p.id === st.projectId ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>
            <div class="field"><label for="bk-notes">Agenda <span class="hint">(optional)</span></label><input id="bk-notes" data-notes value="${esc(st.notes)}" placeholder="What should we cover?"></div>
          </div>` : ''}
        ${st.slot && opts.onBooked ? `<div class="bk-confirm"><div class="sum"><b>${esc(TYPES[st.type].label)} · ${esc(fmt.when(st.slot))}</b>${TYPES[st.type].min} min with ${esc(whoLabel(st.who))} · instant text + email confirmation</div><button type="button" class="btn btn-gold" data-confirm>${icon('check')} Confirm booking</button></div>` : ''}
        ${st.slot && opts.onSelect ? `<div class="banner info" style="margin:0">${icon('check')}<span><b>${esc(fmt.when(st.slot))}</b> with ${esc(whoLabel(st.who))} is held for you — it’s booked when you send your inquiry.</span></div>` : ''}
      </div>`;
    }

    function renderDone() {
      const b = st.done.booking;
      el.innerHTML = `<div class="bk-done">
        <div class="success-mark" style="margin:0 auto 14px">${icon('check')}</div>
        <h3>You’re booked!</h3>
        <p class="muted">${esc(TYPES[b.type].label)} with ${esc(whoLabel(b.with))} · <b>${esc(fmt.when(b.start))}</b><br>${localTz !== EA.ui.TZ ? esc(fmt.localTime(b.start)) + ' your time · ' : ''}${b.minutes} min video call</p>
        <div class="btns"><button type="button" class="btn btn-primary btn-sm" data-ics>${icon('download')} Add to calendar (.ics)</button><a class="btn btn-soft btn-sm" target="_blank" rel="noopener" href="${esc(calendarLinks(b, opts.partner && opts.partner.company).gcal)}">${icon('calendar')} Google Calendar</a><button type="button" class="btn btn-ghost btn-sm" data-again>Book another</button></div>
      </div>`;
    }

    el.onclick = (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.type) { st.type = t.dataset.type; autoPick(); render(); }
      else if (t.dataset.who) { st.who = t.dataset.who; autoPick(); render(); if (opts.onSelect) opts.onSelect(null); }
      else if (t.dataset.nav) { const n = st.y * 12 + st.m + Number(t.dataset.nav); st.y = Math.floor(n / 12); st.m = n % 12; render(); }
      else if (t.dataset.day) { st.day = t.dataset.day; st.slot = null; render(); if (opts.onSelect) opts.onSelect(null); }
      else if (t.dataset.slot) { st.slot = t.dataset.slot; render(); if (opts.onSelect) opts.onSelect({ type: st.type, who: st.who, start: st.slot }); }
      else if (t.hasAttribute('data-confirm')) {
        const p = opts.partner || {};
        const res = create({ type: st.type, who: st.who, start: st.slot, notes: st.notes, partnerId: p.id || null, projectId: st.projectId || null, company: p.company || 'Partner', partnerEmail: p.email, partnerPhone: p.phone, partnerSms: p.smsUpdates });
        st.done = res;
        render();
        if (opts.onBooked) opts.onBooked(res);
      } else if (t.hasAttribute('data-ics')) calendarLinks(st.done.booking, opts.partner && opts.partner.company).ics();
      else if (t.hasAttribute('data-again')) { st.done = null; autoPick(); render(); }
    };
    el.onchange = (e) => { if (e.target.matches('[data-proj]')) st.projectId = e.target.value; };
    el.oninput = (e) => { if (e.target.matches('[data-notes]')) st.notes = e.target.value; };

    if (opts.initial && opts.initial.start) {
      const p = tzParts(new Date(opts.initial.start));
      st.y = p.y; st.m = p.m; st.day = dayKey(p.y, p.m, p.d); st.slot = opts.initial.start;
    } else autoPick();
    render();
    return { get selection() { return st.slot ? { type: st.type, who: st.who, start: st.slot } : null; } };
  }

  EA.booking = { TYPES, mount, create, slotsFor, calendarLinks };
})(window.EA);

/* Ellis Adventures prototype — shared UI helpers (no build step, no dependencies). */
window.EA = window.EA || {};
(function (EA) {
  'use strict';

  const TZ = 'America/New_York'; // Kelsey & Zach are NY-based; all scheduling is anchored to ET.

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- time zone helpers ---------- */
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  function tzParts(date) {
    const p = partsFmt.formatToParts(date);
    const g = (t) => +p.find((x) => x.type === t).value;
    return { y: g('year'), m: g('month') - 1, d: g('day'), h: g('hour') % 24, mi: g('minute') };
  }
  /** Wall-clock time in New York -> real Date. Day overflow (d = 35) is fine. */
  function etDate(y, m, d, h = 0, mi = 0) {
    const guess = Date.UTC(y, m, d, h, mi);
    const p = tzParts(new Date(guess));
    const asTz = Date.UTC(p.y, p.m, p.d, p.h, p.mi);
    return new Date(guess - (asTz - guess));
  }
  const dayKey = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const keyOf = (iso) => { const p = tzParts(new Date(iso)); return dayKey(p.y, p.m, p.d); };

  /* ---------- formatting ---------- */
  const fmt = {
    date: (iso, o) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, ...(o || { month: 'short', day: 'numeric', year: 'numeric' }) }),
    short: (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }),
    day: (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }),
    time: (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) + ' ET',
    localTime: (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    when: (iso) => `${fmt.day(iso)} · ${fmt.time(iso)}`,
    month: (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'long', year: 'numeric' }),
    money: (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US'),
    num: (n) => Math.round(Number(n) || 0).toLocaleString('en-US'),
    compact: (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0),
    ago(iso) {
      const s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 0) return 'in ' + fmt.dur(-s);
      if (s < 45) return 'just now';
      return fmt.dur(s) + ' ago';
    },
    dur(s) {
      const m = s / 60, h = m / 60, d = h / 24;
      if (m < 60) return `${Math.max(1, Math.round(m))}m`;
      if (h < 24) return `${Math.round(h)}h`;
      if (d < 14) return `${Math.round(d)}d`;
      if (d < 60) return `${Math.round(d / 7)}w`;
      return `${Math.round(d / 30)}mo`;
    },
  };
  const localTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return TZ; } })();

  /* ---------- icons (inline SVG, Lucide-style strokes) ---------- */
  const ICONS = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    tiktok: '<path d="M9 12a4 4 0 1 0 4 4V2c.5 2.5 2.5 4.5 5 5"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    drone: '<circle cx="5" cy="5" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>',
    wave: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>',
  };
  const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  /* ---------- avatars ---------- */
  const initials = (name) => String(name || '?').split(/\s+|&/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  function avatar(who, extra = '') {
    if (who === 'kelsey') return `<span class="avatar kelsey ${extra}" title="Kelsey">K</span>`;
    if (who === 'zach') return `<span class="avatar zach ${extra}" title="Zach">Z</span>`;
    if (who === 'both') return `<span class="avatar both ${extra}" title="Kelsey & Zach">K&amp;Z</span>`;
    const color = who && who.color ? who.color : '#8a7247';
    return `<span class="avatar ${extra}" style="background:${esc(color)}" title="${esc(who && who.name)}">${esc(initials(who && who.name))}</span>`;
  }
  const whoLabel = (w) => ({ kelsey: 'Kelsey', zach: 'Zach', both: 'Kelsey & Zach' }[w] || w);

  /* ---------- toast ---------- */
  function toast(html, { icon: ic = 'check', ms = 4200 } = {}) {
    const root = $('#toast-root');
    if (!root) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `${icon(ic)}<div>${html}</div>`;
    root.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 350); }, ms);
    while (root.children.length > 2) root.firstElementChild.remove();
  }

  /* ---------- modal / drawer ---------- */
  const modal = {
    open(html, { size = '', onClose, label = 'Dialog' } = {}) {
      modal.close(true);
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-backdrop" data-close></div>
        <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
          <button class="modal-x" data-close aria-label="Close">${icon('x')}</button>
          <div class="modal-body"></div>
        </div>`;
      const body = $('.modal-body', root);
      body.innerHTML = html;
      root.classList.add('open');
      document.body.classList.add('no-scroll');
      modal._onClose = onClose;
      modal._prev = document.activeElement;
      modal._click = (e) => { if (e.target.closest('[data-close]')) modal.close(); };
      modal._key = (e) => { if (e.key === 'Escape') modal.close(); };
      root.addEventListener('click', modal._click);
      document.addEventListener('keydown', modal._key);
      setTimeout(() => { const f = body.querySelector('input:not([type=hidden]),select,textarea'); (f || $('.modal-x', root)).focus(); }, 60);
      return body;
    },
    close(silent) {
      const root = $('#modal-root');
      if (!root || !root.classList.contains('open')) return;
      root.classList.remove('open');
      root.innerHTML = '';
      document.body.classList.remove('no-scroll');
      root.removeEventListener('click', modal._click);
      document.removeEventListener('keydown', modal._key);
      const cb = modal._onClose;
      modal._onClose = null;
      if (modal._prev && modal._prev.focus) modal._prev.focus();
      if (!silent && cb) cb();
    },
    get isOpen() { const r = $('#modal-root'); return !!(r && r.classList.contains('open')); },
  };

  /* ---------- forms ---------- */
  function formData(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox' && el.dataset.multi !== undefined) { (o[el.name] = o[el.name] || []); if (el.checked) o[el.name].push(el.value); continue; }
      if (el.type === 'checkbox') { o[el.name] = el.checked; continue; }
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; continue; }
      o[el.name] = el.value.trim();
    }
    return o;
  }
  /** Marks `.field` wrappers invalid for required/email/url rules. Returns true when valid. */
  function validate(form) {
    let ok = true; let first = null;
    $$('.field', form).forEach((f) => f.classList.remove('invalid'));
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      const v = (el.value || '').trim();
      let bad = false;
      if (el.required && el.type === 'checkbox') bad = !el.checked;
      else if (el.required && !v) bad = true;
      else if (v && el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) bad = true;
      else if (v && el.dataset.minlen && v.length < +el.dataset.minlen) bad = true;
      if (bad) { ok = false; const f = el.closest('.field') || el.closest('.check'); if (f) f.classList.add('invalid'); first = first || el; }
    }
    if (first) first.focus();
    return ok;
  }

  /* ---------- calendar files ---------- */
  const icsStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  function icsFile({ title, start, minutes, description, location }) {
    const end = new Date(new Date(start).getTime() + minutes * 60000);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ellis Adventures//Partner Portal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${uid('evt')}@ellisadventures.demo`, `DTSTAMP:${icsStamp(new Date())}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc(description)}`, `LOCATION:${icsEsc(location || 'Video call')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function gcalUrl({ title, start, minutes, description }) {
    const end = new Date(new Date(start).getTime() + minutes * 60000);
    const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${icsStamp(start)}/${icsStamp(end)}`, details: description || '' });
    return `https://calendar.google.com/calendar/render?${q}`;
  }
  function download(filename, text, type = 'text/calendar') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /** Fallback when a hot-linked photo cannot load (offline, blocked CDN). */
  function imgFallback(img, warm) {
    const host = img.closest('figure, .adv-card, .place-card, .shot-thumb, .polaroid');
    if (host) host.classList.add('img-fail');
    if (host && warm) host.classList.add('warm');
    img.style.visibility = 'hidden';
  }

  EA.ui = { TZ, localTz, esc, uid, $, $$, tzParts, etDate, dayKey, keyOf, fmt, icon, avatar, initials, whoLabel, toast, modal, formData, validate, icsFile, gcalUrl, download, imgFallback };
})(window.EA);

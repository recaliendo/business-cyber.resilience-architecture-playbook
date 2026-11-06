/* Ellis Adventures prototype — router + global wiring. */
window.EA = window.EA || {};
(function (EA) {
  'use strict';
  const { $, $$, icon, esc, toast } = EA.ui;
  const SECTIONS = ['adventures', 'love', 'lab'];

  function route() {
    const app = $('#app');
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('?')[0].split('/').filter(Boolean);
    EA.site.stop();
    app.onclick = app.onsubmit = app.oninput = app.onchange = app.onkeydown = null;
    document.body.dataset.page = parts[0] || 'home';
    if (parts[0] === 'portal') EA.portal.render(app, parts[1] || 'overview', parts[2]);
    else if (parts[0] === 'about') EA.site.about(app);
    else if (parts[0] === 'partner') EA.site.partner(app);
    else EA.site.home(app);

    const target = SECTIONS.includes(parts[0]) ? document.getElementById(parts[0]) : null;
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    else if (route.last !== raw) window.scrollTo(0, 0);
    route.last = raw;

    const key = parts[0] || 'home';
    $$('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
    $('.nav-links').classList.remove('open');
    $('.nav-toggle').setAttribute('aria-expanded', 'false');
    $('.site-footer').hidden = parts[0] === 'portal' && !!EA.store.user();
    renderHeaderAuth();
    if (!target) $('#app').focus({ preventScroll: true });
  }

  function renderHeaderAuth() {
    const u = EA.store.user();
    const slot = $('#portal-link');
    if (!u) { slot.innerHTML = `${icon('lock')} Partner Portal`; return; }
    const who = EA.store.isHQ() ? EA.ui.avatar('both') : EA.ui.avatar(u);
    const badge = EA.store.unreadTotal();
    slot.innerHTML = `<span class="portal-chip">${who}${esc(EA.store.isHQ() ? 'HQ' : u.name.split(' ')[0])}${badge ? `<span class="badge">${badge}</span>` : ''}</span>`;
  }

  function boot() {
    EA.store.load();
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="inquire"]')) { e.preventDefault(); EA.site.openInquiry(); }
      if (e.target.closest('[data-action="reset-demo"]')) {
        EA.store.reset();
        toast('<b>Demo reset</b><small>All sample data restored.</small>', { icon: 'refresh', ms: 2500 });
        route();
      }
    });
    $('.nav-toggle').addEventListener('click', () => {
      const nl = $('.nav-links');
      nl.classList.toggle('open');
      $('.nav-toggle').setAttribute('aria-expanded', nl.classList.contains('open'));
    });
    EA.store.on('auth', renderHeaderAuth);
    EA.store.on('notify', renderHeaderAuth);
    EA.store.on('sync', () => { if ((location.hash || '').startsWith('#/portal') && !EA.ui.modal.isOpen) route(); });
    window.addEventListener('hashchange', route);
    $('#year').textContent = new Date().getFullYear();
    route();
  }

  EA.app = { route, boot };
  document.addEventListener('DOMContentLoaded', boot);
})(window.EA);

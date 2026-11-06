/* Ellis Adventures prototype — Partner Portal (partners) + HQ (Kelsey & Zach).
 * Every list is read through EA.store.scoped(), the client twin of the Supabase RLS policies:
 * partners only ever see rows for their own company; the creator role sees everything.
 */
window.EA = window.EA || {};
(function (EA) {
  'use strict';
  const { esc, icon, fmt, avatar, uid, toast, modal, formData, validate, whoLabel, localTz } = EA.ui;
  const S = () => EA.store.state;
  const P = { prefill: null, openThread: null, msgTo: 'both', labFilter: 'All', labSort: 'trending', openComments: null, current: null };

  const NAV_PARTNER = [['overview', 'Overview', 'home'], ['projects', 'Collaborations', 'briefcase'], ['proposals', 'Proposals', 'file'], ['messages', 'Messages', 'message'], ['bookings', 'Bookings', 'calendar'], ['lab', 'Innovation Center', 'bulb'], ['settings', 'Settings', 'sliders']];
  const NAV_HQ = [['overview', 'HQ overview', 'home'], ['inquiries', 'Inquiries', 'inbox'], ['projects', 'Collaborations', 'briefcase'], ['proposals', 'Proposals', 'file'], ['messages', 'Messages', 'message'], ['bookings', 'Bookings', 'calendar'], ['lab', 'Innovation Center', 'bulb'], ['reviews', 'Audience reviews', 'heart'], ['automations', 'Automations', 'zap']];

  const first = (n) => String(n || '').split(' ')[0];
  const hq = () => EA.store.isHQ();
  const acting = () => S().session.actingAs || 'kelsey';
  const actorName = () => (hq() ? whoLabel(acting()) : (EA.store.user() || {}).name);
  const partnerOf = (id) => EA.store.partner(id) || { company: 'Unknown', color: '#999' };
  const stageLabel = (k) => (EA.STAGES.find((s) => s.key === k) || {}).label || k;
  const head = (title, sub, actions = '') => `<header class="p-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="p-actions">${actions}</div></header>`;
  const pct = (p) => (p.deliverables.length ? Math.round((p.deliverables.filter((d) => d.done).length / p.deliverables.length) * 100) : 0);
  const go = (tab, param) => { location.hash = `#/portal/${tab}${param ? '/' + param : ''}`; };
  const rerender = () => { if (P.current) render(P.current.el, P.current.tab, P.current.param); };
  const partnerCtx = (pid) => { const p = partnerOf(pid); return { company: p.company, partnerEmail: p.email, partnerPhone: p.phone, partnerSms: !!p.smsUpdates }; };

  const PROP_STATUS = { draft: ['', 'Draft'], submitted: ['gold', 'Submitted'], 'in-review': ['lagoon', 'In review'], 'changes-requested': ['warn', 'Changes requested'], accepted: ['ok', 'Accepted'], declined: ['danger', 'Declined'] };
  const propTag = (s) => { const [c, l] = PROP_STATUS[s] || ['', s]; return `<span class="tag ${c}">${l}</span>`; };
  const side = () => (hq() ? 'creator' : 'partner');
  function awaitingMe() {
    return EA.store.scoped('proposals').filter((p) => (p.from !== side() && ['submitted', 'in-review'].includes(p.status)) || (p.from === side() && p.status === 'changes-requested'));
  }

  /* ======================================================================
     Shell
     ====================================================================== */
  function render(el, tab = 'overview', param) {
    P.current = { el, tab, param };
    const u = EA.store.user();
    if (!u) return auth(el, tab === 'register' ? 'register' : 'signin', tab);
    const nav = hq() ? NAV_HQ : NAV_PARTNER;
    if (!nav.find((n) => n[0] === tab)) tab = 'overview';
    P.current.tab = tab;
    const p = EA.store.myPartner();
    const badges = {
      messages: EA.store.unreadTotal(),
      proposals: awaitingMe().length,
      inquiries: hq() ? S().inquiries.filter((i) => i.status === 'new').length : 0,
      reviews: hq() ? S().reviews.filter((r) => r.status === 'pending').length : 0,
      projects: hq() ? 0 : EA.store.scoped('projects').filter((x) => x.stage === 'review').length,
    };
    el.innerHTML = `<section class="portal">
      <aside class="p-side" aria-label="Portal navigation">
        <div class="p-org">${hq() ? avatar('both', 'lg') : avatar({ name: p.company, color: p.color }, 'lg')}<div><b>${hq() ? 'Kelsey &amp; Zach HQ' : esc(p.company)}</b><small>${hq() ? 'Creator workspace' : esc(u.name)}</small></div></div>
        <nav class="p-nav">${nav.map(([k, l, ic]) => `<a href="#/portal/${k}" class="${k === tab ? 'active' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${icon(ic)} ${l}${badges[k] ? `<span class="badge" aria-label="${badges[k]} pending">${badges[k]}</span>` : ''}</a>`).join('')}</nav>
        <div class="p-side-foot">
          ${hq() ? `<div class="acting">Acting as<div class="seg">${['kelsey', 'zach'].map((w) => `<button type="button" data-act="${w}" class="${acting() === w ? 'on' : ''}">${whoLabel(w)}</button>`).join('')}</div></div>` : ''}
          <a class="btn btn-soft btn-sm" href="#/">${icon('globe')} Public site</a>
          <button type="button" class="btn btn-ghost btn-sm" data-logout>${icon('logout')} Sign out</button>
        </div>
      </aside>
      <div class="p-main" id="pmain"></div>
    </section>`;
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      if (a) { S().session.actingAs = a.dataset.act; EA.store.save(); rerender(); toast(`Now acting as <b>${esc(whoLabel(a.dataset.act))}</b><small>Replies, approvals and the phone preview switch to ${esc(whoLabel(a.dataset.act))}.</small>`, { icon: 'users', ms: 2600 }); return; }
      if (e.target.closest('[data-logout]')) { EA.store.logout(); location.hash = '#/portal'; }
    };
    el.onsubmit = el.oninput = el.onchange = null;
    const main = el.querySelector('#pmain');
    (VIEWS[tab] || VIEWS.overview)(main, param);
  }

  /** Handles cross-view shortcuts; returns true when it consumed the click. */
  function common(e) {
    const t = e.target.closest('[data-go],[data-open-project],[data-open-proposal],[data-new-proposal],[data-pitch],[data-open-thread],[data-new-thread]');
    if (!t) return false;
    if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.openProject) openProject(t.dataset.openProject);
    else if (t.dataset.openProposal) openProposal(t.dataset.openProposal);
    else if (t.hasAttribute('data-new-proposal')) newProposal();
    else if (t.hasAttribute('data-pitch')) pitchIdea();
    else if (t.dataset.openThread) { P.openThread = t.dataset.openThread; go('messages'); }
    else if (t.hasAttribute('data-new-thread')) newThread();
    return true;
  }

  /* ======================================================================
     Auth: sign in + new partner registration
     ====================================================================== */
  function auth(el, mode, wanted) {
    const pf = P.prefill || {};
    const redirect = wanted && wanted !== 'register' ? wanted : 'overview';
    el.innerHTML = `<section class="auth">
      <div class="auth-card">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${mode === 'signin'}" class="${mode === 'signin' ? 'on' : ''}" data-mode="signin">Existing partner</button>
          <button type="button" role="tab" aria-selected="${mode === 'register'}" class="${mode === 'register' ? 'on' : ''}" data-mode="register">New partner registration</button>
        </div>
        ${mode === 'signin' ? `
          <h2 style="font-size:1.6rem">Welcome back</h2>
          <form id="signin" novalidate>
            <div class="field"><label for="si-email">Work email</label><input id="si-email" name="email" type="email" required autocomplete="username" placeholder="you@brand.com"><span class="err">Enter your email</span></div>
            <div class="field"><label for="si-pass">Password</label><input id="si-pass" name="password" type="password" required autocomplete="current-password"><span class="err">Enter your password</span></div>
            <p class="err-msg muted" style="color:var(--danger);display:none;font-size:.86rem" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit">${icon('lock')} Sign in</button>
            <p class="muted" style="font-size:.8rem;margin:12px 0 0">At launch: passwordless magic link or Google sign-in via Supabase Auth, with optional 2FA.</p>
          </form>
          <div class="demo-logins"><span class="eyebrow" style="margin:0">Demo shortcuts</span>
            <button type="button" data-demo="u_maya">${avatar({ name: 'Maya Torres', color: '#1f7a80' })}<span><b>Explore as a partner</b><small>Maya Torres · Sunline Resorts (sample brand)</small></span></button>
            <button type="button" data-demo="u_hq">${avatar('both')}<span><b>View as Kelsey &amp; Zach</b><small>HQ: inquiries, pipeline, reviews &amp; automations</small></span></button>
          </div>` : `
          <h2 style="font-size:1.6rem">Create your partner workspace</h2>
          <p class="muted" style="font-size:.9rem">Already sent an inquiry? Use the same email and we’ll link it automatically.</p>
          <form id="register" novalidate>
            <div class="grid-2">
              <div class="field"><label for="r-company">Company *</label><input id="r-company" name="company" required value="${esc(pf.company)}"><span class="err">Required</span></div>
              <div class="field"><label for="r-cat">Category *</label><select id="r-cat" name="category" required><option value="">Choose one</option>${EA.CATEGORIES.map((c) => `<option ${c === pf.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><span class="err">Required</span></div>
              <div class="field"><label for="r-name">Your name *</label><input id="r-name" name="name" required value="${esc(pf.name)}" autocomplete="name"><span class="err">Required</span></div>
              <div class="field"><label for="r-title">Your role</label><input id="r-title" name="title" placeholder="Marketing lead"></div>
              <div class="field"><label for="r-email">Work email *</label><input id="r-email" name="email" type="email" required value="${esc(pf.email)}" autocomplete="email"><span class="err">Enter a valid email</span></div>
              <div class="field"><label for="r-phone">Mobile <span class="hint">(text updates)</span></label><input id="r-phone" name="phone" type="tel" value="${esc(pf.phone)}"></div>
              <div class="field"><label for="r-web">Website</label><input id="r-web" name="website" value="${esc(pf.website)}"></div>
              <div class="field"><label for="r-pass">Password *</label><input id="r-pass" name="password" type="password" required data-minlen="8" autocomplete="new-password"><span class="err">8+ characters</span></div>
            </div>
            <label class="check" style="margin-bottom:16px"><input type="checkbox" name="agree" required> I agree to the partner terms and privacy policy.</label>
            <p class="err-msg" style="color:var(--danger);display:none;font-size:.86rem" role="alert"></p>
            <button class="btn btn-gold btn-block" type="submit">${icon('sparkle')} Create partner account</button>
          </form>`}
      </div>
      <aside class="auth-aside">
        <p class="eyebrow">Partner Portal</p>
        <h2>Your private line to <em>Kelsey &amp; Zach</em></h2>
        <div class="auth-feats">
          <div>${icon('briefcase')}<span><b>Collaborations</b><span>Deliverables, due dates and one-click content approval.</span></span></div>
          <div>${icon('file')}<span><b>Proposals</b><span>Submit, revise and accept — with full version history.</span></span></div>
          <div>${icon('message')}<span><b>Secure messages</b><span>Message Kelsey, Zach or both. They get a text when you do.</span></span></div>
          <div>${icon('calendar')}<span><b>Booking</b><span>Live availability for check-ins, reviews and strategy sessions.</span></span></div>
          <div>${icon('bulb')}<span><b>Innovation Center</b><span>Pitch and vote on themes; claim slots on upcoming trips.</span></span></div>
        </div>
        <div class="secure-note">${icon('shield')}<span>Each partner only sees their own company’s data (row-level security), all traffic is encrypted, and messages never leave the portal except as notifications to Kelsey &amp; Zach.</span></div>
      </aside>
    </section>`;

    el.onclick = (e) => {
      const m = e.target.closest('[data-mode]');
      if (m) { location.hash = m.dataset.mode === 'register' ? '#/portal/register' : `#/portal${redirect !== 'overview' ? '/' + redirect : ''}`; if (m.dataset.mode === (mode)) auth(el, mode, wanted); return; }
      const d = e.target.closest('[data-demo]');
      if (d) { EA.store.login(d.dataset.demo); go(redirect === 'register' ? 'overview' : redirect); rerenderSoon(); }
    };
    el.onsubmit = (e) => {
      e.preventDefault();
      const form = e.target;
      const errEl = form.querySelector('.err-msg');
      if (!validate(form)) return;
      const d = formData(form);
      if (form.id === 'signin') {
        const u = S().users.find((x) => x.email.toLowerCase() === d.email.toLowerCase() && x.password === d.password);
        if (!u) { errEl.textContent = 'That email and password don’t match. Try a demo shortcut below (password for demo accounts: “demo”).'; errEl.style.display = 'block'; return; }
        EA.store.login(u.id); go(redirect); rerenderSoon();
      } else {
        if (S().users.some((x) => x.email.toLowerCase() === d.email.toLowerCase())) { errEl.textContent = 'An account with this email already exists — sign in instead.'; errEl.style.display = 'block'; return; }
        register(d);
      }
    };
  }
  const rerenderSoon = () => setTimeout(() => EA.app.route(), 0);

  function register(d) {
    const st = S();
    const pid = uid('p');
    const partner = { id: pid, company: d.company, category: d.category, website: d.website, contact: d.name, email: d.email, phone: d.phone, status: 'pending', since: new Date().toISOString(), audience: 25000, color: '#5a6b8c', smsUpdates: !!d.phone, emailUpdates: true };
    const user = { id: uid('u'), role: 'partner', partnerId: pid, name: d.name, title: d.title, email: d.email, password: d.password, color: '#5a6b8c' };
    st.partners.push(partner); st.users.push(user);
    // Link an earlier inquiry (and its discovery call) by email.
    const inq = st.inquiries.find((i) => i.email.toLowerCase() === d.email.toLowerCase() && !i.partnerId);
    if (inq) {
      inq.partnerId = pid; inq.status = 'converted';
      st.bookings.filter((b) => b.inquiryId === inq.id).forEach((b) => { b.partnerId = pid; });
    }
    st.threads.unshift({ id: uid('t'), partnerId: pid, subject: 'Welcome to the portal 🌴', messages: [{ id: uid('m'), from: 'kelsey', body: `Welcome aboard, ${first(d.name)}! This is your private line to both of us. ${inq ? 'We’ve linked the inquiry you sent — ' : ''}Drop questions, ideas or files here anytime; we get a text the moment you message.`, at: new Date().toISOString(), readBy: ['hq'] }] });
    EA.store.save();
    EA.notify.dispatch('partner.registered', { company: d.company, name: d.name, email: d.email, linked: !!inq });
    P.prefill = null;
    EA.store.login(user.id);
    go('overview');
    rerenderSoon();
  }

  /* ======================================================================
     Overview — partner
     ====================================================================== */
  function upcomingBookings() {
    return EA.store.scoped('bookings').filter((b) => b.status === 'confirmed' && new Date(b.start) > Date.now()).sort((a, b) => new Date(a.start) - new Date(b.start));
  }
  function bookingRow(b, opts = {}) {
    const d = new Date(b.start);
    const who = b.with === 'both' ? avatar('kelsey') + avatar('zach') : avatar(b.with);
    const company = b.partnerId ? partnerOf(b.partnerId).company : ((S().inquiries.find((i) => i.id === b.inquiryId) || {}).company || 'Prospect');
    return `<div class="bk-item"><div class="date-tile"><small>${esc(d.toLocaleDateString('en-US', { month: 'short', timeZone: EA.ui.TZ }))}</small><b>${esc(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: EA.ui.TZ }))}</b></div>
      <div class="grow"><b class="t">${esc(EA.booking.TYPES[b.type].label)}${opts.showCompany ? ' · ' + esc(company) : ''}</b>
        <small>${esc(fmt.when(b.start))}${localTz !== EA.ui.TZ ? ' · ' + esc(fmt.localTime(b.start)) + ' your time' : ''} · ${b.minutes} min</small>
        ${b.notes ? `<small>“${esc(b.notes)}”</small>` : ''}
        ${opts.actions ? `<div class="acts"><button type="button" class="btn btn-xs btn-soft" data-ics="${b.id}">${icon('download')} .ics</button><a class="btn btn-xs btn-soft" target="_blank" rel="noopener" href="${esc(EA.booking.calendarLinks(b, company).gcal)}">Google</a><button type="button" class="btn btn-xs btn-danger-soft" data-cancel="${b.id}">Cancel</button></div>` : ''}</div>
      <span class="avatar-stack">${who}</span></div>`;
  }

  function pOverview(main) {
    const u = EA.store.user();
    const p = EA.store.myPartner();
    const projects = EA.store.scoped('projects');
    const active = projects.filter((x) => x.stage !== 'complete');
    const waiting = awaitingMe();
    const unread = EA.store.unreadTotal();
    const next = upcomingBookings()[0];
    const review = active.filter((x) => x.stage === 'review');
    const attention = [
      ...waiting.map((x) => `<div class="list-row"><span class="row-ico">${icon('file')}</span><div class="grow"><b>${x.status === 'changes-requested' ? 'Revise' : 'Review'} proposal: ${esc(x.title)}</b><small>${x.from === 'creator' ? 'From Kelsey &amp; Zach' : 'Changes requested'} · ${esc(fmt.ago(x.updatedAt))}</small></div><button class="btn btn-xs btn-primary" data-open-proposal="${x.id}">Open</button></div>`),
      ...review.map((x) => `<div class="list-row"><span class="row-ico">${icon('eye')}</span><div class="grow"><b>Content ready for your approval</b><small>${esc(x.title)}</small></div><button class="btn btn-xs btn-primary" data-open-project="${x.id}">Review</button></div>`),
      unread ? `<div class="list-row"><span class="row-ico">${icon('message')}</span><div class="grow"><b>${unread} unread message${unread > 1 ? 's' : ''} from Kelsey &amp; Zach</b><small>Secure inbox</small></div><button class="btn btn-xs btn-primary" data-go="messages">Read</button></div>` : '',
    ].filter(Boolean);
    const activity = projects.flatMap((x) => x.activity.map((a) => ({ ...a, title: x.title }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);

    const isNew = Date.now() - new Date(p.since).getTime() < 864e5;
    main.innerHTML = head(`${isNew ? 'Welcome' : 'Welcome back'}, ${esc(first(u.name))} 👋`, `${esc(p.company)} × Kelsey &amp; Zach`, `<button class="btn btn-primary btn-sm" data-go="bookings">${icon('calendar')} Book a call</button><button class="btn btn-soft btn-sm" data-go="messages">${icon('message')} Message K&amp;Z</button>`)
      + (p.status === 'pending' ? `<div class="banner">${icon('clock')}<span><b>Your account is being verified by Kelsey &amp; Zach.</b> You can already message them, book a call and pitch ideas — full collaboration access unlocks once verified (usually same day).</span></div>` : '')
      + `<div class="kpis">
          <div class="kpi">${icon('briefcase')}<div class="v">${active.length}</div><div class="l">Active collaborations</div></div>
          <div class="kpi">${icon('file')}<div class="v">${waiting.length}</div><div class="l">Proposals awaiting you</div></div>
          <div class="kpi">${icon('message')}<div class="v">${unread}</div><div class="l">Unread messages</div></div>
          <div class="kpi">${icon('calendar')}<div class="v" style="font-size:1.15rem;padding-top:8px">${next ? esc(fmt.day(next.start)) : '—'}</div><div class="l">${next ? esc(fmt.time(next.start)) + ' · next call' : 'No calls booked'}</div></div>
        </div>
        <div class="cols"><div>
          <div class="card"><div class="card-h"><h3>Needs your attention</h3></div>${attention.join('') || '<p class="empty">You’re all caught up ✨</p>'}</div>
          <div class="card"><div class="card-h"><h3>Active collaborations</h3><button class="link-btn" data-go="projects">View board</button></div>
            ${active.map((x) => `<div class="list-row"><span class="row-ico">${icon('briefcase')}</span><div class="grow"><b>${esc(x.title)}</b><small>${esc(stageLabel(x.stage))} · due ${esc(fmt.short(x.due))}</small><div class="progress"><i style="width:${pct(x)}%"></i></div></div><button class="btn btn-xs btn-soft" data-open-project="${x.id}">Open</button></div>`).join('') || '<p class="empty">No active collaborations yet — start one from a proposal or the Innovation Center.</p>'}</div>
        </div><div>
          <div class="card"><div class="card-h"><h3>Quick actions</h3></div><div class="quick">
            <button data-go="bookings">${icon('calendar')} Book a call</button><button data-new-thread>${icon('message')} Message K&amp;Z</button>
            <button data-new-proposal>${icon('file')} New proposal</button><button data-pitch>${icon('bulb')} Pitch an idea</button></div></div>
          <div class="card"><div class="card-h"><h3>Upcoming calls</h3></div>${upcomingBookings().slice(0, 3).map((b) => bookingRow(b)).join('') || '<p class="empty">No calls booked.</p>'}</div>
          <div class="card"><div class="card-h"><h3>Recent activity</h3></div><ul class="activity">${activity.map((a) => `<li><span>${esc(a.text)}<small>${esc(a.title)} · ${esc(fmt.ago(a.at))}</small></span></li>`).join('') || '<li>Nothing yet</li>'}</ul></div>
        </div></div>`;
    main.onclick = (e) => { common(e); };
  }

  /* ======================================================================
     Overview — HQ
     ====================================================================== */
  function hOverview(main) {
    const st = S();
    const open = st.projects.filter((p) => p.stage !== 'complete');
    const pipeline = open.reduce((n, p) => n + p.value, 0) + st.proposals.filter((p) => ['submitted', 'in-review', 'changes-requested'].includes(p.status)).reduce((n, p) => n + p.budget, 0);
    const newInq = st.inquiries.filter((i) => i.status === 'new');
    const week = upcomingBookings().filter((b) => new Date(b.start) - Date.now() < 7 * 864e5);
    const pending = st.partners.filter((p) => p.status === 'pending');
    const waiting = awaitingMe();
    const reviews = st.reviews.filter((r) => r.status === 'pending');
    const h = EA.ui.tzParts(new Date()).h;
    const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const sky = h < 12 ? '☀️' : h < 18 ? '🌤️' : '🌙';
    const c = EA.store.counters();
    const byStage = EA.STAGES.map((s) => [s.label, st.projects.filter((p) => p.stage === s.key).length]);
    const max = Math.max(1, ...byStage.map((x) => x[1]));
    const attention = [
      ...newInq.map((i) => `<div class="list-row"><span class="row-ico">${icon('inbox')}</span><div class="grow"><b>New inquiry: ${esc(i.company)}</b><small>${esc(i.category)} · ${esc(i.budget)} · ${esc(fmt.ago(i.createdAt))}</small></div><button class="btn btn-xs btn-primary" data-inq="${i.id}">Open</button></div>`),
      ...pending.map((p) => `<div class="list-row"><span class="row-ico">${icon('users')}</span><div class="grow"><b>Verify new partner: ${esc(p.company)}</b><small>${esc(p.contact)} · ${esc(p.email)}</small></div><button class="btn btn-xs btn-lagoon" data-verify="${p.id}">Verify</button></div>`),
      ...waiting.map((p) => `<div class="list-row"><span class="row-ico">${icon('file')}</span><div class="grow"><b>Proposal to review: ${esc(p.title)}</b><small>${esc(partnerOf(p.partnerId).company)} · ${esc(fmt.money(p.budget))}</small></div><button class="btn btn-xs btn-primary" data-open-proposal="${p.id}">Review</button></div>`),
      reviews.length ? `<div class="list-row"><span class="row-ico">${icon('heart')}</span><div class="grow"><b>${reviews.length} audience comment${reviews.length > 1 ? 's' : ''} ready to approve</b><small>Passed the sentiment filter</small></div><button class="btn btn-xs btn-primary" data-go="reviews">Curate</button></div>` : '',
    ].filter(Boolean);

    main.innerHTML = head(`${greet}, ${esc(whoLabel(acting()))} ${sky}`, 'Here’s what needs you today across every partnership.', `<a class="btn btn-soft btn-sm" href="#/">${icon('eye')} See live counters</a><button class="btn btn-primary btn-sm" data-new-proposal>${icon('plus')} New proposal</button>`)
      + `<div class="kpis">
          <div class="kpi">${icon('trending')}<div class="v">${esc(fmt.money(pipeline))}</div><div class="l">Open pipeline (projects + proposals)</div></div>
          <div class="kpi">${icon('inbox')}<div class="v">${newInq.length}</div><div class="l">New inquiries</div></div>
          <div class="kpi">${icon('calendar')}<div class="v">${week.length}</div><div class="l">Calls in the next 7 days</div></div>
          <div class="kpi">${icon('message')}<div class="v">${EA.store.unreadTotal()}</div><div class="l">Unread partner messages</div></div>
        </div>
        <div class="cols"><div>
          <div class="card"><div class="card-h"><h3>Needs your attention</h3></div>${attention.join('') || '<p class="empty">Inbox zero. Go enjoy the lagoon 🌊</p>'}</div>
          <div class="card"><div class="card-h"><h3>Pipeline by stage</h3><button class="link-btn" data-go="projects">Open board</button></div>
            ${byStage.map(([l, n]) => `<div class="bar-row" style="grid-template-columns:120px 1fr 24px"><span>${esc(l)}</span><span class="bar"><i style="width:${(n / max) * 100}%;background:var(--gold)"></i></span><span>${n}</span></div>`).join('')}</div>
        </div><div>
          <div class="card"><div class="card-h"><h3>Upcoming calls</h3><button class="link-btn" data-go="bookings">All</button></div>${upcomingBookings().slice(0, 4).map((b) => bookingRow(b, { showCompany: true })).join('') || '<p class="empty">No calls booked.</p>'}</div>
          <div class="card"><div class="card-h"><h3>Live site counters</h3><span class="tag ok">● live</span></div>
            <div class="bar-row" style="grid-template-columns:1fr auto"><span>Partnerships delivered</span><b>${c.partnerships}</b></div>
            <div class="bar-row" style="grid-template-columns:1fr auto"><span>Adventures</span><b>${c.adventures}</b></div>
            <div class="bar-row" style="grid-template-columns:1fr auto"><span>Experiences</span><b>${c.experiences}</b></div>
            <small class="muted">Partnerships tick up automatically when a collaboration is marked Complete.</small></div>
          <div class="card"><div class="card-h"><h3>Latest automations</h3><button class="link-btn" data-go="automations">Log</button></div><ul class="log">${st.notifications.slice(0, 4).map(logItem).join('')}</ul></div>
        </div></div>`;
    main.onclick = (e) => {
      if (common(e)) return;
      const v = e.target.closest('[data-verify]');
      if (v) { const p = partnerOf(v.dataset.verify); p.status = 'active'; EA.store.save(); toast(`<b>${esc(p.company)} verified</b><small>They now have full portal access.</small>`); rerender(); return; }
      const i = e.target.closest('[data-inq]');
      if (i) openInquiry(i.dataset.inq);
    };
  }

  /* ======================================================================
     Inquiries (HQ)
     ====================================================================== */
  const INQ_STATUS = { new: ['gold', 'New'], reviewing: ['lagoon', 'Reviewing'], converted: ['ok', 'Partner'], declined: ['danger', 'Declined'] };
  function inquiries(main) {
    const list = S().inquiries.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    main.innerHTML = head('Inquiries', 'Every “Start a partnership” submission. You and Zach got a text for each one.', `<a class="btn btn-soft btn-sm" href="#/partner">${icon('eye')} View inquiry page</a>`)
      + `<div class="card table-wrap"><table class="tbl"><thead><tr><th>Brand</th><th>Interest</th><th>Budget</th><th>Discovery call</th><th>Received</th><th>Status</th></tr></thead><tbody>
        ${list.map((i) => { const b = S().bookings.find((x) => x.id === i.bookingId); const [c, l] = INQ_STATUS[i.status] || ['', i.status]; return `<tr class="clickable" data-inq="${i.id}" tabindex="0"><td><b>${esc(i.company)}</b><small>${esc(i.name)} · ${esc(i.category)}</small></td><td>${esc((i.formats || []).join(', ') || '—')}</td><td>${esc(i.budget)}</td><td>${b ? `${esc(fmt.when(b.start))}<small>with ${esc(whoLabel(b.with))}</small>` : '<small>Not booked</small>'}</td><td>${esc(fmt.ago(i.createdAt))}</td><td><span class="tag ${c}">${l}</span></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No inquiries yet.</td></tr>'}
      </tbody></table></div>`;
    main.onclick = (e) => { const r = e.target.closest('[data-inq]'); if (r) openInquiry(r.dataset.inq); };
    main.onkeydown = (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-inq]'); if (r) openInquiry(r.dataset.inq); } };
  }
  function openInquiry(id) {
    const i = S().inquiries.find((x) => x.id === id);
    const b = S().bookings.find((x) => x.id === i.bookingId);
    const body = modal.open(`<p class="eyebrow">Inquiry · ${esc(fmt.ago(i.createdAt))}</p><h2>${esc(i.company)}</h2>
      <dl class="kv"><dt>Contact</dt><dd>${esc(i.name)} · <a href="mailto:${esc(i.email)}">${esc(i.email)}</a>${i.phone ? ' · ' + esc(i.phone) : ''}</dd>
      <dt>Category</dt><dd>${esc(i.category)}</dd><dt>Website</dt><dd>${esc(i.website || '—')}</dd>
      <dt>Formats</dt><dd>${esc((i.formats || []).join(', ') || 'Open to ideas')}</dd><dt>Budget</dt><dd>${esc(i.budget)}</dd><dt>Timeline</dt><dd>${esc(i.timeline)}</dd>
      <dt>Goals</dt><dd>${esc(i.goals)}</dd><dt>Discovery call</dt><dd>${b ? `${esc(fmt.when(b.start))} with ${esc(whoLabel(b.with))}` : 'Not booked'}</dd></dl>
      <div class="sticky-actions">
        ${i.status !== 'converted' ? `<button class="btn btn-gold" data-convert>${icon('users')} Convert to partner &amp; invite</button>` : `<span class="tag ok">${icon('check')} Converted to partner</span>`}
        ${i.status === 'new' ? '<button class="btn btn-soft" data-reviewing>Mark reviewing</button>' : ''}
        <a class="btn btn-soft" href="mailto:${esc(i.email)}?subject=${encodeURIComponent('Ellis Adventures × ' + i.company)}">${icon('mail')} Reply by email</a>
        ${i.status !== 'declined' && i.status !== 'converted' ? '<button class="btn btn-danger-soft" data-decline>Decline</button>' : ''}
      </div>`, { label: 'Inquiry' });
    body.onclick = (e) => {
      if (e.target.closest('[data-reviewing]')) { i.status = 'reviewing'; EA.store.save(); modal.close(); rerender(); }
      else if (e.target.closest('[data-decline]')) { i.status = 'declined'; EA.store.save(); modal.close(); toast('Inquiry declined'); rerender(); }
      else if (e.target.closest('[data-convert]')) {
        const st = S();
        const pid = uid('p');
        st.partners.push({ id: pid, company: i.company, category: i.category, website: i.website, contact: i.name, email: i.email, phone: i.phone, status: 'active', since: new Date().toISOString(), audience: 25000, color: '#5a6b8c', smsUpdates: !!i.phone, emailUpdates: true });
        if (!st.users.some((u) => u.email.toLowerCase() === i.email.toLowerCase())) st.users.push({ id: uid('u'), role: 'partner', partnerId: pid, name: i.name, email: i.email, password: 'demo', color: '#5a6b8c' });
        st.threads.unshift({ id: uid('t'), partnerId: pid, subject: `Welcome, ${i.company}!`, messages: [{ id: uid('m'), from: acting(), body: `So great to meet you, ${first(i.name)}! This portal is where we’ll share the proposal, plan the shoot and keep everything in one place.`, at: new Date().toISOString(), readBy: ['hq'] }] });
        i.status = 'converted'; i.partnerId = pid;
        if (b) b.partnerId = pid;
        EA.store.save();
        EA.notify.dispatch('partner.invited', { name: first(i.name), company: i.company, actor: whoLabel(acting()), partnerEmail: i.email });
        modal.close(); rerender();
      }
    };
  }

  /* ======================================================================
     Collaborations (projects)
     ====================================================================== */
  function projects(main) {
    const list = EA.store.scoped('projects');
    main.innerHTML = head('Collaborations', hq() ? 'Every partnership in flight. Move a project to Complete and the live counter on the site ticks up.' : 'Track deliverables, approve content and see what’s next.', `<button class="btn btn-primary btn-sm" data-new-proposal>${icon('plus')} ${hq() ? 'New proposal' : 'Propose a collaboration'}</button>`)
      + `<div class="board">${EA.STAGES.map((s) => { const items = list.filter((p) => p.stage === s.key); return `<div class="col"><div class="col-h">${esc(s.label)}<span>${items.length}</span></div>${items.map((p) => `<button class="pcard" data-open-project="${p.id}"><b>${esc(p.title)}</b>${hq() ? `<small class="muted">${esc(partnerOf(p.partnerId).company)}</small>` : `<small class="muted">${esc(p.format)}</small>`}<div class="progress"><i style="width:${pct(p)}%"></i></div><div class="meta"><span>${p.deliverables.filter((d) => d.done).length}/${p.deliverables.length} deliverables</span><span>${p.stage === 'complete' ? 'Done' : 'Due ' + esc(fmt.short(p.due))}</span></div></button>`).join('') || '<p class="muted" style="font-size:.8rem;padding:4px">—</p>'}</div>`; }).join('')}</div>`;
    main.onclick = (e) => { common(e); };
  }

  function openProject(id) {
    const body = modal.open('', { size: 'drawer', label: 'Collaboration' });
    const draw = () => {
      const p = EA.store.find('projects', id);
      const idx = EA.STAGES.findIndex((s) => s.key === p.stage);
      const next = EA.STAGES[idx + 1];
      const partner = partnerOf(p.partnerId);
      body.innerHTML = `<p class="eyebrow">${esc(partner.company)} · ${esc(p.format)}</p><h2 style="font-size:1.8rem;padding-right:40px">${esc(p.title)}</h2>
        <dl class="kv"><dt>Destination</dt><dd>${esc(p.destination)}</dd><dt>Timeline</dt><dd>${esc(fmt.date(p.start))} → ${esc(fmt.date(p.due))}</dd>${hq() ? `<dt>Value</dt><dd>${esc(fmt.money(p.value))}</dd>` : ''}<dt>Stage</dt><dd><b>${esc(stageLabel(p.stage))}</b></dd></dl>
        <div class="stage-track">${EA.STAGES.map((s, i) => `<div class="${i < idx ? 'done' : i === idx ? 'cur' : ''}">${esc(s.label)}</div>`).join('')}</div>
        <div class="sticky-actions" style="border:0;margin:0 0 18px;padding:0">
          ${hq() && next ? `<button class="btn btn-primary btn-sm" data-advance>${next.key === 'complete' ? icon('star') + ' Mark complete' : 'Move to ' + esc(next.label) + ' ' + icon('arrow')}</button>` : ''}
          ${!hq() && p.stage === 'review' ? `<button class="btn btn-gold btn-sm" data-approve>${icon('check')} Approve content</button><button class="btn btn-soft btn-sm" data-edits>${icon('message')} Request edits</button>` : ''}
          <button class="btn btn-soft btn-sm" data-book>${icon('calendar')} Book a call about this</button>
        </div>
        <div class="card"><div class="card-h"><h3>Deliverables</h3><small class="muted">${pct(p)}% complete</small></div><ul class="checklist">
          ${p.deliverables.map((d) => `<li class="${d.done ? 'done' : ''}"><button type="button" class="cbox ${d.done ? 'on' : ''}" data-dl="${d.id}" ${hq() ? '' : 'disabled'} aria-label="${d.done ? 'Mark not done' : 'Mark done'}: ${esc(d.title)}">${d.done ? icon('check') : ''}</button><span class="t">${esc(d.title)}</span><small>${esc(fmt.short(d.due))}</small></li>`).join('')}
        </ul>${hq() ? '' : '<small class="muted">Kelsey &amp; Zach check items off as they’re delivered.</small>'}</div>
        <div class="card"><div class="card-h"><h3>Activity</h3></div><ul class="activity">${p.activity.map((a) => `<li><span>${esc(a.text)}<small>${esc(fmt.ago(a.at))}</small></span></li>`).join('')}</ul></div>`;
    };
    draw();
    body.onclick = (e) => {
      const p = EA.store.find('projects', id);
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.dl && hq()) {
        const d = p.deliverables.find((x) => x.id === t.dataset.dl);
        d.done = !d.done;
        if (d.done) p.activity.unshift({ at: new Date().toISOString(), text: `${whoLabel(acting())} delivered: ${d.title}` });
        EA.store.save(); draw(); rerender();
      } else if (t.hasAttribute('data-advance')) {
        const idx = EA.STAGES.findIndex((s) => s.key === p.stage);
        const next = EA.STAGES[idx + 1];
        p.stage = next.key;
        if (next.key === 'complete') p.deliverables.forEach((d) => { d.done = true; });
        p.activity.unshift({ at: new Date().toISOString(), text: `${whoLabel(acting())} moved this to ${next.label}` });
        EA.store.save();
        EA.notify.dispatch('project.stage', { title: p.title, stage: next.label, actor: whoLabel(acting()), ...partnerCtx(p.partnerId), silent: next.key === 'complete' });
        if (next.key === 'complete') {
          EA.store.emit('counters', { source: 'project' });
          toast(`<b>🎉 Partnership #${EA.store.counters().partnerships} delivered!</b><small>The live counter on the public site just ticked up. Partner notified by email.</small>`, { icon: 'star', ms: 6500 });
        }
        draw(); rerender();
      } else if (t.hasAttribute('data-approve')) {
        p.stage = 'live';
        p.activity.unshift({ at: new Date().toISOString(), text: `${EA.store.user().name} approved the content — going live` });
        EA.store.save();
        EA.notify.dispatch('project.stage', { title: p.title, stage: 'Live (approved by partner)', actor: EA.store.user().name, ...partnerCtx(p.partnerId), partnerEmail: null });
        draw(); rerender();
      } else if (t.hasAttribute('data-edits')) {
        const subj = `Edits: ${p.title}`;
        let th = S().threads.find((x) => x.partnerId === p.partnerId && x.subject === subj);
        if (!th) { th = { id: uid('t'), partnerId: p.partnerId, subject: subj, messages: [] }; S().threads.unshift(th); EA.store.save(); }
        P.openThread = th.id; P.msgTo = 'both';
        modal.close(); go('messages');
      } else if (t.hasAttribute('data-book')) {
        P.bookInitial = { type: hq() ? 'checkin' : p.stage === 'review' ? 'review' : 'checkin', projectId: p.id };
        modal.close(); go('bookings');
      }
    };
  }

  /* ======================================================================
     Proposals
     ====================================================================== */
  function proposals(main) {
    const list = EA.store.scoped('proposals').slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const waiting = awaitingMe();
    const closed = list.filter((p) => ['accepted', 'declined'].includes(p.status));
    const inFlight = list.filter((p) => !waiting.includes(p) && !closed.includes(p));
    const row = (p) => { const v = p.versions[p.versions.length - 1].v; return `<button class="prop" data-open-proposal="${p.id}"><span class="row-ico">${icon('file')}</span><div class="grow"><b>${esc(p.title)}</b><small>${hq() ? esc(partnerOf(p.partnerId).company) + ' · ' : ''}${p.from === side() ? 'Sent by you' : p.from === 'creator' ? 'From Kelsey &amp; Zach' : 'From ' + esc(partnerOf(p.partnerId).company)} · v${v} · updated ${esc(fmt.ago(p.updatedAt))}</small></div>${propTag(p.status)}<span class="amt">${esc(fmt.money(p.budget))}</span></button>`; };
    const group = (t, arr, empty) => `<div class="card"><div class="card-h"><h3>${t}</h3><span class="tag">${arr.length}</span></div>${arr.map(row).join('') || `<p class="empty">${empty}</p>`}</div>`;
    main.innerHTML = head('Proposals', hq() ? 'Send proposals to partners and review the ones they submit — every version is kept.' : 'Proposals between you and Kelsey &amp; Zach, with full version history.', `<button class="btn btn-primary btn-sm" data-new-proposal>${icon('plus')} New proposal</button>`)
      + group('Awaiting you', waiting, 'Nothing waiting on you.') + group('In progress', inFlight, 'No proposals in flight.') + group('Closed', closed, 'No closed proposals yet.');
    main.onclick = (e) => { common(e); };
  }

  function openProposal(id) {
    const p = EA.store.find('proposals', id);
    if (hq() && p.from === 'partner' && p.status === 'submitted') {
      p.status = 'in-review'; p.versions.push({ v: p.versions[p.versions.length - 1].v, at: new Date().toISOString(), by: whoLabel(acting()), note: 'Opened for review' }); EA.store.save();
    }
    const body = modal.open('', { size: 'wide', label: 'Proposal' });
    let asking = false;
    const draw = () => {
      const iAmRecipient = p.from !== side();
      const canDecide = iAmRecipient && ['submitted', 'in-review'].includes(p.status);
      const canRevise = !iAmRecipient && p.status === 'changes-requested';
      body.innerHTML = `<p class="eyebrow">${p.from === 'creator' ? 'From Kelsey &amp; Zach' : 'From ' + esc(partnerOf(p.partnerId).company)} → ${p.from === 'creator' ? esc(partnerOf(p.partnerId).company) : 'Kelsey &amp; Zach'}</p>
        <h2 style="padding-right:40px">${esc(p.title)}</h2><p>${propTag(p.status)}</p>
        <div class="cols" style="grid-template-columns:1.5fr 1fr">
          <div>
            <dl class="kv"><dt>Budget</dt><dd><b>${esc(fmt.money(p.budget))}</b></dd><dt>Timeline</dt><dd>${esc(p.timeline)}</dd><dt>Usage rights</dt><dd>${esc(p.usage || '—')}</dd><dt>Objective</dt><dd>${esc(p.objective)}</dd></dl>
            <h4>Deliverables</h4><ul class="checklist">${String(p.deliverables).split('\n').filter(Boolean).map((d) => `<li><span class="cbox on" aria-hidden="true">${icon('check')}</span><span class="t">${esc(d)}</span></li>`).join('')}</ul>
          </div>
          <div class="card"><h4>Version history</h4><ul class="versions">${p.versions.slice().reverse().map((v) => `<li><b>v${v.v} · ${esc(v.note)}</b><small>${esc(v.by)} · ${esc(fmt.ago(v.at))}</small></li>`).join('')}</ul></div>
        </div>
        ${asking ? `<div class="field" style="margin-top:16px"><label for="chg">What should change?</label><textarea id="chg" placeholder="e.g. Could we swap one Reel for a Stories takeover and move the shoot to May?"></textarea></div><div class="sticky-actions"><button class="btn btn-primary" data-send-changes>${icon('send')} Send back for changes</button><button class="btn btn-soft" data-cancel-ask>Cancel</button></div>` : `
        <div class="sticky-actions">
          ${canDecide ? `<button class="btn btn-gold" data-accept>${icon('check')} Accept proposal</button><button class="btn btn-soft" data-ask>Request changes</button>${hq() ? '<button class="btn btn-danger-soft" data-decline>Decline</button>' : ''}` : ''}
          ${canRevise ? `<button class="btn btn-primary" data-revise>${icon('file')} Revise &amp; resubmit</button>` : ''}
          ${p.projectId ? `<button class="btn btn-soft" data-project>${icon('briefcase')} View collaboration</button>` : ''}
          <button class="btn btn-soft" data-discuss>${icon('message')} Discuss in messages</button>
        </div>`}`;
    };
    draw();
    const decide = (status, note) => {
      p.status = status; p.updatedAt = new Date().toISOString();
      p.versions.push({ v: p.versions[p.versions.length - 1].v, at: p.updatedAt, by: actorName(), note });
      if (status === 'accepted' && !p.projectId) {
        const fmtGuess = EA.FORMATS.find((f) => p.title.toLowerCase().includes(f.key.toLowerCase().split(' ')[0])) || EA.FORMATS[0];
        const proj = { id: uid('pr'), partnerId: p.partnerId, title: p.title, format: fmtGuess.key, destination: '—', stage: 'contracted', value: Number(p.budget) || 0, start: new Date().toISOString(), due: new Date(Date.now() + 45 * 864e5).toISOString(),
          deliverables: String(p.deliverables).split('\n').filter(Boolean).map((t, i) => ({ id: uid('d'), title: t, due: new Date(Date.now() + (14 + i * 7) * 864e5).toISOString(), done: false })),
          activity: [{ at: p.updatedAt, text: `Proposal accepted by ${actorName()} — collaboration created` }] };
        S().projects.unshift(proj); p.projectId = proj.id;
      }
      EA.store.save();
      EA.notify.dispatch('proposal.decision', { title: p.title, decision: status === 'changes-requested' ? 'sent back for changes' : status, actor: actorName(), ...partnerCtx(p.partnerId), partnerEmail: hq() ? partnerOf(p.partnerId).email : null });
      rerender();
    };
    body.onclick = (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-accept')) { decide('accepted', 'Accepted'); modal.close(); toast(`<b>Proposal accepted 🎉</b><small>“${esc(p.title)}” is now a collaboration in Contracted.</small>`, { icon: 'check' }); }
      else if (t.hasAttribute('data-decline')) { decide('declined', 'Declined'); draw(); }
      else if (t.hasAttribute('data-ask')) { asking = true; draw(); body.querySelector('#chg').focus(); }
      else if (t.hasAttribute('data-cancel-ask')) { asking = false; draw(); }
      else if (t.hasAttribute('data-send-changes')) { const note = body.querySelector('#chg').value.trim() || 'Requested changes'; asking = false; decide('changes-requested', 'Changes requested: ' + note); draw(); }
      else if (t.hasAttribute('data-revise')) { modal.close(); newProposal({ revising: p.id }); }
      else if (t.hasAttribute('data-project')) { modal.close(); go('projects'); setTimeout(() => openProject(p.projectId), 50); }
      else if (t.hasAttribute('data-discuss')) {
        let th = S().threads.find((x) => x.partnerId === p.partnerId && x.subject === p.title);
        if (!th) { th = { id: uid('t'), partnerId: p.partnerId, subject: p.title, messages: [] }; S().threads.unshift(th); EA.store.save(); }
        P.openThread = th.id; modal.close(); go('messages');
      }
    };
  }

  function newProposal(pre = {}) {
    const editing = pre.revising ? EA.store.find('proposals', pre.revising) : null;
    const v = editing || pre;
    const partners = S().partners;
    const body = modal.open(`<p class="eyebrow">${editing ? 'Revise proposal' : 'New proposal'}</p><h2>${editing ? esc(editing.title) : hq() ? 'Send a proposal to a partner' : 'Propose a collaboration'}</h2>
      <form novalidate>
        ${hq() && !editing ? `<div class="field"><label for="np-partner">Partner *</label><select id="np-partner" name="partnerId" required><option value="">Choose a partner</option>${partners.map((p) => `<option value="${p.id}" ${p.id === v.partnerId ? 'selected' : ''}>${esc(p.company)}</option>`).join('')}</select><span class="err">Pick a partner</span></div>` : ''}
        <div class="field"><label for="np-title">Title *</label><input id="np-title" name="title" required value="${esc(v.title)}"><span class="err">Required</span></div>
        <div class="field"><label for="np-obj">Objective *</label><textarea id="np-obj" name="objective" required>${esc(v.objective)}</textarea><span class="err">Required</span></div>
        <div class="field"><label for="np-del">Deliverables * <span class="hint">one per line</span></label><textarea id="np-del" name="deliverables" required placeholder="1 hero Reel (60s)&#10;Carousel guide&#10;6 Stories with link">${esc(v.deliverables)}</textarea><span class="err">Add at least one deliverable</span></div>
        <div class="grid-3">
          <div class="field"><label for="np-budget">Budget (USD) *</label><input id="np-budget" name="budget" type="number" min="0" step="250" required value="${esc(v.budget)}"><span class="err">Required</span></div>
          <div class="field"><label for="np-time">Timeline *</label><input id="np-time" name="timeline" required value="${esc(v.timeline)}" placeholder="e.g. May 2027"><span class="err">Required</span></div>
          <div class="field"><label for="np-use">Usage rights</label><select id="np-use" name="usage">${['6-month organic', '12-month organic', '12-month organic + 90-day paid whitelisting', 'Perpetual organic'].map((o) => `<option ${o === v.usage ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div>
        ${editing ? '<div class="field"><label for="np-note">What changed?</label><input id="np-note" name="note" placeholder="Swapped a Reel for Stories; moved shoot to May"></div>' : ''}
        <div class="wiz-foot"><button type="button" class="btn btn-soft" data-close>Cancel</button><button class="btn btn-gold" type="submit">${icon('send')} ${editing ? 'Resubmit' : 'Send proposal'}</button></div>
      </form>`, { size: 'wide', label: 'Proposal form' });
    const form = body.querySelector('form');
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!validate(form)) return;
      const d = formData(form);
      const now = new Date().toISOString();
      let p;
      if (editing) {
        p = editing;
        Object.assign(p, { title: d.title, objective: d.objective, deliverables: d.deliverables, budget: Number(d.budget), timeline: d.timeline, usage: d.usage, status: 'submitted', updatedAt: now });
        p.versions.push({ v: p.versions[p.versions.length - 1].v + 1, at: now, by: actorName(), note: d.note || 'Revised & resubmitted' });
      } else {
        const partnerId = hq() ? d.partnerId : EA.store.user().partnerId;
        p = { id: uid('pp'), partnerId, from: side(), title: d.title, objective: d.objective, deliverables: d.deliverables, budget: Number(d.budget), timeline: d.timeline, usage: d.usage, status: 'submitted', versions: [{ v: 1, at: now, by: actorName(), note: 'Sent proposal' }], createdAt: now, updatedAt: now, windowId: pre.windowId, ideaId: pre.ideaId };
        S().proposals.unshift(p);
      }
      EA.store.save();
      const ctx = { title: p.title, budget: fmt.money(p.budget), timeline: p.timeline, revised: !!editing, version: p.versions[p.versions.length - 1].v, actor: actorName(), ...partnerCtx(p.partnerId) };
      if (side() === 'partner') EA.notify.dispatch('proposal.submitted', { ...ctx, partnerEmail: null });
      else EA.notify.dispatch('proposal.sent', ctx);
      modal.close();
      if (P.current && P.current.tab === 'proposals') rerender(); else go('proposals');
    };
  }

  /* ======================================================================
     Messages (secure direct line)
     ====================================================================== */
  const REPLIES = ['Got it — thank you! We’ll dig in and get back to you today 🙌', 'Love this. Let us check the shoot schedule and circle back by tomorrow!', 'Perfect, adding it to our planning doc now ✈️', 'Thanks for the heads up — we’re on it!'];
  function senderOf(m) {
    if (m.from === 'kelsey' || m.from === 'zach') return { av: avatar(m.from), name: whoLabel(m.from), hq: true };
    const u = S().users.find((x) => x.id === m.from) || { name: 'Partner' };
    return { av: avatar(u), name: u.name, hq: false };
  }
  function messages(main) {
    const threads = EA.store.visibleThreads();
    const sideKey = hq() ? 'hq' : 'partner';
    let cur = threads.find((t) => t.id === P.openThread) || (window.innerWidth > 760 ? threads[0] : null);
    P.openThread = cur ? cur.id : null;
    if (cur) { cur.messages.forEach((m) => { m.readBy = m.readBy || []; if (!m.readBy.includes(sideKey)) m.readBy.push(sideKey); }); EA.store.save(); }
    const me = EA.store.user();
    const company = cur ? partnerOf(cur.partnerId).company : '';
    main.innerHTML = head('Messages', hq() ? 'Every partner conversation in one inbox. Partners get an email when you reply.' : 'Your private, direct line to Kelsey &amp; Zach.', `<button class="btn btn-primary btn-sm" data-new-thread>${icon('plus')} New message</button>`)
      + `<div class="msg-shell ${cur ? 'has-thread' : ''}">
        <div class="threads"><div class="threads-h"><b>${threads.length} conversation${threads.length === 1 ? '' : 's'}</b><span class="e2e">${icon('lock')} Private</span></div>
          ${threads.map((t) => { const l = EA.store.last(t); const un = EA.store.unread(t, sideKey); return `<button class="thread ${cur && t.id === cur.id ? 'on' : ''} ${un ? 'unread' : ''}" data-thread="${t.id}">${hq() ? avatar({ name: partnerOf(t.partnerId).company, color: partnerOf(t.partnerId).color }) : avatar('both')}<span class="grow">${hq() ? `<span class="co">${esc(partnerOf(t.partnerId).company)}</span>` : ''}<b>${esc(t.subject)}</b><span class="snip">${l.body ? esc((senderOf(l).name.split(' ')[0]) + ': ' + l.body) : 'No messages yet'}</span></span><small class="muted">${l.at ? esc(fmt.ago(l.at)) : ''}</small></button>`; }).join('') || '<p class="empty">No conversations yet.</p>'}
        </div>
        <div class="convo">${cur ? `
          <div class="convo-h"><div style="display:flex;gap:10px;align-items:center"><button class="icon-btn back-btn" data-back aria-label="Back to conversations">${icon('chevL')}</button><div><b>${esc(cur.subject)}</b><br><span class="e2e">${icon('lock')} Visible only to ${esc(company)} and Kelsey &amp; Zach · encrypted in transit &amp; at rest</span></div></div><span class="avatar-stack">${avatar('kelsey')}${avatar('zach')}</span></div>
          <div class="msgs" id="msgs">${cur.messages.map((m) => { const s = senderOf(m); const mine = hq() ? s.hq : m.from === me.id; return `<div class="msg ${mine ? 'me' : ''}">${s.av}<div><div class="who">${esc(s.name)}${m.to && !s.hq ? ` → ${esc(whoLabel(m.to))}` : ''} · ${esc(fmt.ago(m.at))}</div><div class="bubble">${esc(m.body)}${m.attachment ? `<br><span class="attach-chip">${icon('clip')} ${esc(m.attachment)}</span>` : ''}</div></div></div>`; }).join('') || '<p class="empty">Say hello 👋</p>'}</div>
          <form class="composer" id="composer">
            ${hq() ? `<div class="to">Replying as ${['kelsey', 'zach'].map((w) => `<button type="button" data-as="${w}" class="${acting() === w ? 'on' : ''}">${whoLabel(w)}</button>`).join('')} <span>· ${esc(company)} gets an email</span></div>`
              : `<div class="to">To: ${['both', 'kelsey', 'zach'].map((w) => `<button type="button" data-to="${w}" class="${P.msgTo === w ? 'on' : ''}">${w === 'both' ? 'Both' : whoLabel(w)}</button>`).join('')} <span>· ${P.msgTo === 'both' ? 'they both get' : esc(whoLabel(P.msgTo)) + ' gets'} a text instantly</span></div>`}
            <div class="composer-row"><button type="button" class="icon-btn" data-attach aria-label="Attach a file" title="Attach a file">${icon('clip')}</button><textarea name="body" rows="1" placeholder="Write a message…" aria-label="Message"></textarea><button type="submit" class="icon-btn send" aria-label="Send">${icon('send')}</button></div>
            <div id="attach-note" class="muted" style="font-size:.78rem;margin-top:6px"></div>
          </form>` : '<div class="empty" style="margin:auto">Pick a conversation</div>'}
        </div></div>`;
    const box = main.querySelector('#msgs');
    if (box) box.scrollTop = box.scrollHeight;
    let attachment = null;
    main.onclick = (e) => {
      if (common(e)) return;
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.thread) { P.openThread = t.dataset.thread; messages(main); }
      else if (t.hasAttribute('data-back')) { P.openThread = null; const shell = main.querySelector('.msg-shell'); shell.classList.remove('has-thread'); }
      else if (t.dataset.to) { P.msgTo = t.dataset.to; main.querySelectorAll('[data-to]').forEach((b) => b.classList.toggle('on', b === t)); main.querySelector('.to span').textContent = `· ${P.msgTo === 'both' ? 'they both get' : whoLabel(P.msgTo) + ' gets'} a text instantly`; }
      else if (t.dataset.as) { S().session.actingAs = t.dataset.as; EA.store.save(); main.querySelectorAll('[data-as]').forEach((b) => b.classList.toggle('on', b === t)); }
      else if (t.hasAttribute('data-attach')) { attachment = attachment ? null : 'shot-list-v2.pdf'; main.querySelector('#attach-note').innerHTML = attachment ? `${icon('clip')} ${attachment} attached (demo) — files are stored privately and virus-scanned at launch` : ''; }
    };
    const form = main.querySelector('#composer');
    if (!form) return;
    const ta = form.querySelector('textarea');
    ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
    form.onsubmit = (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      const now = new Date().toISOString();
      if (hq()) {
        cur.messages.push({ id: uid('m'), from: acting(), body, at: now, readBy: ['hq'], attachment });
        EA.store.save();
        EA.notify.dispatch('message.reply', { sender: whoLabel(acting()), subject: cur.subject, body, ...partnerCtx(cur.partnerId) });
        messages(main);
        return;
      }
      cur.messages.push({ id: uid('m'), from: me.id, to: P.msgTo, body, at: now, readBy: ['partner'], attachment });
      EA.store.save();
      EA.notify.dispatch('message.received', { company, sender: me.name, subject: cur.subject, body, only: P.msgTo === 'both' ? null : [P.msgTo] });
      messages(main);
      simulateReply(main, cur.id, P.msgTo === 'zach' ? 'zach' : 'kelsey');
    };
    setTimeout(() => ta.focus({ preventScroll: true }), 30);
  }
  /** Demo only: show a typing indicator, then a friendly reply, as a realtime insert would. */
  function simulateReply(main, threadId, who) {
    setTimeout(() => {
      const box = document.getElementById('msgs');
      if (!box || P.openThread !== threadId) return;
      box.insertAdjacentHTML('beforeend', `<div class="typing" id="typing">${esc(whoLabel(who))} is typing <i></i><i></i><i></i></div>`);
      box.scrollTop = box.scrollHeight;
    }, 1200);
    setTimeout(() => {
      const th = S().threads.find((t) => t.id === threadId);
      if (!th) return;
      th.messages.push({ id: uid('m'), from: who, body: REPLIES[th.messages.length % REPLIES.length], at: new Date().toISOString(), readBy: ['hq'] });
      EA.store.save();
      if (P.current && P.current.tab === 'messages' && P.openThread === threadId && document.getElementById('msgs')) messages(main);
      else toast(`<b>New message from ${esc(whoLabel(who))}</b><small>${esc(th.subject)}</small>`, { icon: 'message' });
    }, 3600);
  }
  function newThread() {
    const body = modal.open(`<p class="eyebrow">New message</p><h2>${hq() ? 'Message a partner' : 'Message Kelsey &amp; Zach'}</h2>
      <form novalidate>
        ${hq() ? `<div class="field"><label for="nt-p">Partner *</label><select id="nt-p" name="partnerId" required><option value="">Choose a partner</option>${S().partners.map((p) => `<option value="${p.id}">${esc(p.company)}</option>`).join('')}</select><span class="err">Pick a partner</span></div>`
          : `<div class="field"><span class="label">To</span><div class="chips">${['both', 'kelsey', 'zach'].map((w) => `<label class="chip"><input type="radio" name="to" value="${w}" ${w === 'both' ? 'checked' : ''}><span>${w === 'both' ? 'Both of us' : whoLabel(w)}</span></label>`).join('')}</div></div>`}
        <div class="field"><label for="nt-s">Subject *</label><input id="nt-s" name="subject" required><span class="err">Required</span></div>
        <div class="field"><label for="nt-b">Message *</label><textarea id="nt-b" name="body" required></textarea><span class="err">Required</span></div>
        <div class="wiz-foot"><span class="e2e">${icon('lock')} Private to your team and Kelsey &amp; Zach</span><button class="btn btn-primary" type="submit">${icon('send')} Send</button></div>
      </form>`, { label: 'New message' });
    const form = body.querySelector('form');
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!validate(form)) return;
      const d = formData(form);
      const me = EA.store.user();
      const pid = hq() ? d.partnerId : me.partnerId;
      const th = { id: uid('t'), partnerId: pid, subject: d.subject, messages: [] };
      const now = new Date().toISOString();
      if (hq()) th.messages.push({ id: uid('m'), from: acting(), body: d.body, at: now, readBy: ['hq'] });
      else th.messages.push({ id: uid('m'), from: me.id, to: d.to, body: d.body, at: now, readBy: ['partner'] });
      S().threads.unshift(th);
      EA.store.save();
      if (hq()) EA.notify.dispatch('message.reply', { sender: whoLabel(acting()), subject: d.subject, body: d.body, ...partnerCtx(pid) });
      else EA.notify.dispatch('message.received', { company: partnerOf(pid).company, sender: me.name, subject: d.subject, body: d.body, only: d.to === 'both' ? null : [d.to] });
      P.openThread = th.id; P.msgTo = d.to || 'both';
      modal.close();
      if (P.current.tab === 'messages') rerender(); else go('messages');
      if (!hq()) setTimeout(() => simulateReply(document.getElementById('pmain'), th.id, d.to === 'zach' ? 'zach' : 'kelsey'), 50);
    };
  }

  /* ======================================================================
     Bookings — same booking component as the new-partner inquiry
     ====================================================================== */
  function bookings(main) {
    const list = upcomingBookings();
    if (hq()) {
      const past = EA.store.scoped('bookings').filter((b) => b.status === 'confirmed' && new Date(b.start) <= Date.now());
      main.innerHTML = head('Bookings', 'Discovery calls from new inquiries and partner meetings — all in one calendar.', `<button class="btn btn-soft btn-sm" data-copy>${icon('link')} Copy booking link</button>`)
        + `<div class="cols"><div class="card"><div class="card-h"><h3>Upcoming (${list.length})</h3></div><div id="bk-list">${list.map((b) => bookingRow(b, { showCompany: true, actions: true })).join('') || '<p class="empty">No upcoming calls.</p>'}</div></div>
          <div><div class="card"><div class="card-h"><h3>Availability rules</h3><span class="sample-badge">Sample</span></div>
            <div class="list-row">${avatar('kelsey')}<div class="grow"><b>Kelsey</b><small>Mon–Fri · 10am–4pm ET</small></div></div>
            <div class="list-row">${avatar('zach')}<div class="grow"><b>Zach</b><small>Mon–Fri · 9am–12pm, 2–6pm ET</small></div></div>
            <div class="list-row">${avatar('both')}<div class="grow"><b>Both</b><small>Only when both calendars are free (collective event)</small></div></div>
            <h4 style="margin-top:16px">On location (no calls)</h4>${S().blackouts.map((b) => `<div class="list-row"><span class="row-ico">${icon('plane')}</span><div class="grow"><b>${esc(b.label)}</b><small>${esc(fmt.short(b.from + 'T16:00:00Z'))} – ${esc(fmt.short(b.to + 'T16:00:00Z'))}</small></div></div>`).join('')}
            <small class="muted">At launch these sync from Google Calendar via Cal.com — travel days block automatically.</small></div>
          <div class="card"><div class="card-h"><h3>Past calls</h3></div>${past.slice(-4).reverse().map((b) => bookingRow(b, { showCompany: true })).join('') || '<p class="empty">None yet.</p>'}</div></div></div>`;
    } else {
      const p = EA.store.myPartner();
      main.innerHTML = head('Bookings', 'Live availability for Kelsey, Zach — or both. You’ll get a calendar invite instantly.', '')
        + `<div class="cols"><div class="card" id="bk-mount"></div><div><div class="card"><div class="card-h"><h3>Your upcoming calls</h3></div><div id="bk-list">${list.map((b) => bookingRow(b, { actions: true })).join('') || '<p class="empty">No calls booked yet.</p>'}</div></div>
          <div class="card"><div class="card-h"><h3>Tip</h3></div><p class="muted" style="margin:0;font-size:.9rem">Striped days are when we’re on location. You can still message us — we get a text and reply between shoots.</p></div></div></div>`;
      EA.booking.mount(main.querySelector('#bk-mount'), {
        mode: 'existing', partner: p, projects: EA.store.scoped('projects').filter((x) => x.stage !== 'complete'), initial: P.bookInitial,
        onBooked: () => { main.querySelector('#bk-list').innerHTML = upcomingBookings().map((b) => bookingRow(b, { actions: true })).join(''); },
      });
      P.bookInitial = null;
    }
    main.onclick = (e) => {
      if (common(e)) return;
      const ics = e.target.closest('[data-ics]');
      if (ics) { const b = EA.store.find('bookings', ics.dataset.ics); EA.booking.calendarLinks(b, b.partnerId ? partnerOf(b.partnerId).company : '').ics(); return; }
      const c = e.target.closest('[data-cancel]');
      if (c) { const b = EA.store.find('bookings', c.dataset.cancel); b.status = 'cancelled'; EA.store.save(); toast(`<b>Call cancelled</b><small>${esc(fmt.when(b.start))} is open again. Everyone was emailed.</small>`, { icon: 'calendar' }); main.querySelector('#bk-list').innerHTML = upcomingBookings().map((x) => bookingRow(x, { showCompany: hq(), actions: true })).join('') || '<p class="empty">No upcoming calls.</p>'; return; }
      if (e.target.closest('[data-copy]')) { const url = location.href.split('#')[0] + '#/partner'; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Booking link copied'), () => toast(`Booking link: ${esc(url)}`)); }
    };
  }

  /* ======================================================================
     Innovation Center
     ====================================================================== */
  const CAT_NICHE = { 'Hotel / resort': 'Luxury stays', 'Tourism board': 'Experiences', 'Travel gear': 'Adventure gear', Wellness: 'Wellness', 'Tech / creator tools': 'Tech & creator tools', 'Food & beverage': 'Food & culture', 'Experiences & tours': 'Experiences' };
  function fitScore(niches) {
    if (!niches || !niches.length) return 50;
    const core = niches.filter((n) => EA.CORE_NICHES.includes(n)).length / niches.length;
    const p = EA.store.myPartner();
    const bonus = p && niches.includes(CAT_NICHE[p.category]) ? 14 : 0;
    return Math.max(40, Math.min(98, Math.round(56 + core * 28 + bonus)));
  }
  function lab(main) {
    const st = S();
    const me = EA.store.user();
    let ideas = st.ideas.filter((i) => P.labFilter === 'All' || i.niches.includes(P.labFilter));
    ideas = ideas.sort((a, b) => (P.labSort === 'new' ? new Date(b.createdAt) - new Date(a.createdAt) : b.votes - a.votes));
    main.innerHTML = head('Innovation Center', 'Influence what we create next — pitch themes, vote, and claim a spot on upcoming trips.', `<button class="btn btn-primary btn-sm" data-pitch>${icon('plus')} Pitch an idea</button>`)
      + `<div class="lab-head"><div><h2>Co-create the next campaign</h2><p>Ideas from partners and from us live here. Votes show which themes resonate across brands; the strongest mutual-audience fits get planned into real trips — with the partners who backed them first in line.</p></div>
          <div class="lab-flow"><div><b>1 · Pitch</b>A theme, place or format</div><div><b>2 · Vote</b>Partners signal demand</div><div><b>3 · Co-create</b>Greenlit → proposal → trip</div></div></div>
        <div class="card-h"><h3>Open collaboration windows</h3><span class="sample-badge">Sample itinerary</span></div>
        <div class="windows">${st.windows.map((w) => { const open = w.slots - w.taken; const reqs = st.proposals.filter((p) => p.windowId === w.id).length; return `<div class="win"><span class="when">${esc(fmt.month(w.start))} · ${esc(w.length)}</span><b>${esc(w.title)}</b><p>${esc(w.blurb)}</p><div class="chips">${w.niches.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div>
          <div class="foot"><span><span class="slots">${Array.from({ length: w.slots }, (_, i) => `<i class="${i < w.taken ? 'taken' : ''}"></i>`).join('')}</span><small class="muted">${open} of ${w.slots} partner slots open${reqs ? ` · ${reqs} request${reqs > 1 ? 's' : ''}` : ''}</small></span>
          ${hq() ? '' : `<button class="btn btn-xs btn-lagoon" data-slot="${w.id}" ${open ? '' : 'disabled'}>Request a slot</button>`}</div></div>`; }).join('')}</div>
        <div class="toolbar"><div class="chips">${['All', ...EA.NICHES].map((n) => `<button type="button" class="chip ${P.labFilter === n ? 'on' : ''}" data-filter="${esc(n)}">${esc(n)}</button>`).join('')}</div>
          <label class="field" style="margin:0;flex-direction:row;align-items:center;gap:8px"><span class="label" style="white-space:nowrap">Sort</span><select data-sort style="width:auto"><option value="trending" ${P.labSort === 'trending' ? 'selected' : ''}>Most votes</option><option value="new" ${P.labSort === 'new' ? 'selected' : ''}>Newest</option></select></label></div>
        <div class="ideas">${ideas.map((i) => { const voted = i.voters.includes(me.id); const fit = fitScore(i.niches); return `<div class="idea">
          <button type="button" class="vote-pill ${voted ? 'voted' : ''}" data-vote="${i.id}" aria-pressed="${voted}" aria-label="${voted ? 'Remove vote' : 'Vote'} for ${esc(i.title)} (${i.votes} votes)">${icon('up')}${i.votes}</button>
          <div class="grow">${EA.site.statusTag(i.status)}<h4>${esc(i.title)}</h4><p>${esc(i.pitch)}</p><div class="tags">${i.niches.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div>
            <div class="foot"><span>${icon('pin')} ${esc(i.destination)} · ${esc(i.season)}</span><span>by ${esc(i.by)}</span><span class="fit" title="Mutual audience fit">Fit <span class="meter"><i style="width:${fit}%"></i></span>${fit}%</span><button type="button" class="link-btn" data-comments="${i.id}">${i.comments.length} comment${i.comments.length === 1 ? '' : 's'}</button></div>
            ${P.openComments === i.id ? `<div class="comments">${i.comments.map((c) => `<div class="comment"><b>${esc(c.by)}</b> ${esc(c.text)} <small>· ${esc(fmt.ago(c.at))}</small></div>`).join('')}<form class="comment-form" data-cform="${i.id}"><input name="text" placeholder="Add a thought…" aria-label="Comment" required><button class="btn btn-xs btn-primary" type="submit">Post</button></form></div>` : ''}
            <div class="foot" style="margin-top:10px">${hq() ? `<select data-status="${i.id}" aria-label="Idea status" style="width:auto;padding:5px 8px;border-radius:8px;border:1.5px solid var(--line);background:var(--paper)">${['open', 'shortlisted', 'in-planning', 'greenlit'].map((s) => `<option value="${s}" ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : ''}<button type="button" class="btn btn-xs btn-soft" data-idea-proposal="${i.id}">${icon('file')} ${hq() ? 'Turn into proposal' : 'Propose a collaboration'}</button></div>
          </div></div>`; }).join('') || '<p class="empty">No ideas in this niche yet — pitch the first one!</p>'}</div>`;
    main.onclick = (e) => {
      if (common(e)) return;
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.filter) { P.labFilter = t.dataset.filter; lab(main); }
      else if (t.dataset.vote) {
        const i = st.ideas.find((x) => x.id === t.dataset.vote);
        const had = i.voters.includes(me.id);
        i.voters = had ? i.voters.filter((v) => v !== me.id) : i.voters.concat(me.id);
        i.votes += had ? -1 : 1;
        if (!had && i.votes >= 20 && !i.trendingSent) { i.trendingSent = true; EA.notify.dispatch('idea.trending', { title: i.title, votes: i.votes }); }
        EA.store.save(); lab(main);
      } else if (t.dataset.comments) { P.openComments = P.openComments === t.dataset.comments ? null : t.dataset.comments; lab(main); const inp = main.querySelector('.comment-form input'); if (inp) inp.focus(); }
      else if (t.dataset.slot) { const w = st.windows.find((x) => x.id === t.dataset.slot); newProposal({ title: `${w.title} — partner slot`, timeline: `${fmt.month(w.start)} (${w.length})`, objective: `Join the ${w.title} trip as a featured partner.`, windowId: w.id }); }
      else if (t.dataset.ideaProposal) { const i = st.ideas.find((x) => x.id === t.dataset.ideaProposal); newProposal({ title: i.title, objective: i.pitch, partnerId: i.partnerId, ideaId: i.id }); }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-sort]')) { P.labSort = e.target.value; lab(main); }
      if (e.target.matches('[data-status]')) { const i = st.ideas.find((x) => x.id === e.target.dataset.status); i.status = e.target.value; EA.store.save(); toast(`<b>${esc(i.title)}</b><small>Status → ${esc(i.status)}. Partners see the change right away.</small>`, { icon: 'bulb' }); lab(main); }
    };
    main.onsubmit = (e) => {
      const f = e.target.closest('[data-cform]');
      if (!f) return;
      e.preventDefault();
      const text = f.text.value.trim();
      if (!text) return;
      const i = st.ideas.find((x) => x.id === f.dataset.cform);
      i.comments.push({ by: hq() ? whoLabel(acting()) : me.name, text, at: new Date().toISOString() });
      EA.store.save(); lab(main);
    };
  }

  function pitchIdea() {
    const p = EA.store.myPartner();
    const body = modal.open(`<p class="eyebrow">Innovation Center</p><h2>Pitch a campaign idea</h2>
      <form novalidate><div class="cols" style="grid-template-columns:1.3fr 1fr;gap:22px">
        <div>
          <div class="field"><label for="pi-t">Idea title *</label><input id="pi-t" name="title" required placeholder="e.g. Sunrise to sunset on one island"><span class="err">Required</span></div>
          <div class="field"><label for="pi-p">The pitch *</label><textarea id="pi-p" name="pitch" required placeholder="What’s the story? Why would both of our audiences love it?"></textarea><span class="err">Required</span></div>
          <div class="grid-2"><div class="field"><label for="pi-d">Destination</label><input id="pi-d" name="destination" placeholder="Anywhere"></div>
            <div class="field"><label for="pi-s">Season</label><select id="pi-s" name="season">${['Any', 'Spring', 'Summer', 'Fall', 'Winter'].map((s) => `<option>${s}</option>`).join('')}</select></div></div>
          <div class="field"><span class="label">Niches *</span><div class="chips">${EA.NICHES.map((n) => `<label class="chip"><input type="checkbox" data-multi name="niches" value="${esc(n)}" ${p && CAT_NICHE[p.category] === n ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div></div>
        </div>
        <div>
          <div class="field"><label for="pi-a">${hq() ? 'Partner audience size' : 'Your audience size'} <span class="hint">(followers + customers)</span></label><input id="pi-a" name="audience" type="number" min="0" step="1000" value="${p ? p.audience : 50000}"></div>
          <div class="field"><label for="pi-o">Estimated audience overlap: <b id="ov-v">20%</b></label><input id="pi-o" name="overlap" type="range" min="0" max="60" value="20"></div>
          <div class="estimator" id="est"></div>
        </div>
      </div>
      <div class="wiz-foot"><button type="button" class="btn btn-soft" data-close>Cancel</button><button class="btn btn-gold" type="submit">${icon('bulb')} Share with partners</button></div></form>`, { size: 'wide', label: 'Pitch an idea' });
    const form = body.querySelector('form');
    const calc = () => {
      const d = formData(form);
      const aud = Number(d.audience) || 0;
      const ov = Number(d.overlap) / 100;
      const kz = EA.SAMPLE_AUDIENCE;
      const combined = aud + kz - ov * Math.min(aud, kz);
      const forYou = kz * (1 - ov);
      const forKZ = aud * (1 - ov) * 0.35;
      body.querySelector('#ov-v').textContent = `${d.overlap}%`;
      body.querySelector('#est').innerHTML = `<h4>Mutual growth scope</h4><div class="est-grid">
        <div><b>${fmt.compact(combined)}</b><small>Combined unique reach</small></div>
        <div><b>${fitScore(d.niches)}%</b><small>Niche fit with K&amp;Z</small></div>
        <div><b>+${fmt.compact(forYou)}</b><small>Net-new people for ${hq() ? 'the partner' : 'you'}</small></div>
        <div><b>+${fmt.compact(forKZ)}</b><small>Net-new for K&amp;Z if you co-promote</small></div></div>
        <p class="note">Planning estimate using a sample K&amp;Z audience of ${fmt.compact(kz)} and ~35% co-promotion reach. Live numbers come from Instagram Insights + your analytics.</p>`;
    };
    form.oninput = calc; form.onchange = calc; calc();
    form.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(form);
      const chipsField = form.querySelector('.chips').closest('.field');
      chipsField.classList.toggle('invalid', !d.niches.length);
      if (!validate(form) || !d.niches.length) return;
      const me = EA.store.user();
      const idea = { id: uid('i'), title: d.title, pitch: d.pitch, destination: d.destination || 'Anywhere', season: d.season, niches: d.niches, votes: 1, voters: [me.id], status: 'open', by: hq() ? 'Kelsey & Zach' : p.company, partnerId: hq() ? null : p.id, createdAt: new Date().toISOString(), comments: [] };
      S().ideas.unshift(idea);
      EA.store.save();
      if (!hq()) EA.notify.dispatch('idea.trending', { title: idea.title, by: idea.by, isNew: true });
      modal.close();
      P.labSort = 'new'; P.labFilter = 'All';
      if (P.current.tab === 'lab') rerender(); else go('lab');
    };
  }

  /* ======================================================================
     Audience reviews curation (HQ)
     ====================================================================== */
  function reviews(main) {
    const st = S();
    const pending = st.reviews.filter((r) => r.status === 'pending');
    const live = st.reviews.filter((r) => r.status === 'approved');
    const filtered = st.reviews.filter((r) => r.status === 'filtered' || r.status === 'hidden');
    const card = (r, acts) => `<div class="curate"><q>${esc(r.text)}</q>
      <div class="meta"><span>${icon('instagram')} @${esc(r.handle)}</span><span>on “${esc(r.post.cap)}”</span><span>${fmt.num(r.likes)} likes</span><span>${esc(fmt.ago(r.at))}</span></div>
      <div class="senti ${r.sentiment < st.settings.reviewThreshold ? 'low' : ''}">Sentiment <span class="meter"><i style="width:${Math.round(r.sentiment * 100)}%"></i></span>${Math.round(r.sentiment * 100)}%</div>
      <div class="acts">${acts}</div></div>`;
    main.innerHTML = head('Audience reviews', 'Positive Instagram comments become the “See what our audience is saying” wall — only after you approve them.', `<a class="btn btn-soft btn-sm" href="#/love">${icon('eye')} View the wall</a><button class="btn btn-primary btn-sm" data-sync>${icon('refresh')} Sync from Instagram</button>`)
      + `<div class="card"><div class="card-h"><h3>How the pipeline works</h3><span class="sample-badge">Sample comments</span></div>
          <div class="pipeline"><span>${icon('instagram')} New comments on your posts</span>${icon('arrow')}<span>AI sentiment score ≥ ${Math.round(st.settings.reviewThreshold * 100)}%</span>${icon('arrow')}<span>Your approval</span>${icon('arrow')}<span>Screenshot-style card</span>${icon('arrow')}<span>Live on the site</span></div>
          <div class="grid-2" style="margin-top:18px">
            <div class="field"><label for="thr">Minimum sentiment: <b id="thr-v">${Math.round(st.settings.reviewThreshold * 100)}%</b></label><input id="thr" type="range" min="60" max="99" value="${Math.round(st.settings.reviewThreshold * 100)}" data-thr></div>
            <label class="check" style="align-self:center"><span class="switch"><input type="checkbox" data-mask ${st.settings.maskHandles ? 'checked' : ''}><span></span></span> Mask commenter handles on the public site (privacy-friendly)</label>
          </div></div>
        <div class="card"><div class="card-h"><h3>Waiting for approval</h3><span class="tag gold">${pending.length}</span></div><div class="curate-grid">${pending.map((r) => card(r, `<button class="btn btn-xs btn-lagoon" data-approve="${r.id}">${icon('check')} Approve</button><button class="btn btn-xs btn-soft" data-hide="${r.id}">Hide</button>`)).join('') || '<p class="empty">Queue is empty. Hit “Sync from Instagram” to pull new comments.</p>'}</div></div>
        <div class="card"><div class="card-h"><h3>Live on the site</h3><span class="tag ok">${live.length}</span></div><div class="curate-grid">${live.map((r) => card(r, `<button class="btn btn-xs btn-soft" data-hide="${r.id}">Remove from site</button>`)).join('')}</div></div>
        ${filtered.length ? `<div class="card"><div class="card-h"><h3>Filtered out / hidden</h3><span class="tag">${filtered.length}</span></div><div class="curate-grid">${filtered.map((r) => card(r, `<button class="btn btn-xs btn-soft" data-approve="${r.id}">Approve anyway</button>`)).join('')}</div></div>` : ''}`;
    main.onclick = (e) => {
      if (common(e)) return;
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.approve) { st.reviews.find((r) => r.id === t.dataset.approve).status = 'approved'; EA.store.save(); toast('<b>Approved</b><small>It’s now scrolling on the public site.</small>', { icon: 'heart' }); reviews(main); }
      else if (t.dataset.hide) { st.reviews.find((r) => r.id === t.dataset.hide).status = 'hidden'; EA.store.save(); reviews(main); }
      else if (t.hasAttribute('data-sync')) {
        const pool = st.reviewPool;
        let passed = 0, cut = 0;
        for (let k = 0; k < 3; k++) {
          const src = pool[st.settings.reviewPoolIdx % pool.length];
          st.settings.reviewPoolIdx += 1;
          const ok = src.sentiment >= st.settings.reviewThreshold;
          ok ? passed++ : cut++;
          st.reviews.unshift({ id: uid('r'), handle: src.handle, text: src.text, post: src.post, likes: src.likes, at: new Date(Date.now() - Math.random() * 6 * 36e5).toISOString(), sentiment: src.sentiment, status: ok ? 'pending' : 'filtered' });
        }
        EA.store.save();
        if (passed) EA.notify.dispatch('review.pending', { count: passed, silent: true });
        toast(`<b>Synced 3 new comments</b><small>${passed} passed the sentiment filter · ${cut} filtered out${passed ? ' · Kelsey emailed' : ''}</small>`, { icon: 'instagram' });
        reviews(main);
      }
    };
    main.oninput = (e) => { if (e.target.matches('[data-thr]')) { st.settings.reviewThreshold = Number(e.target.value) / 100; main.querySelector('#thr-v').textContent = e.target.value + '%'; EA.store.save(); } };
    main.onchange = (e) => {
      if (e.target.matches('[data-mask]')) { st.settings.maskHandles = e.target.checked; EA.store.save(); toast(e.target.checked ? 'Handles masked on the public wall' : 'Full handles shown on the public wall', { icon: 'shield', ms: 2500 }); }
      if (e.target.matches('[data-thr]')) reviews(main);
    };
  }

  /* ======================================================================
     Automations (HQ) — text + email triggers
     ====================================================================== */
  const SAMPLE_CTX = { company: 'Test Brand Co.', category: 'Hotel / resort', budget: '$5,000–10,000', name: 'Alex Test', formats: ['Stay & Feature'], timeline: '1–3 months', goals: 'Testing the automation.', when: '', typeLabel: 'Discovery call', withLabel: 'Kelsey & Zach', minutes: 30, sender: 'Alex Test', subject: 'Test thread', body: 'Just testing the alerts!', title: 'Test proposal', revised: false, version: 1, decision: 'accepted', actor: 'Kelsey', stage: 'Live', votes: 20, count: 2, linked: false, email: 'alex@test.example' };
  function logItem(n) {
    return `<li><span class="ch ${n.channel}">${icon(n.channel === 'sms' ? 'phone' : 'mail')}</span><div class="grow"><b>${esc(n.channel === 'sms' ? 'Text' : 'Email')} → ${esc(EA.notify.toLabel(n))}</b><span>${esc(n.subject ? n.subject : n.body)}</span><small>${esc(n.event)} · ${esc(fmt.ago(n.at))}</small></div><span class="tag ${n.status === 'queued' ? 'warn' : 'ok'}">${n.status}</span></li>`;
  }
  function automations(main) {
    const st = S();
    const who = acting();
    const sms = st.notifications.filter((n) => n.channel === 'sms' && n.to === who).slice(0, 8).reverse();
    const RCP = [['kelsey', 'Kelsey'], ['zach', 'Zach'], ['inbox', 'Inbox'], ['partner', 'Partner']];
    main.innerHTML = head('Automations', 'Texts and emails that fire on their own — so no partner waits on you, even mid-adventure.', `<button class="btn btn-soft btn-sm" data-test="inquiry.created">${icon('zap')} Send a test alert</button>`)
      + `<div class="card"><div class="card-h"><h3>Rules</h3><small class="muted">${EA.notify.inQuietHours() ? '🌙 Quiet hours now — texts queue until morning' : 'Texts send instantly'}</small></div>
            <div class="table-wrap"><table class="rules"><thead><tr><th>When</th><th>Channels</th><th>Notify</th><th>On</th><th></th></tr></thead><tbody>
            ${st.automations.map((r) => `<tr><td><b>${esc(r.label)}</b><small>${esc(r.when)}</small></td>
              <td><span class="ch-toggle">${[['sms', 'phone', 'Text'], ['email', 'mail', 'Email']].map(([c, ic, l]) => `<button type="button" class="${r.channels.includes(c) ? 'on' : ''}" data-rule="${r.id}" data-ch="${c}" aria-pressed="${r.channels.includes(c)}">${icon(ic)} ${l}</button>`).join('')}</span></td>
              <td><span class="ch-toggle">${RCP.map(([k, l]) => `<button type="button" class="${r.to.includes(k) ? 'on' : ''}" data-rule="${r.id}" data-rcp="${k}" aria-pressed="${r.to.includes(k)}">${l}</button>`).join('')}</span></td>
              <td><label class="switch"><input type="checkbox" data-enable="${r.id}" ${r.enabled ? 'checked' : ''} aria-label="Enable ${esc(r.label)}"><span></span></label></td>
              <td><button type="button" class="btn btn-xs btn-soft" data-test="${r.event}">Test</button></td></tr>`).join('')}
            </tbody></table></div></div>
        <div class="cols-even" style="margin-top:16px"><div>
          <div class="card"><div class="card-h"><h3>Who gets notified</h3><span class="sample-badge">Placeholder numbers</span></div>
            <form id="contacts"><div class="grid-2">
              <div class="field"><label for="c-ks">Kelsey · mobile</label><input id="c-ks" name="kelsey.sms" value="${esc(st.contacts.kelsey.sms)}"></div>
              <div class="field"><label for="c-ke">Kelsey · email</label><input id="c-ke" name="kelsey.email" value="${esc(st.contacts.kelsey.email)}"></div>
              <div class="field"><label for="c-zs">Zach · mobile</label><input id="c-zs" name="zach.sms" value="${esc(st.contacts.zach.sms)}"></div>
              <div class="field"><label for="c-ze">Zach · email</label><input id="c-ze" name="zach.email" value="${esc(st.contacts.zach.email)}"></div>
              <div class="field"><label for="c-in">Shared inbox</label><input id="c-in" name="inbox.email" value="${esc(st.contacts.inbox.email)}"></div>
              <div class="field"><label>Quiet hours (ET)</label><div style="display:flex;gap:8px;align-items:center"><select name="quietStart" class="input">${[20, 21, 22, 23].map((h) => `<option value="${h}" ${h === st.settings.quietStart ? 'selected' : ''}>${h - 12}pm</option>`).join('')}</select> to <select name="quietEnd" class="input">${[6, 7, 8, 9].map((h) => `<option value="${h}" ${h === st.settings.quietEnd ? 'selected' : ''}>${h}am</option>`).join('')}</select></div></div>
            </div><button class="btn btn-primary btn-sm" type="submit">Save contacts</button></form></div>
        </div><div>
          <div class="card"><div class="card-h"><h3>${esc(whoLabel(who))}’s phone</h3><small class="muted">switch with “Acting as”</small></div>
            <div class="phone"><div class="phone-screen"><div class="phone-top">${avatar('both')}<b>Ellis HQ Alerts</b>Text message · ${esc(st.contacts[who].sms)}</div>
              <div class="phone-msgs" id="phone-msgs">${sms.map((n) => `<div class="sms-time">${esc(fmt.ago(n.at))}${n.status === 'queued' ? ' · queued' : ''}</div><div class="sms">${esc(n.body)}</div>`).join('') || '<p class="empty">No texts yet</p>'}</div></div></div></div>
          <div class="card"><div class="card-h"><h3>Delivery log</h3><small class="muted">${st.notifications.length} sends</small></div><ul class="log">${st.notifications.slice(0, 12).map(logItem).join('')}</ul></div>
        </div></div>`;
    const pm = main.querySelector('#phone-msgs');
    if (pm) pm.scrollTop = pm.scrollHeight;
    main.onclick = (e) => {
      if (common(e)) return;
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.rule) {
        const r = st.automations.find((x) => x.id === t.dataset.rule);
        const key = t.dataset.ch ? 'channels' : 'to';
        const val = t.dataset.ch || t.dataset.rcp;
        r[key] = r[key].includes(val) ? r[key].filter((x) => x !== val) : r[key].concat(val);
        EA.store.save(); automations(main);
      } else if (t.dataset.test) {
        EA.notify.dispatch(t.dataset.test, { ...SAMPLE_CTX, partnerEmail: 'alex@test.example' });
        automations(main);
      }
    };
    main.onchange = (e) => { if (e.target.dataset.enable) { st.automations.find((x) => x.id === e.target.dataset.enable).enabled = e.target.checked; EA.store.save(); } };
    main.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(e.target);
      ['kelsey', 'zach'].forEach((w) => { st.contacts[w].sms = d[`${w}.sms`]; st.contacts[w].email = d[`${w}.email`]; });
      st.contacts.inbox.email = d['inbox.email'];
      st.settings.quietStart = Number(d.quietStart); st.settings.quietEnd = Number(d.quietEnd);
      EA.store.save(); toast('Contacts saved'); automations(main);
    };
  }

  /* ======================================================================
     Settings (partner)
     ====================================================================== */
  function settings(main) {
    const p = EA.store.myPartner();
    const team = S().users.filter((u) => u.partnerId === p.id);
    main.innerHTML = head('Settings', 'Your company profile, team and how Kelsey &amp; Zach reach you.')
      + `<div class="cols-even"><div class="card"><div class="card-h"><h3>Company profile</h3></div>
          <form id="profile" novalidate>
            <div class="field"><label for="s-c">Company *</label><input id="s-c" name="company" required value="${esc(p.company)}"><span class="err">Required</span></div>
            <div class="grid-2"><div class="field"><label for="s-w">Website</label><input id="s-w" name="website" value="${esc(p.website)}"></div>
            <div class="field"><label for="s-cat">Category</label><select id="s-cat" name="category">${EA.CATEGORIES.map((c) => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
            <div class="field"><label for="s-a">Audience size <span class="hint">used by the Innovation Center growth estimator</span></label><input id="s-a" name="audience" type="number" min="0" step="1000" value="${p.audience}"></div>
            <h4 style="margin-top:8px">Notifications</h4>
            <label class="check" style="margin-bottom:10px"><span class="switch"><input type="checkbox" name="emailUpdates" ${p.emailUpdates ? 'checked' : ''}><span></span></span> Email me when Kelsey &amp; Zach reply, send proposals or update a collaboration</label>
            <label class="check" style="margin-bottom:10px"><span class="switch"><input type="checkbox" name="smsUpdates" ${p.smsUpdates ? 'checked' : ''}><span></span></span> Text me booking confirmations &amp; new proposals</label>
            <div class="field"><label for="s-ph">Mobile for texts</label><input id="s-ph" name="phone" value="${esc(p.phone)}"></div>
            <button class="btn btn-primary btn-sm" type="submit">Save changes</button></form></div>
        <div><div class="card"><div class="card-h"><h3>Team</h3><span class="tag">${team.length}</span></div>
          ${team.map((u) => `<div class="list-row">${avatar(u)}<div class="grow"><b>${esc(u.name)}</b><small>${esc(u.title || 'Team member')} · ${esc(u.email)}</small></div>${u.pending ? '<span class="tag warn">Invited</span>' : ''}</div>`).join('')}
          <form id="invite" class="comment-form" style="margin-top:14px" novalidate><input name="email" type="email" required placeholder="colleague@${esc((p.website || 'brand.com').replace(/^https?:\/\//, ''))}" aria-label="Invite by email"><button class="btn btn-sm btn-soft" type="submit">Invite</button></form></div>
          <div class="card"><div class="card-h"><h3>Security</h3></div><div class="secure-note" style="border:0;padding:0">${icon('shield')}<span>Your workspace is private to ${esc(p.company)} and Kelsey &amp; Zach. Data is protected by row-level security; sign-in uses magic links or Google with optional 2FA at launch.</span></div></div></div></div>`;
    main.onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.id === 'profile') {
        if (!validate(f)) return;
        const d = formData(f);
        Object.assign(p, { company: d.company, website: d.website, category: d.category, audience: Number(d.audience) || 0, emailUpdates: d.emailUpdates, smsUpdates: d.smsUpdates, phone: d.phone });
        EA.store.save(); toast('Settings saved'); rerender();
      } else if (f.id === 'invite') {
        const email = f.email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { f.email.focus(); return; }
        S().users.push({ id: uid('u'), role: 'partner', partnerId: p.id, name: email.split('@')[0], email, password: uid('pw'), pending: true, color: '#85867c' });
        EA.store.save(); toast(`<b>Invite sent</b><small>${esc(email)} will get a magic sign-in link.</small>`, { icon: 'mail' }); settings(main);
      }
    };
    main.onclick = null;
  }

  const VIEWS = {
    overview: (m, x) => (hq() ? hOverview(m, x) : pOverview(m, x)),
    inquiries, projects, proposals, messages, bookings, lab, reviews, automations, settings,
  };

  EA.portal = { render, get prefill() { return P.prefill; }, set prefill(v) { P.prefill = v; } };
})(window.EA);

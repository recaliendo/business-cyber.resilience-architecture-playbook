/* Ellis Adventures prototype — public site: home, About Zach & Kelsey, Partner With Us, inquiry wizard. */
window.EA = window.EA || {};
(function (EA) {
  'use strict';
  const { esc, icon, fmt, avatar, uid, toast, modal, formData, validate, whoLabel } = EA.ui;
  const S = () => EA.store.state;
  let timers = [];
  let unsubs = [];

  function stop() {
    timers.forEach(clearInterval); timers = [];
    unsubs.forEach((u) => u()); unsubs = [];
  }

  const img = (key, alt, warm) => `<img src="${EA.media[key]}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="EA.ui.imgFallback(this${warm ? ',1' : ''})">`;

  /* ======================================================================
     Live counters
     ====================================================================== */
  const COUNTERS = [
    ['partnerships', 'Brand partnerships delivered'],
    ['adventures', 'Bucket-list adventures'],
    ['experiences', 'Once-in-a-lifetime experiences'],
    ['countries', 'Countries explored'],
  ];
  function animate(el, to) {
    const from = Number(el.dataset.val || 0);
    el.dataset.val = to;
    const t0 = performance.now();
    const dur = from === 0 ? 1600 : 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt.num(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function refreshCounters(root, bump) {
    const c = EA.store.counters();
    COUNTERS.forEach(([k]) => {
      const tile = root.querySelector(`[data-counter="${k}"]`);
      if (!tile) return;
      const num = tile.querySelector('.n');
      const prev = Number(num.dataset.val || 0);
      if (prev === c[k] && prev !== 0) return;
      animate(num, c[k]);
      if (bump && prev && c[k] > prev) {
        const b = tile.querySelector('.counter-bump');
        b.textContent = `+${c[k] - prev}`;
        b.classList.add('show'); tile.classList.add('flash');
        setTimeout(() => { b.classList.remove('show'); tile.classList.remove('flash'); }, 2400);
      }
    });
  }
  function tickerItem(x) {
    return `<span class="ticker-item">${icon(x.icon || 'sparkle')} ${esc(x.title)} <span class="muted">· ${esc(x.place)} · ${esc(fmt.ago(x.at))}</span></span>`;
  }
  /** Demo "live feed": every 18s a new experience is logged, like a Realtime insert would do. */
  function liveSimulate() {
    const st = S();
    const pool = EA.experiencePool;
    const x = pool[st.stats.liveIdx % pool.length];
    st.stats.liveIdx += 1;
    st.experiences.unshift({ id: uid('x'), title: x.title, place: x.place, icon: x.icon, at: new Date().toISOString() });
    if (x.trip) st.stats.tripsLogged += 1;
    st.experiences.length = Math.min(st.experiences.length, 400);
    EA.store.save();
    EA.store.emit('counters', { source: 'live' });
  }

  /* ======================================================================
     Instagram comment "screenshots"
     ====================================================================== */
  function maskHandle(h) {
    if (!S().settings.maskHandles) return h;
    if (h.length <= 6) return h[0] + '•••' + h.slice(-1);
    return h.slice(0, 3) + '•••' + h.slice(-3);
  }
  function shotCard(r) {
    const post = r.post || {};
    const thumb = post.img ? img(post.img, '', post.img === 'positano') : `<span>${post.emoji || '✈️'}</span>`;
    const handle = maskHandle(r.handle);
    return `<article class="shot" aria-label="Instagram comment from ${esc(handle)}">
      <div class="shot-bar"><span class="shot-thumb">${thumb}</span><span class="post-cap">Comment on <b>@thekelseyellis.adventure</b> · ${esc(post.cap || '')}</span></div>
      <div class="shot-body">
        <span class="shot-ava"><span style="background:${colorFor(r.handle)}">${esc(r.handle.slice(0, 1).toUpperCase())}</span></span>
        <div class="shot-text"><b>${esc(handle)}</b>${esc(r.text)}
          <div class="shot-meta"><span>${esc(fmt.dur((Date.now() - new Date(r.at)) / 1000))}</span><span>${fmt.num(r.likes)} likes</span><span>Reply</span></div></div>
        ${icon('heart', 'shot-heart')}
      </div>
      <div class="shot-foot"><span class="verified-src">${icon('instagram')} via Instagram</span><span class="hand">♥ ${Math.round(r.sentiment * 100)}% love</span></div>
    </article>`;
  }
  function colorFor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 45%)`; }
  function marqueeHtml() {
    const approved = S().reviews.filter((r) => r.status === 'approved');
    if (!approved.length) return '<p class="muted center">No approved comments yet — approve some in HQ → Audience Reviews.</p>';
    // Two rows scrolling in opposite directions; pad short rows so each loop is wider than the screen.
    const rows = [approved.filter((_, i) => i % 2 === 0), approved.filter((_, i) => i % 2 === 1)].filter((r) => r.length);
    rows.forEach((r) => { const base = r.slice(); while (r.length < 6) r.push(...base); });
    return rows.map((row, i) => {
      const cards = row.map(shotCard).join('');
      const dur = Math.max(40, row.length * 9);
      return `<div class="marquee"><div class="marquee-row ${i ? 'reverse' : ''}" style="--dur:${dur}s">${cards}<div style="display:contents" aria-hidden="true">${cards}</div></div></div>`;
    }).join('');
  }

  /* ======================================================================
     HOME
     ====================================================================== */
  function home(el) {
    const st = S();
    const topIdeas = st.ideas.slice().sort((a, b) => b.votes - a.votes).slice(0, 3);
    el.innerHTML = `
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Bucket-list travel creators · New York</p>
          <h1>Two passports.<br><em>One bucket list.</em></h1>
          <p class="lead">Hi 👋 we’re Kelsey &amp; Zach. We chase the most epic trips and once-in-a-lifetime adventures — and help you plan yours too. For brands, we turn those adventures into stories people save, share and book.</p>
          <div class="cta-row">
            <button class="btn btn-primary" data-action="inquire">${icon('sparkle')} Start a partnership</button>
            <a class="btn btn-ghost" href="#/about">Meet Kelsey &amp; Zach ${icon('arrow')}</a>
          </div>
          <p class="hero-note">Already a partner? <a href="#/portal">Sign in to the Partner Portal</a> to manage projects, proposals and calls.</p>
        </div>
        <div class="hero-art" aria-hidden="false">
          <figure class="arch arch-a">${img('positano', 'Kelsey and Zach in a red vintage Fiat 500 above Positano', true)}<figcaption class="hand">Positano, Italy</figcaption></figure>
          <figure class="arch arch-b">${img('moorea', 'Kelsey swimming beneath a blacktip reef shark in Moorea')}<figcaption class="hand">Moorea, French Polynesia</figcaption></figure>
          <div class="stamp">K&amp;Z<small>est. NY</small></div>
        </div>
      </div>
    </section>

    <section class="counters" aria-labelledby="counter-h">
      <div class="wrap">
        <div class="counter-top"><h2 id="counter-h">The adventure so far</h2><span class="live-pill"><span class="dot"></span>Live · updates as partnerships &amp; trips are logged</span></div>
        <div class="counter-grid">
          ${COUNTERS.map(([k, label]) => `<div class="counter" data-counter="${k}"><div class="counter-num"><span class="n" data-val="0">0</span><span class="plus">+</span></div><div class="counter-label">${label}</div><span class="counter-bump"></span></div>`).join('')}
        </div>
        <div class="ticker" aria-live="polite"><span class="ticker-label">Latest</span><div id="ticker">${st.experiences[0] ? tickerItem(st.experiences[0]) : ''}</div></div>
      </div>
    </section>

    <section id="adventures" class="section">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Adventures</p><h2>Once-in-a-lifetime, <em>on repeat</em></h2></div><p>From cliffside roads on the Amalfi Coast to lagoons in French Polynesia — every trip becomes a story our audience can actually plan from.</p></div>
        <div class="adv-grid">
          <a class="adv-card" href="#/about">${img('positano', 'Kelsey and Zach on a vintage Fiat 500 in Positano', true)}
            <div class="adv-body"><div class="place">${icon('pin')} Amalfi Coast, Italy</div><h3>Positano in a vintage Fiat 500</h3><p>Cliffside roads, a picnic basket and the most-saved photo on our feed.</p><div class="tags"><span class="tag">Road trip</span><span class="tag">La dolce vita</span><span class="tag">Couples travel</span></div></div></a>
          <div class="adv-stack">
            <a class="adv-card" href="${esc(EA.brand.mooreaGuide)}" target="_blank" rel="noopener">${img('moorea', 'Swimming with a blacktip reef shark in Moorea')}
              <div class="adv-body"><div class="place">${icon('pin')} Moorea, French Polynesia</div><h3>Swimming with blacktip sharks</h3><span class="adv-link">Get our Moorea travel guide ${icon('arrow')}</span></div></a>
            <div class="adv-card gear"><div class="adv-body" style="background:none;padding-top:26px"><div class="place">${icon('camera')} Every angle covered</div><h3 style="font-size:1.25rem">Drone · 360° · underwater</h3><p style="margin:0">Partners get aerials, immersive 360 and reef-level footage from one trip.</p></div></div>
          </div>
          <div class="adv-card yours"><div class="adv-body"><p class="eyebrow">Your destination here</p><h3>Could your place be our next adventure?</h3><p>Resorts, tourism boards and travel brands — let’s build a story worth the trip.</p><button class="btn btn-primary" data-action="inquire">Start a partnership</button></div></div>
        </div>
      </div>
    </section>

    <section class="section alt">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Why brands partner with us</p><h2>Stories people <em>plan</em> from</h2></div><p>We don’t make filler content. We make the posts people screenshot, save to a trip folder and come back to when they book.</p></div>
        <div class="value-grid">
          <div class="value"><span class="ico-wrap">${icon('users')}</span><h3>Two creators, one story</h3><p>Two perspectives and multiple channels — @thekelseyellis.adventure, @zellis88 and TikTok @ellis.adventures.</p></div>
          <div class="value"><span class="ico-wrap">${icon('compass')}</span><h3>Bucket-list, not filler</h3><p>Once-in-a-lifetime destinations our audience is actively saving up for and planning.</p></div>
          <div class="value"><span class="ico-wrap">${icon('drone')}</span><h3>Every angle covered</h3><p>Drone aerials, 360° capture and underwater footage — licensed assets you can reuse.</p></div>
          <div class="value"><span class="ico-wrap">${icon('bag')}</span><h3>Plan-ready = action</h3><p>Travel guides, LTK shop links and discount codes give our audience a next step.</p></div>
        </div>
      </div>
    </section>

    <section class="brands" aria-label="Brands and gear we use">
      <div class="wrap brands-inner"><span class="brands-label">In our bag &amp; on our feed</span>${EA.brandWords.map(([w, c]) => `<span class="brand-word ${c}">${esc(w)}</span>`).join('')}</div>
    </section>

    <section id="love" class="section love">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Audience love</p><h2>See what our audience <em>is saying</em></h2></div>
          <div class="love-meta"><span class="tag lagoon">${icon('instagram')} Pulled from Instagram comments</span><span class="tag gold">${icon('shield')} Sentiment-filtered &amp; approved by us</span><span class="sample-badge">Sample comments in this prototype</span></div></div>
      </div>
      <div id="marquee">${marqueeHtml()}</div>
    </section>

    <section id="lab" class="section sand">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Innovation Center</p><h2>Help shape <em>our next adventure</em></h2></div><p>Partners pitch and vote on campaign themes. The ideas with the strongest mutual audience fit become real trips — co-created with the brands who backed them.</p></div>
        <div class="lab-grid">
          <div>
            ${topIdeas.map((i) => `<div class="idea-mini"><a class="vote-pill" href="#/portal/lab" aria-label="${i.votes} votes — sign in to vote">${icon('up')}${i.votes}</a><div><h4>${esc(i.title)}</h4><p>${esc(i.pitch)}</p><div class="chips">${statusTag(i.status)}${i.niches.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div></div></div>`).join('')}
            <div style="margin-top:20px"><a class="btn btn-primary" href="#/portal/lab">${icon('bulb')} Enter the Innovation Center</a></div>
          </div>
          <div class="window-card"><p class="eyebrow" style="color:var(--gold)">Open collaboration windows</p><h3>Trips with partner slots</h3>
            ${st.windows.map((w) => `<div class="window"><div><b>${esc(w.title)}</b><small>${esc(fmt.month(w.start))} · ${esc(w.length)}</small></div><div class="slots" aria-label="${w.slots - w.taken} of ${w.slots} slots open">${Array.from({ length: w.slots }, (_, i) => `<i class="${i < w.taken ? 'taken' : ''}"></i>`).join('')}</div></div>`).join('')}
            <p style="margin:14px 0 0;font-size:.85rem;color:#bdb6a7">Sample itinerary windows · partners request slots from the portal.</p>
          </div>
        </div>
      </div>
    </section>

    ${ctaBand()}`;

    // counters: animate when visible, then keep live
    const counterSec = el.querySelector('.counters');
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { refreshCounters(counterSec, false); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(counterSec);
    unsubs.push(() => io.disconnect());
    const onCounters = () => {
      refreshCounters(counterSec, true);
      const x = S().experiences[0];
      const tk = el.querySelector('#ticker');
      if (x && tk) tk.innerHTML = tickerItem(x);
    };
    unsubs.push(EA.store.on('counters', onCounters), EA.store.on('sync', onCounters));
    timers.push(setInterval(liveSimulate, 18000));
    el.onclick = null;
  }

  function statusTag(s) {
    const map = { open: ['', 'Open for votes'], shortlisted: ['gold', 'Shortlisted'], 'in-planning': ['lagoon', 'In planning'], greenlit: ['ok', 'Greenlit'] };
    const [c, l] = map[s] || ['', s];
    return `<span class="tag ${c}">${l}</span>`;
  }

  function ctaBand() {
    return `<section class="cta-band"><div class="wrap cta-split">
      <div class="cta-card dark"><p class="eyebrow" style="color:var(--gold)">New partners</p><h3>Let’s plan something epic</h3>
        <ul><li>Tell us about your brand in 2 minutes</li><li>Book a discovery call with Kelsey, Zach or both</li><li>We get a text the moment you hit send</li></ul>
        <button class="btn btn-gold" data-action="inquire">${icon('sparkle')} Start a partnership</button></div>
      <div class="cta-card"><p class="eyebrow">Existing partners</p><h3>Your projects, one place</h3>
        <ul><li>Collaborations, deliverables &amp; approvals</li><li>Proposals with version history</li><li>Secure messages &amp; booking with K&amp;Z</li></ul>
        <a class="btn btn-primary" href="#/portal/bookings">${icon('calendar')} Book a check-in</a></div>
    </div></section>`;
  }

  /* ======================================================================
     ABOUT ZACH & KELSEY
     ====================================================================== */
  function about(el) {
    const bag = EA.gear;
    el.innerHTML = `
    <section class="about-hero"><div class="wrap about-hero-grid">
      <div>
        <span class="hi">Hi, we’re Kelsey &amp; Zach 👋</span>
        <h1>The two of us behind <em>Ellis Adventures</em></h1>
        <p class="lead">Two New Yorkers with one ever-growing bucket list. We share the most epic trips and once-in-a-lifetime adventures we can find — the real costs, the logistics, the gear — so you can plan yours too.</p>
        <div class="cta-row"><a class="btn btn-ghost" href="${esc(EA.brand.igKelsey)}" target="_blank" rel="noopener">${icon('instagram')} @thekelseyellis.adventure</a><a class="btn btn-ghost" href="${esc(EA.brand.igZach)}" target="_blank" rel="noopener">${icon('instagram')} @zellis88</a></div>
      </div>
      <figure class="polaroid"><span class="tape"></span>${img('positano', 'Kelsey and Zach sharing a moment in a red vintage Fiat 500 above Positano', true)}<figcaption>Positano, our favorite kind of chaos</figcaption></figure>
    </div></section>

    <section class="section alt"><div class="wrap"><div class="story">
      <p class="eyebrow center">Our story</p>
      <div class="chapter"><div class="chapter-num"><b>01</b>It started with a list</div><div><p>Every couple has a someday list. Ours just got a little out of hand. Swim with sharks. Drive the Amalfi Coast in a tiny vintage car. Wake up over a lagoon so blue it doesn’t look real.</p><p>One by one, we stopped saying <em>someday</em> — and started booking.</p></div></div>
      <div class="chapter"><div class="chapter-num"><b>02</b>Then you started asking</div><div><p>Where did you stay? How did you book that? Which camera is that? Every comment became a reason to share more: the itineraries, the costs, the gear and the little tips that make a big trip feel doable.</p><p>That’s why we make plan-ready travel guides — like our <a href="${esc(EA.brand.mooreaGuide)}" target="_blank" rel="noopener">Moorea guide</a> — and keep our favorite gear and codes in one place.</p></div></div>
      <div class="chapter"><div class="chapter-num"><b>03</b>Now we build it with partners</div><div><p>The brands we work with aren’t a line on a shot list — they’re part of the story. A resort becomes the place we finally slowed down. A camera becomes how you saw the reef through our eyes.</p><p>This site — and the partner portal behind it — exists so those collaborations feel as easy as the trips look.</p></div></div>
    </div></div></section>

    <section class="section"><div class="wrap">
      <p class="pull">“If it’s not once-in-a-lifetime, we’re not packing for it.”<span class="hand">— our only travel rule</span></p>
    </div></section>

    <section class="section sand"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Meet the team (of two)</p><h2>Who does <em>what</em></h2></div><p>Message either of us directly from the partner portal — or both at once.</p></div>
      <div class="duo">
        <div class="person" data-initial="K"><span class="role">The dreamer &amp; the planner</span><h3>Kelsey</h3><a class="handle" href="${esc(EA.brand.igKelsey)}" target="_blank" rel="noopener">${icon('instagram')} @thekelseyellis.adventure</a>
          <p>Kelsey is the reason the itinerary exists — and the reason it has a sunrise swim on day one. Find her underwater, mid-lagoon, or three tabs deep into the perfect boutique stay.</p>
          <ul><li>${icon('check')}Ask her about: itineraries, stays, travel guides</li><li>${icon('check')}Best for: creative direction &amp; storytelling</li><li>${icon('check')}Signature shot: the underwater moment</li></ul></div>
        <div class="person" data-initial="Z"><span class="role">The co-pilot &amp; the camera</span><h3>Zach</h3><a class="handle" href="${esc(EA.brand.igZach)}" target="_blank" rel="noopener">${icon('instagram')} @zellis88</a>
          <p>Zach keeps the adventure moving — and usually has the drone in the air before the boat docks. If there’s a cliffside road, a vintage car or a better angle, he’s already found it.</p>
          <ul><li>${icon('check')}Ask him about: drone, 360 &amp; gear</li><li>${icon('check')}Best for: logistics, production &amp; deliverables</li><li>${icon('check')}Signature shot: the aerial reveal</li></ul></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">What we believe</p><h2>How we <em>travel</em></h2></div></div>
      <div class="beliefs">
        <div class="belief"><span class="n">one</span><h3>Say yes to the once-in-a-lifetime</h3><p>The shark swim. The 5am boat. The tiny car on the big cliff. The stories worth telling are on the other side of “yes”.</p></div>
        <div class="belief"><span class="n">two</span><h3>Plan like pros, travel like kids</h3><p>We sweat the details so the trip feels effortless — and then we let ourselves be completely amazed.</p></div>
        <div class="belief"><span class="n">three</span><h3>Only share what we’d pack</h3><p>Every brand on our feed is something we actually use. That’s the deal with our audience, and with our partners.</p></div>
      </div>
    </div></section>

    <section class="section alt"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Always in our bag</p><h2>The gear behind <em>the shots</em></h2></div><p>The same favorites that live on our Linktree and LTK shop.</p></div>
      <div class="bag">${bag.map((g) => `<div class="bag-item">${icon(g.icon)}<b>${esc(g.name)}</b><small>${esc(g.note)}</small>${g.code ? `<span class="code">code ${esc(g.code)}</span>` : ''}</div>`).join('')}</div>
      <p style="margin-top:20px"><a class="btn btn-soft btn-sm" href="${esc(EA.brand.ltk)}" target="_blank" rel="noopener">${icon('bag')} Shop our favorites on LTK</a></p>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Places that changed us</p><h2>Pins on <em>our map</em></h2></div></div>
      <div class="places">
        <div class="place-card">${img('positano', 'Positano from the coastal road', true)}<div class="pc-body"><span class="hand">Positano, Italy</span><h3>The Fiat that stole the show</h3><p class="muted">Proof that the best travel photos are the ones where you can’t stop laughing.</p></div></div>
        <div class="place-card">${img('moorea', 'Blacktip reef shark in Moorea’s lagoon')}<div class="pc-body"><span class="hand">Moorea, French Polynesia</span><h3>Face to face with a blacktip</h3><p class="muted">The most peaceful “scary” thing we’ve ever done. <a href="${esc(EA.brand.mooreaGuide)}" target="_blank" rel="noopener">Read the guide →</a></p></div></div>
        <div class="place-card next"><p class="eyebrow">Next pin</p><h3>You help decide</h3><p class="muted">Partners vote on upcoming trips and campaign themes in our Innovation Center.</p><a class="btn btn-primary btn-sm" href="#/portal/lab">${icon('bulb')} See what’s trending</a></div>
      </div>
    </div></section>

    <section class="section sand"><div class="wrap"><div class="letter">
      <p class="eyebrow">A note from us</p>
      <p>Thank you for being here — whether you found us through a reel, a travel guide or a friend who sent you the shark video at 2am.</p>
      <p>If you’re a brand, we’d love to hear what you’re dreaming up. If you’re a fellow traveler, we hope we help you cross something off <em>your</em> list soon.</p>
      <div class="signature">Kelsey &amp; Zach</div>
      <div class="cta-row" style="margin:0"><button class="btn btn-primary" data-action="inquire">${icon('sparkle')} Start a partnership</button><a class="btn btn-ghost" href="mailto:${esc(EA.brand.email)}">${icon('mail')} ${esc(EA.brand.email)}</a></div>
    </div></div></section>`;
    el.onclick = null;
  }

  /* ======================================================================
     PARTNER WITH US
     ====================================================================== */
  function partner(el) {
    el.innerHTML = `
    <section class="hero" style="padding-bottom:40px"><div class="wrap">
      <p class="eyebrow">Partner with Kelsey &amp; Zach</p>
      <h1 style="max-width:16ch">Let’s create something <em>worth the trip.</em></h1>
      <p class="lead">Resorts, tourism boards and travel brands work with us to reach travelers who are actively planning. Start a new partnership in two minutes — or jump into the portal if we’re already working together.</p>
      <div class="cta-row"><button class="btn btn-primary" data-action="inquire">${icon('sparkle')} New partner? Start an inquiry</button><a class="btn btn-ghost" href="#/portal/bookings">${icon('calendar')} Existing partner? Book a call</a></div>
    </div></section>

    <section class="section alt" style="padding-top:60px"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">How it works</p><h2>From hello to <em>live</em></h2></div></div>
      <div class="steps">
        <div class="step"><h4>Inquire &amp; book</h4><p>Share your goals and grab a discovery call on our live calendar. We get a text instantly.</p></div>
        <div class="step"><h4>Proposal</h4><p>We send a tailored proposal in your portal — comment, request changes or accept in one click.</p></div>
        <div class="step"><h4>Create together</h4><p>Track deliverables, approve content and message us directly while we’re on location.</p></div>
        <div class="step"><h4>Report &amp; grow</h4><p>Performance reporting, then co-create the next campaign in the Innovation Center.</p></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Collaboration formats</p><h2>Ways we <em>work together</em></h2></div><p>Every partnership is custom — these are the starting points brands pick most.</p></div>
      <div class="formats">${EA.FORMATS.map((f) => `<div class="format"><h3>${esc(f.key)}</h3><p>${esc(f.blurb)}</p><ul>${f.deliverables.map((d) => `<li>${icon('check')}${esc(d)}</li>`).join('')}</ul><div class="ideal">Ideal for: ${esc(f.ideal)}</div></div>`).join('')}</div>
    </div></section>

    <section class="section dark-sec"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow" style="color:var(--gold)">The partner portal</p><h2>Everything in <em>one place</em></h2></div><p>No more lost email threads. Every partner gets a private, secure workspace with Kelsey &amp; Zach.</p></div>
      <div class="portal-feats">
        <div class="feat">${icon('briefcase')}<div><b>Collaborations</b><p>Stages, deliverables, due dates and one-click content approval.</p></div></div>
        <div class="feat">${icon('file')}<div><b>Proposals</b><p>Submit, revise and accept with full version history.</p></div></div>
        <div class="feat">${icon('lock')}<div><b>Secure messages</b><p>Message Kelsey, Zach or both — they get a text when you do.</p></div></div>
        <div class="feat">${icon('calendar')}<div><b>Booking</b><p>Live availability for check-ins, reviews and strategy sessions.</p></div></div>
        <div class="feat">${icon('bulb')}<div><b>Innovation Center</b><p>Pitch and vote on themes; request slots on upcoming trips.</p></div></div>
        <div class="feat">${icon('chart')}<div><b>Reporting</b><p>Results and next-step recommendations after every campaign.</p></div></div>
      </div>
      <div class="cta-row" style="margin-bottom:0"><a class="btn btn-gold" href="#/portal">${icon('lock')} Sign in or register</a></div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Audience snapshot</p><h2>Who you’ll <em>reach</em></h2></div><span class="sample-badge">Sample data — syncs from Instagram Insights at launch</span></div>
      <div class="snapshot">
        <div class="snap"><h4>Age</h4>${bars([['18–24', 14], ['25–34', 46], ['35–44', 27], ['45+', 13]])}</div>
        <div class="snap"><h4>Top markets</h4>${bars([['US', 71], ['Canada', 8], ['UK', 6], ['Australia', 4]])}</div>
        <div class="snap"><h4>They follow us for</h4>${bars([['Destinations', 82], ['Stays', 64], ['Gear', 41], ['Budget tips', 37]])}</div>
      </div>
    </div></section>

    <section class="section alt"><div class="wrap" style="max-width:820px">
      <p class="eyebrow">Questions</p><h2>Good to <em>know</em></h2>
      <div class="faq">
        <details open><summary>How fast will we hear back?</summary><p>The moment you submit, Kelsey &amp; Zach both get a text and an email, and you get a confirmation. Expect a personal reply within 48 hours — even when we’re on location.</p></details>
        <details><summary>Can we meet just Kelsey or just Zach?</summary><p>Yes. The booking calendar lets you pick Kelsey, Zach or both — when you choose both, you only see times when we’re both free.</p></details>
        <details><summary>What happens after the discovery call?</summary><p>We send a tailored proposal to your partner portal. You can comment, request changes or accept — accepted proposals become a collaboration with deliverables and dates.</p></details>
        <details><summary>We already work with you — where do we go?</summary><p>Sign in to the partner portal for projects, proposals, secure messages, bookings and the Innovation Center.</p></details>
      </div>
    </div></section>
    ${ctaBand()}`;
    el.onclick = null;
  }
  const bars = (rows) => rows.map(([l, v]) => `<div class="bar-row"><span>${esc(l)}</span><span class="bar"><i style="width:${v}%"></i></span><span>${v}%</span></div>`).join('');

  /* ======================================================================
     NEW PARTNERSHIP INQUIRY WIZARD (with discovery-call booking)
     ====================================================================== */
  function openInquiry(prefill = {}) {
    const data = { company: '', name: '', email: '', phone: '', website: '', category: '', smsOk: true, formats: [], budget: '', timeline: '', goals: '', ...prefill };
    let step = 1;
    let slot = null;
    const titles = { 1: 'Tell us about your brand', 2: 'What are you dreaming up?', 3: 'Book a discovery call', 4: 'Review & send' };
    const body = modal.open('', { size: 'wide', label: 'Start a partnership' });

    function stepHtml() {
      if (step === 1) return `
        <div class="grid-2">
          <div class="field"><label for="f-company">Company / brand *</label><input id="f-company" name="company" required value="${esc(data.company)}" autocomplete="organization"><span class="err">Required</span></div>
          <div class="field"><label for="f-cat">Category *</label><select id="f-cat" name="category" required><option value="">Choose one</option>${EA.CATEGORIES.map((c) => `<option ${c === data.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><span class="err">Pick a category</span></div>
          <div class="field"><label for="f-name">Your name *</label><input id="f-name" name="name" required value="${esc(data.name)}" autocomplete="name"><span class="err">Required</span></div>
          <div class="field"><label for="f-email">Work email *</label><input id="f-email" name="email" type="email" required value="${esc(data.email)}" autocomplete="email"><span class="err">Enter a valid email</span></div>
          <div class="field"><label for="f-phone">Mobile <span class="hint">(optional — for text updates)</span></label><input id="f-phone" name="phone" type="tel" value="${esc(data.phone)}" autocomplete="tel"></div>
          <div class="field"><label for="f-web">Website or Instagram</label><input id="f-web" name="website" value="${esc(data.website)}" placeholder="yourbrand.com"></div>
        </div>
        <label class="check"><input type="checkbox" name="smsOk" ${data.smsOk ? 'checked' : ''}> Text me booking confirmations and replies (msg &amp; data rates may apply; reply STOP to opt out).</label>`;
      if (step === 2) return `
        <div class="field"><span class="label">Which formats interest you?</span><div class="chips">${EA.FORMATS.map((f) => `<label class="chip"><input type="checkbox" data-multi name="formats" value="${esc(f.key)}" ${data.formats.includes(f.key) ? 'checked' : ''}><span>${esc(f.key)}</span></label>`).join('')}<label class="chip"><input type="checkbox" data-multi name="formats" value="Something new" ${data.formats.includes('Something new') ? 'checked' : ''}><span>Something new ✨</span></label></div></div>
        <div class="grid-2">
          <div class="field"><label for="f-budget">Estimated budget *</label><select id="f-budget" name="budget" required><option value="">Choose a range</option>${EA.BUDGETS.map((b) => `<option ${b === data.budget ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select><span class="err">Pick a range</span></div>
          <div class="field"><label for="f-time">Timeline *</label><select id="f-time" name="timeline" required><option value="">When?</option>${['ASAP', '1–3 months', '3–6 months', '6+ months', 'Flexible'].map((t) => `<option ${t === data.timeline ? 'selected' : ''}>${t}</option>`).join('')}</select><span class="err">Pick a timeline</span></div>
        </div>
        <div class="field"><label for="f-goals">Goals &amp; ideas *</label><textarea id="f-goals" name="goals" required data-minlen="10" placeholder="Who do you want to reach? What would success look like?">${esc(data.goals)}</textarea><span class="err">Tell us a little more (10+ characters)</span></div>`;
      if (step === 3) return `<div id="wiz-booking"></div><p class="muted" style="margin:14px 0 0;font-size:.88rem">Prefer email first? <button type="button" class="link-btn" data-skip>Skip the call for now</button></p>`;
      return `
        <dl class="review-list">
          <dt>Brand</dt><dd>${esc(data.company)} · ${esc(data.category)}</dd>
          <dt>Contact</dt><dd>${esc(data.name)} · ${esc(data.email)}${data.phone ? ' · ' + esc(data.phone) : ''}</dd>
          <dt>Formats</dt><dd>${esc(data.formats.join(', ') || 'Open to ideas')}</dd>
          <dt>Budget · timeline</dt><dd>${esc(data.budget)} · ${esc(data.timeline)}</dd>
          <dt>Goals</dt><dd>${esc(data.goals)}</dd>
          <dt>Discovery call</dt><dd>${slot ? `${esc(fmt.when(slot.start))} with ${esc(whoLabel(slot.who))}` : '<span class="muted">Not booked — we’ll email you times</span>'}</dd>
        </dl>
        <div class="next-steps">
          <div>${icon('phone')}<span><b>Kelsey &amp; Zach get a text the second you hit send</b> — plus an email to ${esc(EA.brand.email)}.</span></div>
          <div>${icon('mail')}<span>You get an instant confirmation${slot ? ' with a calendar invite' : ''}.</span></div>
          <div>${icon('lock')}<span>Create a partner portal account to track your proposal and message us securely.</span></div>
        </div>`;
    }

    function render() {
      body.innerHTML = `<div class="wiz">
        <p class="eyebrow">New partnership · step ${step} of 4</p><h2>${titles[step]}</h2>
        <ol class="wiz-steps" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}"></li>`).join('')}</ol>
        <form class="wiz-form" novalidate>${stepHtml()}
          <div class="wiz-foot">${step > 1 ? `<button type="button" class="btn btn-soft" data-back>${icon('chevL')} Back</button>` : '<span></span>'}
            ${step < 4 ? `<button type="submit" class="btn btn-primary">${step === 3 && !slot ? 'Continue without a call' : 'Continue'} ${icon('arrow')}</button>` : `<button type="submit" class="btn btn-gold">${icon('send')} Send inquiry</button>`}</div>
        </form></div>`;
      const form = body.querySelector('form');
      form.onsubmit = (e) => {
        e.preventDefault();
        if (step < 3 && !validate(form)) return;
        Object.assign(data, formData(form));
        if (step < 4) { step += 1; render(); body.scrollTop = 0; body.closest('.modal').scrollTop = 0; } else submit();
      };
      const back = body.querySelector('[data-back]');
      if (back) back.onclick = () => { if (step < 3) Object.assign(data, formData(form)); step -= 1; render(); };
      if (step === 3) {
        EA.booking.mount(body.querySelector('#wiz-booking'), {
          mode: 'new', initial: slot,
          onSelect: (sel) => { slot = sel; const btn = form.querySelector('button[type=submit]'); btn.innerHTML = `${slot ? 'Continue' : 'Continue without a call'} ${icon('arrow')}`; },
        });
        body.querySelector('[data-skip]').onclick = () => { slot = null; step = 4; render(); };
      }
    }

    function submit() {
      const st = S();
      const inq = { id: uid('inq'), company: data.company, name: data.name, email: data.email, phone: data.phone, website: data.website, category: data.category, formats: data.formats, budget: data.budget, timeline: data.timeline, goals: data.goals, status: 'new', createdAt: new Date().toISOString() };
      st.inquiries.unshift(inq);
      let sent = [];
      let booking = null;
      if (slot) {
        const res = EA.booking.create({ type: 'discovery', who: slot.who, start: slot.start, inquiryId: inq.id, company: data.company, partnerEmail: data.email, partnerPhone: data.phone, partnerSms: false, silent: true });
        booking = res.booking; inq.bookingId = booking.id; sent = sent.concat(res.sent);
      }
      EA.store.save();
      sent = EA.notify.dispatch('inquiry.created', { ...inq, when: booking ? fmt.when(booking.start) : '', partnerEmail: data.email, partnerPhone: null, partnerSms: false /* unverified number: email only, see notify.ts */, silent: true }).concat(sent);
      EA.store.emit('inquiry', inq);
      body.innerHTML = `<div class="wiz">
        <div class="success-mark">${icon('check')}</div>
        <p class="eyebrow">Inquiry sent</p><h2>Thank you, ${esc(data.name.split(' ')[0])}! 🌴</h2>
        <p class="lead" style="font-size:1.02rem">Kelsey &amp; Zach were just notified. Expect a personal reply within 48 hours.</p>
        ${booking ? `<div class="call-card"><span class="avatar-stack">${booking.with === 'both' ? avatar('kelsey') + avatar('zach') : avatar(booking.with)}</span><div class="when"><b>${esc(fmt.when(booking.start))}</b><small>Discovery call · 30 min with ${esc(whoLabel(booking.with))}</small></div><button class="btn btn-gold btn-sm" data-ics>${icon('download')} Add to calendar</button><a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="${esc(EA.booking.calendarLinks(booking, data.company).gcal)}">Google Calendar</a></div>` : ''}
        <div class="receipts"><h4>${icon('zap')} Automations that just fired</h4>${EA.notify.receiptsHtml(sent, { partnerLabel: 'You' })}</div>
        <div class="wiz-foot"><button class="btn btn-soft" data-close>Done</button><button class="btn btn-primary" data-register>${icon('lock')} Create your partner portal account ${icon('arrow')}</button></div>
      </div>`;
      const ics = body.querySelector('[data-ics]');
      if (ics) ics.onclick = () => EA.booking.calendarLinks(booking, data.company).ics();
      body.querySelector('[data-register]').onclick = () => {
        EA.portal.prefill = { company: data.company, name: data.name, email: data.email, phone: data.phone, website: data.website, category: data.category };
        modal.close();
        if (EA.store.user()) EA.store.logout();
        location.hash = '#/portal/register';
      };
    }
    render();
  }

  EA.site = { home, about, partner, openInquiry, stop, statusTag, marqueeHtml };
})(window.EA);

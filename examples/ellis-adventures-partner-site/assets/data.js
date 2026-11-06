/* Ellis Adventures prototype — brand facts + seed data.
 *
 * REAL (from Kelsey & Zach's public Linktree, linktr.ee/kelsey_ellis):
 *   bio, handles, contact email, palette/fonts, photos, gear & affiliate brands, Moorea guide link.
 * SAMPLE (illustrative, for the demo only):
 *   partner companies, projects, proposals, messages, counts, audience numbers and every
 *   Instagram comment in the "audience love" wall. Swap these for live data before launch.
 */
window.EA = window.EA || {};
(function (EA) {
  'use strict';

  EA.SEED_VERSION = 3;

  EA.brand = {
    name: 'Ellis Adventures',
    bio: 'Hi 👋 we’re Kelsey & Zach from 📍NY, bucket-list travel creators. We share the most epic trips and once in a lifetime adventures, helping you plan yours too!',
    email: 'Hello@thekelseyellisadventure.com',
    igKelsey: 'https://instagram.com/thekelseyellis.adventure',
    igZach: 'https://www.instagram.com/zellis88',
    tiktok: 'https://tiktok.com/@ellis.adventures',
    ltk: 'https://www.shopltk.com/explore/TheKelseyEllis.Adventure',
    linktree: 'https://linktr.ee/kelsey_ellis',
    site: 'https://www.ellisadventures.net',
    mooreaGuide: 'https://canva.link/x1zzcuzfnzmxz7j',
  };

  // Hot-linked from their public Linktree CDN for the prototype. Replace with licensed originals.
  EA.media = {
    positano: 'https://ugc.production.linktr.ee/cc8cb7ce-b893-45cc-9d53-e012f2cb052d_IMG-6419.jpeg',
    moorea: 'https://ugc.production.linktr.ee/b1b2c186-67eb-4778-bc01-a2540bbb7c0e_Moana-29-8-24.jpeg',
  };

  // Gear + brands that appear on their Linktree today.
  EA.gear = [
    { name: 'Insta360 X5', note: '360° capture — every angle of the adventure', code: 'INRSGTX73P1', icon: 'camera' },
    { name: 'DJI Mini Pro', note: 'The drone behind the aerials', icon: 'drone' },
    { name: 'DIVEVOLK SeaTouch', note: 'Underwater phone housing for the reef shots', icon: 'wave' },
    { name: 'Bluehorn tripod', note: 'Wireless shutter selfie tripod for two-shots', icon: 'camera' },
    { name: 'Hat Harness', note: 'Keeps the sun hat on the boat', code: 'KELSEY20', icon: 'compass' },
    { name: 'MAKE Wellness', note: 'Travel-day hydration & wellness', code: 'give10', icon: 'heart' },
    { name: 'Factor', note: 'Easy meals between trips', icon: 'home' },
    { name: 'LTK shop', note: 'Our favorites, all in one place', icon: 'bag' },
  ];
  EA.brandWords = [
    ['Insta360', ''], ['DJI', 'caps'], ['DIVEVOLK', 'caps'], ['Hat Harness', 'serif'], ['MAKE Wellness', ''], ['Factor', 'serif'], ['Modere', 'caps'], ['LTK', 'caps'],
  ];

  EA.STAGES = [
    { key: 'brief', label: 'Brief' },
    { key: 'contracted', label: 'Contracted' },
    { key: 'production', label: 'In production' },
    { key: 'review', label: 'Content review' },
    { key: 'live', label: 'Live' },
    { key: 'complete', label: 'Complete' },
  ];
  EA.NICHES = ['Luxury stays', 'Adventure gear', 'Wellness', 'Food & culture', 'Sustainable travel', 'Tech & creator tools', 'Experiences'];
  EA.CORE_NICHES = ['Luxury stays', 'Adventure gear', 'Experiences', 'Tech & creator tools', 'Sustainable travel']; // where K&Z content over-indexes (sample weighting)
  EA.FORMATS = [
    { key: 'Destination Story', blurb: 'A cinematic, plan-ready story about a place.', deliverables: ['1 hero Reel (45–90s)', '1 carousel guide', '5–8 Stories with link', 'Drone + 360 B-roll'], ideal: 'Tourism boards, islands, cities' },
    { key: 'Stay & Feature', blurb: 'We live the stay so your guests can picture theirs.', deliverables: ['Room / villa tour Reel', 'Experience carousel', 'Stories with booking link', 'Licensed photo set'], ideal: 'Hotels, resorts, villas, cruises' },
    { key: 'Gear in the Wild', blurb: 'Real gear, real conditions, real results.', deliverables: ['Field-test Reel', 'Before/after footage', 'LTK + code placement', 'Honest review carousel'], ideal: 'Cameras, drones, luggage, apparel' },
    { key: 'Ambassador', blurb: 'A season-long partnership that compounds.', deliverables: ['Quarterly hero content', 'Always-on Stories', 'Co-created campaign', 'Shared reporting'], ideal: 'Brands planning 6–12 months ahead' },
  ];
  EA.CATEGORIES = ['Hotel / resort', 'Tourism board', 'Travel gear', 'Wellness', 'Tech / creator tools', 'Food & beverage', 'Experiences & tours', 'Other'];
  EA.BUDGETS = ['Under $2,500', '$2,500–5,000', '$5,000–10,000', '$10,000–25,000', '$25,000+', 'Not sure yet'];
  EA.SAMPLE_AUDIENCE = 85000; // illustrative combined audience used by the growth estimator

  EA.experiencePool = [
    { title: 'Sunrise drone flight over the lagoon', place: 'French Polynesia', icon: 'drone' },
    { title: 'Snorkeled with stingrays at the sandbar', place: 'Moorea', icon: 'wave' },
    { title: 'Coastal drive in a vintage Fiat 500', place: 'Amalfi Coast', icon: 'compass' },
    { title: 'Floating breakfast at an overwater villa', place: 'Bora Bora', icon: 'sparkle', trip: true },
    { title: '360° walk-through of a cliffside hotel', place: 'Positano', icon: 'camera' },
    { title: 'Boat day to a hidden grotto', place: 'Capri', icon: 'wave', trip: true },
    { title: 'Golden-hour shoot at the marina', place: 'Sorrento', icon: 'camera' },
    { title: 'Reef-safe snorkel clean-up', place: 'Moorea', icon: 'heart' },
  ];

  EA.seed = function seed() {
    const { etDate, tzParts, dayKey } = EA.ui;
    const now = Date.now();
    const DAY = 864e5;
    const ago = (days, hours = 0) => new Date(now - days * DAY - hours * 36e5).toISOString();
    const ahead = (days) => new Date(now + days * DAY).toISOString();
    const t = tzParts(new Date());
    const weekday = (off) => { let o = off; for (;;) { const wd = new Date(Date.UTC(t.y, t.m, t.d + o)).getUTCDay(); if (wd !== 0 && wd !== 6) return o; o += 1; } };
    const at = (off, h, mi = 0) => etDate(t.y, t.m, t.d + weekday(off), h, mi).toISOString();
    const key = (off) => dayKey(t.y, t.m, t.d + off);

    const partners = [
      { id: 'p_sunline', company: 'Sunline Resorts', category: 'Hotel / resort', website: 'sunlineresorts.example', contact: 'Maya Torres', email: 'maya@sunlineresorts.example', phone: '+1 (555) 014-2201', status: 'active', since: ago(410), audience: 180000, color: '#1f7a80', smsUpdates: true, emailUpdates: true },
      { id: 'p_driftwood', company: 'Driftwood Outfitters', category: 'Travel gear', website: 'driftwood.example', contact: 'Owen Park', email: 'owen@driftwood.example', phone: '+1 (555) 014-3302', status: 'active', since: ago(260), audience: 95000, color: '#8a7247', smsUpdates: false, emailUpdates: true },
      { id: 'p_tidepool', company: 'Tidepool Skincare', category: 'Wellness', website: 'tidepool.example', contact: 'Priya Nair', email: 'priya@tidepool.example', phone: '', status: 'active', since: ago(150), audience: 60000, color: '#c2362d', smsUpdates: false, emailUpdates: true },
      { id: 'p_aurora', company: 'Aurora Air Tours', category: 'Experiences & tours', website: 'auroraair.example', contact: 'Lars Eriksen', email: 'lars@auroraair.example', phone: '', status: 'active', since: ago(21), audience: 40000, color: '#4b5a3c', smsUpdates: false, emailUpdates: true },
    ];

    const users = [
      { id: 'u_hq', role: 'creator', name: 'Kelsey & Zach', email: 'hq@ellisadventures.example', password: 'demo' },
      { id: 'u_maya', role: 'partner', partnerId: 'p_sunline', name: 'Maya Torres', title: 'Brand Partnerships Lead', email: 'maya@sunlineresorts.example', password: 'demo', color: '#1f7a80' },
      { id: 'u_jules', role: 'partner', partnerId: 'p_sunline', name: 'Jules Laurent', title: 'Marketing Director', email: 'jules@sunlineresorts.example', password: 'demo', color: '#5a6b8c' },
      { id: 'u_owen', role: 'partner', partnerId: 'p_driftwood', name: 'Owen Park', title: 'Head of Brand', email: 'owen@driftwood.example', password: 'demo', color: '#8a7247' },
      { id: 'u_priya', role: 'partner', partnerId: 'p_tidepool', name: 'Priya Nair', title: 'Founder', email: 'priya@tidepool.example', password: 'demo', color: '#c2362d' },
      { id: 'u_lars', role: 'partner', partnerId: 'p_aurora', name: 'Lars Eriksen', title: 'Marketing Manager', email: 'lars@auroraair.example', password: 'demo', color: '#4b5a3c' },
    ];

    const dl = (title, dueOff, done) => ({ id: 'd_' + Math.random().toString(36).slice(2, 8), title, due: ahead(dueOff), done: !!done });
    const projects = [
      { id: 'pr_bora', partnerId: 'p_sunline', title: 'Overwater Escape — Bora Bora feature', format: 'Stay & Feature', destination: 'Bora Bora, French Polynesia', stage: 'production', value: 12500, start: ago(20), due: ahead(32),
        deliverables: [dl('Shot list & creative brief signed off', -12, true), dl('On-location shoot (3 days)', 16), dl('Hero Reel — villa to lagoon (60s)', 24), dl('Carousel: “How to plan a Bora Bora stay”', 26), dl('6 Stories with booking link', 27), dl('Licensed photo set (25 images) + drone/360 B-roll', 30)],
        activity: [{ at: ago(2), text: 'Maya confirmed sunrise boat transfer for day 1' }, { at: ago(6), text: 'Kelsey shared the shot list' }, { at: ago(20), text: 'Contract signed — project kicked off' }] },
      { id: 'pr_gift', partnerId: 'p_sunline', title: 'Holiday gift guide — “Give an escape”', format: 'Gear in the Wild', destination: 'Online', stage: 'complete', value: 4000, start: ago(95), due: ago(48),
        deliverables: [dl('Gift guide carousel', -50, true), dl('3 Stories with link', -49, true), dl('30-day performance report', -18, true)],
        activity: [{ at: ago(18), text: 'Performance report delivered' }, { at: ago(48), text: 'Content went live' }] },
      { id: 'pr_iceland', partnerId: 'p_driftwood', title: 'Gear in the Wild — 1-bag pack test', format: 'Gear in the Wild', destination: 'Amalfi Coast road trip', stage: 'review', value: 7500, start: ago(40), due: ahead(6),
        deliverables: [dl('Field test on the road', -14, true), dl('Field-test Reel (45s)', 2, true), dl('Honest review carousel', 4), dl('LTK + code placement', 6)],
        activity: [{ at: ago(1), text: 'Zach uploaded the first cut for review' }, { at: ago(14), text: 'Field test wrapped' }] },
      { id: 'pr_capsule', partnerId: 'p_driftwood', title: 'Carry-on capsule Reel', format: 'Gear in the Wild', destination: 'New York', stage: 'complete', value: 3500, start: ago(140), due: ago(80),
        deliverables: [dl('Packing Reel', -82, true), dl('Stories with code', -81, true)], activity: [{ at: ago(80), text: 'Wrapped — 2.1× benchmark saves (sample)' }] },
      { id: 'pr_reef', partnerId: 'p_tidepool', title: 'Reef-safe SPF in the lagoon', format: 'Destination Story', destination: 'Moorea, French Polynesia', stage: 'live', value: 6000, start: ago(60), due: ahead(10),
        deliverables: [dl('Underwater Reel', -9, true), dl('Reef-safe explainer carousel', -8, true), dl('Stories with code', -8, true), dl('30-day report', 22)], activity: [{ at: ago(8), text: 'Content is live on both accounts' }] },
      { id: 'pr_reset', partnerId: 'p_tidepool', title: 'Jet-lag reset routine carousel', format: 'Destination Story', destination: 'Long-haul flight', stage: 'contracted', value: 2500, start: ago(3), due: ahead(40),
        deliverables: [dl('Routine storyboard', 12), dl('Carousel + Story set', 34)], activity: [{ at: ago(3), text: 'Proposal accepted — contract signed' }] },
    ];

    const proposals = [
      { id: 'pp_amb', partnerId: 'p_sunline', from: 'creator', title: 'Spring ’27 Ambassador program', status: 'submitted', budget: 36000, timeline: 'March – August 2027', usage: '12-month organic + 90-day paid whitelisting',
        objective: 'Make Sunline the resort our audience associates with “once-in-a-lifetime”. Two stays, quarterly hero content and an always-on Stories presence tied to your booking engine.',
        deliverables: '2 resort stays (different properties)\n4 hero Reels (one per quarter)\n2 plan-ready carousel guides\nMonthly Stories set with booking link\nCo-created “Overwater Week” campaign\nQuarterly performance reviews',
        versions: [{ v: 1, at: ago(3), by: 'Kelsey', note: 'Sent proposal' }], createdAt: ago(3), updatedAt: ago(3) },
      { id: 'pp_fjord', partnerId: 'p_aurora', from: 'partner', title: 'Fjords from above — 3-part aerial series', status: 'in-review', budget: 15000, timeline: 'June 2027 (Iceland window)', usage: '6-month organic',
        objective: 'Showcase helicopter + glacier landing experiences to US travelers planning summer trips.', deliverables: '3 Reels (one per experience)\n1 carousel itinerary\nStories takeover day',
        versions: [{ v: 1, at: ago(2, 4), by: 'Lars Eriksen', note: 'Submitted proposal' }], createdAt: ago(2, 4), updatedAt: ago(2, 4) },
      { id: 'pp_gift', partnerId: 'p_sunline', from: 'partner', title: 'Holiday gift guide — “Give an escape”', status: 'accepted', budget: 4000, timeline: 'Late November', usage: '6-month organic', objective: 'Drive gift-card sales for the holidays.', deliverables: 'Carousel\n3 Stories\nReport', versions: [{ v: 1, at: ago(100), by: 'Maya Torres', note: 'Submitted' }, { v: 1, at: ago(97), by: 'Zach', note: 'Accepted' }], createdAt: ago(100), updatedAt: ago(97), projectId: 'pr_gift' },
      { id: 'pp_pack', partnerId: 'p_driftwood', from: 'creator', title: 'Gear in the Wild — 1-bag pack test', status: 'accepted', budget: 7500, timeline: '6 weeks', usage: '12-month organic', objective: 'Prove one bag can handle a bucket-list road trip.', deliverables: 'Field-test Reel\nReview carousel\nLTK placement', versions: [{ v: 1, at: ago(45), by: 'Zach', note: 'Sent' }, { v: 2, at: ago(43), by: 'Zach', note: 'Revised usage terms' }, { v: 2, at: ago(41), by: 'Owen Park', note: 'Accepted' }], createdAt: ago(45), updatedAt: ago(41), projectId: 'pr_iceland' },
    ];

    const msg = (from, body, at, readBy) => ({ id: 'm_' + Math.random().toString(36).slice(2, 9), from, body, at, readBy: readBy || ['partner', 'hq'] });
    const threads = [
      { id: 't_bora', partnerId: 'p_sunline', subject: 'Bora Bora shoot logistics', messages: [
        msg('u_maya', 'Hi Kelsey & Zach! Boat transfer is confirmed for day one at 7:30am — sunrise light should be perfect for the drone. 🌅', ago(2, 6)),
        msg('zach', 'Amazing, thank you Maya! Drone goes up for the lagoon approach and Kelsey will grab the 360 walk-through of the villa.', ago(2, 5)),
        msg('kelsey', 'Also — could we get 30 minutes with your F&B team for the floating breakfast story? 🌺', ago(1, 3)),
        msg('u_maya', 'Done! I’ll loop in Chef Anaïs and send times tomorrow.', ago(0, 20), ['partner']),
      ] },
      { id: 't_amb', partnerId: 'p_sunline', subject: 'Spring ’27 Ambassador proposal', messages: [
        msg('kelsey', 'Sent over the ambassador proposal — no rush at all. Happy to hop on a call to walk through it together.', ago(3)),
      ] },
      { id: 't_pack', partnerId: 'p_driftwood', subject: 'Pack test — first cut ready', messages: [
        msg('zach', 'First cut is up in your Collaborations tab for review! 🎬', ago(1)),
        msg('u_owen', 'Watching now 👀 — love the cliff road opener.', ago(0, 22), ['partner']),
      ] },
      { id: 't_reef', partnerId: 'p_tidepool', subject: 'Reef-safe launch numbers', messages: [
        msg('u_priya', 'The underwater Reel is our best-performing creator post ever. Thank you both!', ago(5)),
        msg('kelsey', 'That makes our week!! 🐠 Full 30-day report coming soon.', ago(5)),
      ] },
    ];

    const bookings = [
      { id: 'bk_1', type: 'checkin', with: 'both', start: at(3, 11), minutes: 30, title: 'Bora Bora pre-shoot check-in', partnerId: 'p_sunline', projectId: 'pr_bora', notes: 'Final logistics + F&B story', status: 'confirmed', createdAt: ago(4) },
      { id: 'bk_2', type: 'review', with: 'zach', start: at(2, 10), minutes: 45, title: 'Pack test — content review', partnerId: 'p_driftwood', projectId: 'pr_iceland', notes: '', status: 'confirmed', createdAt: ago(1) },
      { id: 'bk_3', type: 'discovery', with: 'kelsey', start: at(5, 14), minutes: 30, title: 'Discovery call — Northbound Coffee Co.', inquiryId: 'inq_north', notes: '', status: 'confirmed', createdAt: ago(1) },
    ];

    const inquiries = [
      { id: 'inq_alpen', company: 'Alpenglow Lodge', name: 'Elena Brandt', email: 'elena@alpenglow.example', phone: '', website: 'alpenglow.example', category: 'Hotel / resort', formats: ['Stay & Feature'], budget: '$10,000–25,000', timeline: '3–6 months', goals: 'Launching our winter season — we’d love a cozy cabin + northern lights story for US travelers.', status: 'new', createdAt: ago(0, 5) },
      { id: 'inq_north', company: 'Northbound Coffee Co.', name: 'Sam Okafor', email: 'sam@northbound.example', phone: '+1 (555) 014-7781', website: 'northbound.example', category: 'Food & beverage', formats: ['Gear in the Wild'], budget: '$2,500–5,000', timeline: '1–3 months', goals: 'Packable pour-over kit — want to see it on a real adventure.', status: 'reviewing', bookingId: 'bk_3', createdAt: ago(1, 2) },
    ];

    const ideas = [
      { id: 'i_bag', title: 'The 1-bag bucket-list challenge', pitch: 'Three countries, one carry-on. Partners supply the kit; the audience votes on what makes the cut.', destination: 'Multi-country', season: 'Spring', niches: ['Adventure gear', 'Tech & creator tools'], votes: 24, voters: [], status: 'in-planning', by: 'Driftwood Outfitters', partnerId: 'p_driftwood', createdAt: ago(30), comments: [{ by: 'Zach', text: 'We’re already sketching routes for this one 👀', at: ago(12) }] },
      { id: 'i_reef', title: 'Reef-safe travel: protect the lagoons we love', pitch: 'A short series on how to snorkel, dive and swim with sharks responsibly — with a reef clean-up day.', destination: 'Moorea', season: 'Fall', niches: ['Sustainable travel', 'Wellness'], votes: 21, voters: [], status: 'greenlit', by: 'Tidepool Skincare', partnerId: 'p_tidepool', createdAt: ago(44), comments: [] },
      { id: 'i_overwater', title: 'Overwater week: seven bungalows, seven islands', pitch: 'A week-long Stories series comparing overwater villas — what’s worth the splurge.', destination: 'French Polynesia', season: 'Any', niches: ['Luxury stays'], votes: 18, voters: [], status: 'shortlisted', by: 'Kelsey & Zach', createdAt: ago(25), comments: [{ by: 'Maya Torres', text: 'Sunline would love to host two of the seven!', at: ago(9) }] },
      { id: 'i_360', title: 'Shot on 360: the Amalfi Coast from every angle', pitch: 'One drive, three cameras — drone, 360 and phone. Viewers pick the angle.', destination: 'Amalfi Coast', season: 'Summer', niches: ['Tech & creator tools', 'Experiences'], votes: 15, voters: [], status: 'open', by: 'Kelsey & Zach', createdAt: ago(16), comments: [] },
      { id: 'i_jetlag', title: 'Wellness on the road: the jet-lag reset', pitch: 'Our real routine for landing ready to explore — hydration, movement and sleep.', destination: 'Long-haul', season: 'Any', niches: ['Wellness'], votes: 12, voters: [], status: 'open', by: 'Tidepool Skincare', partnerId: 'p_tidepool', createdAt: ago(10), comments: [] },
      { id: 'i_tables', title: 'Local tables: one family dinner in every country', pitch: 'Skip the tourist menus. Each trip ends at a local family’s table.', destination: 'Everywhere', season: 'Any', niches: ['Food & culture'], votes: 9, voters: [], status: 'open', by: 'Kelsey & Zach', createdAt: ago(6), comments: [] },
    ];

    const windows = [
      { id: 'w_japan', title: 'Japan in cherry-blossom season', start: ahead(130), length: '12 days', slots: 3, taken: 1, niches: ['Food & culture', 'Tech & creator tools', 'Luxury stays'], blurb: 'Tokyo → Kyoto → a ryokan in the mountains.' },
      { id: 'w_iceland', title: 'Iceland Ring Road', start: ahead(215), length: '10 days', slots: 3, taken: 0, niches: ['Adventure gear', 'Experiences'], blurb: 'Glaciers, black-sand beaches and a camper van.' },
      { id: 'w_fp', title: 'Return to French Polynesia', start: ahead(300), length: '9 days', slots: 2, taken: 1, niches: ['Luxury stays', 'Sustainable travel', 'Wellness'], blurb: 'Moorea + Bora Bora, with a reef-restoration day.' },
    ];

    const blackouts = [
      { from: key(9), to: key(13), label: 'On location — shoot week' },
      { from: key(17), to: key(21), label: 'On location — Bora Bora feature' },
    ];

    const R = (handle, text, post, likes, daysAgo, sentiment, status) => ({ id: 'r_' + Math.random().toString(36).slice(2, 9), handle, text, post, likes, at: ago(daysAgo), sentiment, status });
    const P = { sharks: { cap: 'Swimming with blacktip reef sharks in Moorea 🦈', img: 'moorea' }, fiat: { cap: 'Positano in a vintage Fiat 500 ❤️🇮🇹', img: 'positano' }, guide: { cap: 'Our Moorea travel guide is live!', img: 'moorea' }, drone: { cap: 'Lagoon from above 🚁', emoji: '🚁' }, gear: { cap: 'What’s in our camera bag', emoji: '🎒' }, reel: { cap: 'Bucket-list moments of the year ✈️', emoji: '✈️' } };
    const reviews = [
      R('wanderwithjess', 'This is the most magical thing I’ve seen all week. Saving this for our honeymoon planning!! 🦈💙', P.sharks, 214, 9, 0.98, 'approved'),
      R('sarah.goes.places', 'Okay the red Fiat in Positano is the dreamiest photo on my entire feed 😍', P.fiat, 167, 30, 0.97, 'approved'),
      R('the.marino.family', 'Bought your Moorea guide and it planned our whole trip. The lagoon tour rec was worth every penny 🙌', P.guide, 98, 21, 0.99, 'approved'),
      R('mike_and_dani', 'You two make travel look so fun AND doable. Thank you for always sharing the details!', P.reel, 76, 14, 0.96, 'approved'),
      R('kayla.explores', 'That drone shot gave me actual chills. Adding French Polynesia to the list right now', P.drone, 141, 40, 0.95, 'approved'),
      R('travelingtrent', 'We booked the same snorkel tour because of you and it was the highlight of our trip 🐢', P.sharks, 59, 26, 0.97, 'approved'),
      R('nora.on.the.go', 'Your content is the only reason I finally booked French Polynesia. Zero regrets!!', P.guide, 88, 33, 0.98, 'approved'),
      R('lens.and.latitude', 'The way you two capture places… every post feels like a little movie 🎬', P.reel, 120, 5, 0.94, 'approved'),
      R('budgetbucketlist', 'Love that you actually share the costs and logistics. So rare and SO helpful.', P.gear, 64, 18, 0.95, 'approved'),
      R('alexis.wanders', 'Used your Insta360 code before our trip — obsessed with the footage 📸', P.gear, 47, 11, 0.93, 'approved'),
      R('jetsetjordan', 'Adding every single one of these spots to my bucket list ✈️✈️✈️', P.reel, 102, 7, 0.96, 'approved'),
      R('coastal.claire', 'Couple goals AND travel goals at the same time 😂❤️', P.fiat, 233, 29, 0.97, 'approved'),
      R('the_planner_pam', 'Honestly better than any travel agent. Your tips saved us hours of research.', P.guide, 71, 23, 0.97, 'approved'),
      R('miles.with.maria', 'This reel made my whole day. Can’t wait to see where you go next!', P.drone, 55, 3, 0.95, 'approved'),
      R('dive.daily.dan', 'Those visibility conditions are unreal — great tip on going early in the morning!', P.sharks, 22, 1, 0.91, 'pending'),
      R('honeymoon.hunt', 'Sending this to my fiancé immediately. Positano it is!! 💍', P.fiat, 31, 2, 0.96, 'pending'),
    ];
    const reviewPool = [
      { handle: 'gina.globetrots', text: 'I’ve watched this 10 times. The colors of that water!! 😍', post: P.drone, likes: 18, sentiment: 0.96 },
      { handle: 'ben.and.bags', text: 'Your packing list saved my trip, seriously. Thank you!', post: P.gear, likes: 12, sentiment: 0.95 },
      { handle: 'random.critic', text: 'Must be nice. Anyway.', post: P.reel, likes: 1, sentiment: 0.32 },
      { handle: 'sunset.sophie', text: 'You two are the reason I started saving for a big trip 🌅', post: P.fiat, likes: 26, sentiment: 0.97 },
      { handle: 'nate.travels', text: 'Is this sponsored? lol', post: P.gear, likes: 3, sentiment: 0.5 },
      { handle: 'islandlife.ivy', text: 'Moorea guide = best $ I’ve spent on travel planning. Thank you!!', post: P.guide, likes: 34, sentiment: 0.98 },
    ];

    const experiences = [
      { id: 'x1', title: 'Swam with blacktip reef sharks', place: 'Moorea', icon: 'wave', at: ago(9) },
      { id: 'x2', title: 'Cruised the cliffside road in a red Fiat 500', place: 'Positano', icon: 'compass', at: ago(30) },
      { id: 'x3', title: 'Published our Moorea travel guide', place: 'French Polynesia', icon: 'file', at: ago(21) },
      { id: 'x4', title: 'Field-tested a one-bag road trip', place: 'Amalfi Coast', icon: 'bag', at: ago(14) },
    ];

    const automations = [
      { id: 'a_inq', event: 'inquiry.created', label: 'New partnership inquiry', when: 'A brand submits the inquiry form', channels: ['sms', 'email'], to: ['kelsey', 'zach', 'inbox', 'partner'], enabled: true },
      { id: 'a_book', event: 'booking.created', label: 'Call booked', when: 'Any discovery call or partner meeting is booked', channels: ['sms', 'email'], to: ['kelsey', 'zach', 'partner'], enabled: true },
      { id: 'a_msg', event: 'message.received', label: 'New direct message', when: 'A partner messages Kelsey, Zach or both', channels: ['sms', 'email'], to: ['kelsey', 'zach'], enabled: true },
      { id: 'a_reply', event: 'message.reply', label: 'Reply to partner', when: 'Kelsey or Zach reply in a thread', channels: ['email'], to: ['partner'], enabled: true },
      { id: 'a_prop', event: 'proposal.submitted', label: 'Proposal submitted', when: 'A partner submits or revises a proposal', channels: ['sms', 'email'], to: ['kelsey', 'zach'], enabled: true },
      { id: 'a_psent', event: 'proposal.sent', label: 'Proposal sent to partner', when: 'Kelsey or Zach send or revise a proposal', channels: ['sms', 'email'], to: ['partner'], enabled: true },
      { id: 'a_dec', event: 'proposal.decision', label: 'Proposal decision', when: 'A proposal is accepted, declined or sent back', channels: ['email'], to: ['kelsey', 'zach', 'partner'], enabled: true },
      { id: 'a_reg', event: 'partner.registered', label: 'New partner account', when: 'A brand registers in the portal', channels: ['sms', 'email'], to: ['kelsey', 'zach'], enabled: true },
      { id: 'a_inv', event: 'partner.invited', label: 'Partner invited', when: 'An inquiry is converted into a portal partner', channels: ['email'], to: ['partner'], enabled: true },
      { id: 'a_stage', event: 'project.stage', label: 'Collaboration stage change', when: 'A project moves stage or content is approved', channels: ['email'], to: ['kelsey', 'zach', 'partner'], enabled: true },
      { id: 'a_idea', event: 'idea.trending', label: 'Idea is trending', when: 'An Innovation Center idea passes 20 votes or a new idea is pitched', channels: ['email'], to: ['kelsey', 'zach'], enabled: true },
      { id: 'a_rev', event: 'review.pending', label: 'Comments ready to approve', when: 'New positive Instagram comments are waiting in the queue', channels: ['email'], to: ['kelsey'], enabled: true },
    ];

    const notifications = [
      { id: 'n_s1', at: ago(0, 5), event: 'inquiry.created', channel: 'sms', to: 'kelsey', address: '+1 (555) 010-0142', subject: '', body: '✨ New partner inquiry: Alpenglow Lodge (Hotel / resort) · $10,000–25,000. No call booked yet. Open HQ to reply.', status: 'sent' },
      { id: 'n_s2', at: ago(0, 5), event: 'inquiry.created', channel: 'sms', to: 'zach', address: '+1 (555) 010-0188', subject: '', body: '✨ New partner inquiry: Alpenglow Lodge (Hotel / resort) · $10,000–25,000. No call booked yet. Open HQ to reply.', status: 'sent' },
      { id: 'n_s3', at: ago(0, 20), event: 'message.received', channel: 'sms', to: 'kelsey', address: '+1 (555) 010-0142', subject: '', body: '💬 Sunline Resorts (Maya): “Done! I’ll loop in Chef Anaïs and send times tomorrow.”', status: 'sent' },
    ];

    return {
      v: EA.SEED_VERSION,
      seededAt: new Date(now).toISOString(),
      session: { userId: null, actingAs: 'kelsey' },
      stats: { partnershipsBase: 38, adventuresBase: 64, experiencesBase: 296, countries: 27, tripsLogged: 0, liveIdx: 0 },
      contacts: {
        kelsey: { sms: '+1 (555) 010-0142', email: 'kelsey@ellisadventures.example' },
        zach: { sms: '+1 (555) 010-0188', email: 'zach@ellisadventures.example' },
        inbox: { email: EA.brand.email },
      },
      settings: { quietStart: 22, quietEnd: 7, reviewThreshold: 0.85, maskHandles: true, reviewPoolIdx: 0 },
      partners, users, projects, proposals, threads, bookings, inquiries, ideas, windows, blackouts, reviews, reviewPool, experiences, automations, notifications,
    };
  };
})(window.EA);

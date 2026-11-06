// POST /.netlify/functions/notify — receiver for Supabase Database Webhooks.
// Turns row changes into texts/emails for Kelsey & Zach (and confirmations for partners), following
// the automation_rules table that HQ edits in the portal. Secrets never touch the browser.
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabase-admin';
import { deliver, type Outgoing, type Recipient } from '../lib/messaging';

type Row = Record<string, any>;
interface WebhookPayload { type: 'INSERT' | 'UPDATE' | 'DELETE'; table: string; record: Row; old_record: Row | null }
interface Ctx { [k: string]: any; only?: Array<'kelsey' | 'zach'>; partner?: { email: string; phone?: string | null; sms: boolean } | null }

const TZ = 'America/New_York';
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
const snip = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const money = (cents: number) => '$' + Math.round(cents / 100).toLocaleString('en-US');
const who = (h: string) => ({ kelsey: 'Kelsey', zach: 'Zach', both: 'Kelsey & Zach' }[h] ?? h);
const TYPE_LABEL: Record<string, string> = { discovery: 'Discovery call', checkin: 'Project check-in', review: 'Content review', strategy: 'Strategy session' };

type Tpl = { sms?: (c: Ctx) => string; email?: (c: Ctx) => { subject: string; body: string }; partner?: (c: Ctx) => { subject: string; body: string } };
const T: Record<string, Tpl> = {
  'inquiry.created': {
    sms: (c) => `✨ New partner inquiry: ${c.company} (${c.category}) · ${c.budget}. ${c.when ? 'Discovery call ' + c.when + '.' : 'No call booked yet.'}`,
    email: (c) => ({ subject: `New partnership inquiry — ${c.company}`, body: `${c.contact_name} from ${c.company} wants to collaborate (${(c.formats || []).join(', ') || 'open to ideas'}).\nBudget: ${c.budget}\nTimeline: ${c.timeline}\n\n${c.goals}` }),
    partner: (c) => ({ subject: 'We got your note — Kelsey & Zach', body: `Hi ${c.contact_name}! Thanks for reaching out about ${c.company}. We'll reply personally within 48 hours.${c.when ? ` See you on ${c.when}.` : ''}` }),
  },
  'booking.created': {
    sms: (c) => `📅 ${c.company} booked a ${c.typeLabel} with ${c.withLabel} — ${c.when}.`,
    email: (c) => ({ subject: `Booked: ${c.typeLabel} with ${c.company}`, body: `${c.typeLabel} (${c.minutes} min) on ${c.when}.${c.notes ? `\nAgenda: ${c.notes}` : ''}` }),
    partner: (c) => ({ subject: `Confirmed: ${c.typeLabel} with ${c.withLabel}`, body: `You're booked for ${c.when}. Your calendar invite and video link come from our scheduler.` }),
  },
  'message.received': {
    sms: (c) => `💬 ${c.company} (${c.sender}): “${snip(c.body)}”`,
    email: (c) => ({ subject: `New message from ${c.company}`, body: `${c.sender} wrote in “${c.subject}”:\n\n${c.body}` }),
  },
  'message.reply': { partner: (c) => ({ subject: `${c.sender} replied — ${c.subject}`, body: `${snip(c.body, 400)}\n\nReply in your partner portal.` }) },
  'proposal.submitted': {
    sms: (c) => `📝 ${c.company} ${c.revised ? 'revised' : 'submitted'} a proposal: “${c.title}” · ${c.budget}.`,
    email: (c) => ({ subject: `Proposal ${c.revised ? 'revised' : 'submitted'} — ${c.title}`, body: `${c.company} sent “${c.title}” (${c.budget}, ${c.timeline}). Review it in HQ → Proposals.` }),
  },
  'proposal.sent': { partner: (c) => ({ subject: `New proposal from Kelsey & Zach: ${c.title}`, body: `“${c.title}” (${c.budget}) is waiting in your partner portal — comment, request changes or accept.` }) },
  'proposal.decision': {
    email: (c) => ({ subject: `Proposal ${c.decision}: ${c.title}`, body: `“${c.title}” for ${c.company} is now ${c.decision}.` }),
    partner: (c) => ({ subject: `Proposal ${c.decision}: ${c.title}`, body: `“${c.title}” is now ${c.decision}. Details are in your partner portal.` }),
  },
  'partner.registered': {
    sms: (c) => `🤝 New portal partner: ${c.company} (${c.name}). Verify them in HQ.`,
    email: (c) => ({ subject: `New partner account — ${c.company}`, body: `${c.name} registered ${c.company} in the partner portal.` }),
  },
  'project.stage': {
    email: (c) => ({ subject: `${c.title} → ${c.stage}`, body: `“${c.title}” (${c.company}) moved to ${c.stage}.` }),
    partner: (c) => ({ subject: `Update: ${c.title} is now ${c.stage}`, body: `Your collaboration “${c.title}” moved to ${c.stage}.` }),
  },
  'idea.trending': { email: (c) => ({ subject: `Trending idea: ${c.title} (${c.votes} votes)`, body: `“${c.title}” just passed ${c.votes} partner votes in the Innovation Center.` }) },
};

function secretOk(given: string | null): boolean {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET || '';
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const partnerRow = async (id?: string | null) => {
  if (!id) return null;
  const { data } = await supabaseAdmin.from('partners').select('company, contact_email, contact_phone, sms_updates').eq('id', id).single();
  return data;
};
const asPartner = (p: Row | null) => (p ? { email: p.contact_email, phone: p.contact_phone, sms: !!p.sms_updates } : null);

/** Map a row change to an event name + template context. Returns null when nothing should fire. */
async function toEvent({ type, table, record: r, old_record: old }: WebhookPayload): Promise<[string, Ctx] | null> {
  if (table === 'inquiries' && type === 'INSERT') {
    return ['inquiry.created', { ...r, partner: { email: r.email, phone: r.phone, sms: !!r.sms_opt_in } }];
  }
  if (table === 'bookings' && type === 'INSERT') {
    const p = await partnerRow(r.partner_id);
    const inq = r.inquiry_id ? (await supabaseAdmin.from('inquiries').select('company, email').eq('id', r.inquiry_id).single()).data : null;
    const ctx: Ctx = { company: p?.company ?? inq?.company ?? 'A prospect', typeLabel: TYPE_LABEL[r.type], withLabel: who(r.host), when: when(r.starts_at), minutes: r.minutes, notes: r.notes,
      only: r.host === 'both' ? undefined : [r.host], partner: p ? asPartner(p) : inq ? { email: inq.email, sms: false } : null };
    // Discovery calls booked inside the inquiry form are already announced by inquiry.created.
    if (r.inquiry_id && !r.partner_id) ctx.only = [];
    return ['booking.created', ctx];
  }
  if (table === 'messages' && type === 'INSERT') {
    const { data: thread } = await supabaseAdmin.from('threads').select('subject, partner_id').eq('id', r.thread_id).single();
    const p = await partnerRow(thread?.partner_id);
    if (r.as_creator) return ['message.reply', { sender: who(r.as_creator), subject: thread?.subject, body: r.body, partner: asPartner(p) }];
    const { data: sender } = await supabaseAdmin.from('profiles').select('full_name').eq('id', r.sender_id).single();
    return ['message.received', { company: p?.company, sender: sender?.full_name, subject: thread?.subject, body: r.body, only: r.addressed_to === 'both' ? undefined : [r.addressed_to] }];
  }
  if (table === 'proposals') {
    const p = await partnerRow(r.partner_id);
    const base = { title: r.title, budget: money(r.budget_cents), timeline: r.timeline, company: p?.company, partner: asPartner(p) };
    const statusChanged = type === 'UPDATE' && old?.status !== r.status;
    if (['accepted', 'declined', 'changes-requested'].includes(r.status) && statusChanged) return ['proposal.decision', { ...base, decision: r.status === 'changes-requested' ? 'sent back for changes' : r.status }];
    if (r.status === 'submitted' && (type === 'INSERT' || statusChanged)) {
      return r.from_side === 'partner' ? ['proposal.submitted', { ...base, revised: type === 'UPDATE', partner: null }] : ['proposal.sent', base];
    }
    return null;
  }
  if (table === 'profiles' && type === 'INSERT' && r.role === 'partner') {
    const p = await partnerRow(r.partner_id);
    return ['partner.registered', { company: p?.company, name: r.full_name }];
  }
  if (table === 'projects' && type === 'UPDATE' && old?.stage !== r.stage) {
    const p = await partnerRow(r.partner_id);
    return ['project.stage', { title: r.title, stage: r.stage, company: p?.company, partner: asPartner(p) }];
  }
  if (table === 'idea_votes' && type === 'INSERT') {
    const { count } = await supabaseAdmin.from('idea_votes').select('*', { count: 'exact', head: true }).eq('idea_id', r.idea_id);
    if (count !== 20) return null; // fire once, as the idea crosses the threshold
    const { data: idea } = await supabaseAdmin.from('ideas').select('title').eq('id', r.idea_id).single();
    return ['idea.trending', { title: idea?.title, votes: count }];
  }
  return null;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!secretOk(req.headers.get('x-webhook-secret'))) return new Response('Unauthorized', { status: 401 });

  const mapped = await toEvent((await req.json()) as WebhookPayload);
  if (!mapped) return Response.json({ skipped: true });
  const [event, ctx] = mapped;

  const { data: rule } = await supabaseAdmin.from('automation_rules').select('channels, recipients, enabled').eq('event', event).single();
  const tpl = T[event];
  if (!rule?.enabled || !tpl) return Response.json({ skipped: true, event });
  const { data: contacts } = await supabaseAdmin.from('creator_contacts').select('who, sms, email');
  const book = Object.fromEntries((contacts ?? []).map((c) => [c.who, c]));

  const out: Outgoing[] = [];
  for (const recipient of rule.recipients as Recipient[]) {
    if ((recipient === 'kelsey' || recipient === 'zach') && ctx.only && !ctx.only.includes(recipient)) continue;
    for (const channel of rule.channels as Array<'sms' | 'email'>) {
      if (recipient === 'partner') {
        if (!ctx.partner || !tpl.partner) continue;
        const msg = tpl.partner(ctx);
        if (channel === 'email' && ctx.partner.email) out.push({ event, channel, recipient, address: ctx.partner.email, ...msg });
        if (channel === 'sms' && ctx.partner.sms && ctx.partner.phone) out.push({ event, channel, recipient, address: ctx.partner.phone, body: msg.body });
        continue;
      }
      const addr = book[recipient]?.[channel];
      if (!addr) continue;
      if (channel === 'sms' && tpl.sms && recipient !== 'inbox') out.push({ event, channel, recipient, address: addr, body: tpl.sms(ctx) });
      if (channel === 'email' && tpl.email) out.push({ event, channel, recipient, address: addr, ...tpl.email(ctx) });
    }
  }
  await deliver(out);
  return Response.json({ event, sent: out.length });
};

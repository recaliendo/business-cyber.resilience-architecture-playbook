// netlify/functions/webhook.ts — ILLUSTRATIVE reference, not production-ready as-is.
// See vendors/stripe.md for rationale. Before using it:
//   1. Pin STRIPE_API_VERSION to the version you test against, and add a test fixture per event type.
//      Object shapes change between API versions. For example, newer versions moved the
//      subscription reference on invoices from `invoice.subscription` to
//      `invoice.parent.subscription_details.subscription`; subscriptionIdFromInvoice()
//      below handles both, but verify against YOUR pinned version.
//   2. Create the SQL objects in the comment at the bottom of this file (processed-event ledger
//      and the apply_stripe_event function). They make each event apply exactly once and in order.
//   3. Replace sendWelcomeEmail with your provider. It is idempotent by event ID.
import Stripe from 'stripe'
import { supabaseAdmin } from '../../lib/supabase-admin'

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION // e.g. the version shown in your Stripe dashboard; pin it explicitly
if (!STRIPE_API_VERSION) throw new Error('Set STRIPE_API_VERSION to the API version you have tested')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Invalid signature', { status: 400 })
  const rawBody = await req.text() // verify against the RAW body; never re-serialize JSON first

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    // Log detail server-side only; never tell the caller why verification failed.
    console.error('Webhook signature verification failed', (err as Error).message)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    const change = toEntitlementChange(event)
    if (change) {
      // One database transaction: record the event ID AND apply the change. If the event was
      // already processed, the function returns false and nothing is applied twice.
      // Out-of-order delivery: the function ignores subscription changes older than the last
      // one applied (compares event.created).
      const { data: applied, error } = await supabaseAdmin.rpc('apply_stripe_event', {
        p_event_id: event.id,
        p_event_type: event.type,
        p_event_created: event.created,
        p_user_id: change.userId,
        p_kind: change.kind,
        p_ref: change.ref,
        p_status: change.status ?? null,
        p_period_end: change.periodEnd ?? null,
      })
      if (error) throw error
      if (applied && change.kind === 'grant') {
        // Side effect AFTER commit, keyed on the event ID so a retry cannot send a second email.
        try { await sendWelcomeEmail(change.userId, event.id) } catch (err) { console.error('Non-critical: welcome email failed', err) }
      }
    }
  } catch (err) {
    // Return 5xx so Stripe retries instead of silently losing an entitlement.
    console.error('Webhook handler failed', event.id, (err as Error).message)
    return new Response('Handler error', { status: 500 })
  }
  return new Response(null, { status: 200 })
}

type Change = { userId: string; kind: 'grant' | 'subscription' | 'credits'; ref: string; status?: string; periodEnd?: string }

/** Map an event to the change it should cause. Returns null for events we ignore. */
function toEntitlementChange(event: Stripe.Event): Change | null {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session
      // Payment state: delayed payment methods complete later. Only grant when actually paid.
      if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return null
      // Authorization: this metadata was set by OUR server when creating the session
      // (see stripe-checkout-handler.ts). Never accept a user ID from the browser.
      const userId = s.metadata?.supabase_user_id
      if (!userId) { console.error('session missing supabase_user_id metadata', s.id); return null }
      return { userId, kind: 'grant', ref: s.id }
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice
      const sub = subscriptionIdFromInvoice(inv)
      const userId = (inv as unknown as { parent?: { subscription_details?: { metadata?: Record<string, string> } } }).parent?.subscription_details?.metadata?.supabase_user_id
        ?? inv.metadata?.supabase_user_id
      if (!sub || !userId) return null
      // Per-period key: redelivery for the same billing period cannot grant credits twice.
      return { userId, kind: 'credits', ref: `${sub}:${inv.period_start}` }
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id
      if (!userId) return null
      const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined
      const end = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end
      return { userId, kind: 'subscription', ref: sub.id, status: sub.status, periodEnd: end ? new Date(end * 1000).toISOString() : undefined }
    }
    default:
      return null
  }
}

function subscriptionIdFromInvoice(inv: Stripe.Invoice): string | undefined {
  const legacy = (inv as unknown as { subscription?: string | { id: string } }).subscription
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id
  const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent
  const s = parent?.subscription_details?.subscription
  return typeof s === 'string' ? s : s?.id
}

async function sendWelcomeEmail(_userId: string, _idempotencyKey: string) {
  // Implementation via your email provider; pass the event ID as its idempotency key.
}

/* Required SQL (adapt names; run as a migration):

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;   -- no client policies: service role only

create table public.entitlements (
  user_id uuid not null references auth.users(id),
  ref text not null,                      -- checkout session id or subscription:period key
  kind text not null,
  granted_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.entitlements enable row level security;
create policy "Users read their entitlements" on public.entitlements for select using (auth.uid() = user_id);

create table public.subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id),
  status text not null,
  current_period_end timestamptz,
  last_event_created bigint not null       -- ordering guard
);
alter table public.subscriptions enable row level security;
create policy "Users read their subscription" on public.subscriptions for select using (auth.uid() = user_id);

create or replace function public.apply_stripe_event(
  p_event_id text, p_event_type text, p_event_created bigint, p_user_id uuid,
  p_kind text, p_ref text, p_status text, p_period_end timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into stripe_events (event_id, event_type) values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then return false; end if;          -- duplicate delivery: already applied

  if p_kind in ('grant', 'credits') then
    insert into entitlements (user_id, ref, kind) values (p_user_id, p_ref, p_kind)
    on conflict (kind, ref) do nothing;
  elsif p_kind = 'subscription' then
    insert into subscriptions (stripe_subscription_id, user_id, status, current_period_end, last_event_created)
    values (p_ref, p_user_id, p_status, p_period_end, p_event_created)
    on conflict (stripe_subscription_id) do update
      set status = excluded.status, current_period_end = excluded.current_period_end, last_event_created = excluded.last_event_created
      where subscriptions.last_event_created <= excluded.last_event_created;   -- ignore older, out-of-order events
  end if;
  return true;
end $$;
revoke execute on function public.apply_stripe_event from public, anon, authenticated;
*/

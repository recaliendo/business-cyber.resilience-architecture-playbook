// netlify/functions/checkout.ts — ILLUSTRATIVE reference, not production-ready as-is.
// See vendors/stripe.md for rationale. Pin STRIPE_API_VERSION to the version you test against.
import Stripe from 'stripe'
import { supabaseServer } from '../../lib/supabase-server'
import { supabaseAdmin } from '../../lib/supabase-admin'

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION
if (!STRIPE_API_VERSION) throw new Error('Set STRIPE_API_VERSION to the API version you have tested')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })

// Server-side source of truth for what a client is allowed to purchase.
// Never trust a price ID sent from the client directly.
const PLANS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_ID_STARTER!,
  pro: process.env.STRIPE_PRICE_ID_PRO!,
}

// Naive in-memory rate limiter — replace with a durable store (e.g. a Supabase table
// or Upstash) once running on more than one function instance.
const recentRequests = new Map<string, number[]>()
function isRateLimited(key: string, limit = 10, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now()
  const timestamps = (recentRequests.get(key) ?? []).filter((t) => now - t < windowMs)
  timestamps.push(now)
  recentRequests.set(key, timestamps)
  return timestamps.length > limit
}

export default async (req: Request) => {
  const ip = req.headers.get('x-nf-client-connection-ip') ?? 'unknown'
  if (isRateLimited(ip)) {
    return new Response('Too many requests', { status: 429 })
  }

  const { plan } = await req.json()
  const priceId = PLANS[plan]
  if (!priceId) {
    return new Response('Invalid plan', { status: 400 })
  }

  // Requires an authenticated Supabase session — no anonymous checkout.
  const supabase = supabaseServer(/* cookies from req */ undefined as any)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Find-or-create the Stripe customer by OUR user ID, never by email. Looking customers up by email
  // can attach one user to another user's billing when addresses are unverified or change.
  // Store the mapping server-side (a `billing_customers` table, readable only by the service role).
  const { data: mapping } = await supabaseAdmin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  let customerId = mapping?.stripe_customer_id as string | undefined
  if (!customerId) {
    // The idempotency key makes a retry or double-click return the same customer, not a duplicate.
    const created = await stripe.customers.create(
      { email: user.email ?? undefined, metadata: { supabase_user_id: user.id } },
      { idempotencyKey: `customer-create-${user.id}` },
    )
    const { error } = await supabaseAdmin
      .from('billing_customers')
      .upsert({ user_id: user.id, stripe_customer_id: created.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    if (error) throw error
    customerId = created.id
  }
  const customer = { id: customerId }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    // Session-level metadata does NOT survive onto later subscription-lifecycle
    // webhook events on its own — also set it via subscription_data below.
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
    success_url: `${process.env.PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.PUBLIC_APP_URL}/billing`,
  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

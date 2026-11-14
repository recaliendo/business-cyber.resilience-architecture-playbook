// POST /.netlify/functions/inquiry — public "Start a partnership" form.
// Validates, bot-checks (honeypot + Cloudflare Turnstile), rate-limits, books the discovery call in
// Cal.com, and writes the rows. The notify webhook then texts/emails Kelsey & Zach.
//
// This endpoint is unauthenticated and every accepted submission sends email/SMS and books a calendar
// slot, so it is a spam and SMS-pumping target. Every check below fails CLOSED.
import { createHmac } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabase-admin';
import { createBooking, MINUTES, type Host } from '../lib/calcom';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOSTS: Host[] = ['kelsey', 'zach', 'both'];
const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Limits. Per-email and per-IP stop one sender; the global ceiling caps the damage from a
// distributed attack (rotating IPs and addresses) to a bounded number of texts/emails per hour.
const LIMIT_PER_EMAIL_PER_DAY = 3;
const LIMIT_PER_IP_PER_DAY = 5;
const LIMIT_GLOBAL_PER_HOUR = 30;

async function humanCheck(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed. Only local `netlify dev` may skip the check, and only by explicit opt-out.
    return process.env.INQUIRY_CHECKS_DISABLED_FOR_LOCAL_DEV === 'true';
  }
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** Keyed hash so the raw IP is never stored and the hash can't be reversed by brute-forcing IPv4. */
function ipHash(ip: string | null): string | null {
  const salt = process.env.IP_HASH_SALT;
  if (!ip || !salt) return null;
  return createHmac('sha256', salt).update(ip).digest('hex');
}

async function countSince(column: 'email' | 'client_ip_hash' | null, value: string | null, sinceMs: number): Promise<number> {
  let q = supabaseAdmin.from('inquiries').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - sinceMs).toISOString());
  if (column) q = q.eq(column, value);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return bad('Method not allowed', 405);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return bad('Invalid JSON'); }

  if (b.company_url_confirm) return Response.json({ ok: true }); // honeypot field — silently drop bots
  const ip = req.headers.get('x-nf-client-connection-ip');
  if (!(await humanCheck(b.turnstileToken, ip))) return bad('Bot check failed', 403);
  const clientIpHash = ipHash(ip);
  if (!clientIpHash && process.env.INQUIRY_CHECKS_DISABLED_FOR_LOCAL_DEV !== 'true') {
    console.error('inquiry: IP_HASH_SALT is not set or client IP missing; refusing to accept unthrottled submissions');
    return bad('Inquiries are temporarily unavailable', 503);
  }

  const inquiry = {
    company: str(b.company, 160), contact_name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40) || null,
    website: str(b.website, 200) || null, category: str(b.category, 60), budget: str(b.budget, 40), timeline: str(b.timeline, 40),
    goals: str(b.goals, 4000), formats: Array.isArray(b.formats) ? b.formats.map((f: unknown) => str(f, 40)).filter(Boolean).slice(0, 6) : [],
    sms_opt_in: b.smsOk === true && !!str(b.phone, 40),
    client_ip_hash: clientIpHash,
  };
  if (!inquiry.company || !inquiry.contact_name || !inquiry.category || !inquiry.budget || !inquiry.timeline) return bad('Missing required fields');
  if (!EMAIL.test(inquiry.email)) return bad('Invalid email');
  if (inquiry.goals.length < 10) return bad('Tell us a little more about your goals');

  // Rate limits (fail closed: a DB error rejects the submission rather than skipping the check).
  try {
    if ((await countSince('email', inquiry.email, 864e5)) >= LIMIT_PER_EMAIL_PER_DAY) return bad('Too many inquiries — we already have yours!', 429);
    if (clientIpHash && (await countSince('client_ip_hash', clientIpHash, 864e5)) >= LIMIT_PER_IP_PER_DAY) return bad('Too many inquiries from this network today', 429);
    if ((await countSince(null, null, 36e5)) >= LIMIT_GLOBAL_PER_HOUR) {
      console.warn('inquiry: global hourly ceiling reached — possible abuse');
      return bad('We are getting a lot of inquiries right now — please try again in an hour', 429);
    }
  } catch (err) {
    console.error('inquiry: rate-limit check failed', err);
    return bad('Could not save inquiry', 500);
  }

  const { data: row, error } = await supabaseAdmin.from('inquiries').insert(inquiry).select('id').single();
  if (error || !row) return bad('Could not save inquiry', 500);

  let booking: { id: string; starts_at: string; host: Host } | null = null;
  const slot = b.slot as { host?: Host; start?: string } | undefined;
  if (slot?.start && slot.host && HOSTS.includes(slot.host) && !Number.isNaN(Date.parse(slot.start))) {
    try {
      const cal = await createBooking({ host: slot.host, type: 'discovery', start: slot.start, name: inquiry.contact_name, email: inquiry.email, timeZone: str(b.timeZone, 60) || undefined, metadata: { inquiryId: row.id } });
      const { data } = await supabaseAdmin.from('bookings').insert({ type: 'discovery', host: slot.host, starts_at: slot.start, minutes: MINUTES.discovery, inquiry_id: row.id, status: 'confirmed', calcom_uid: cal.uid })
        .select('id, starts_at, host').single();
      booking = data as typeof booking;
    } catch {
      // The time was taken between picking and submitting. Keep the inquiry; the UI offers new times.
      return Response.json({ ok: true, inquiryId: row.id, booking: null, slotUnavailable: true });
    }
  }
  return Response.json({ ok: true, inquiryId: row.id, booking });
};

// POST /.netlify/functions/inquiry — public "Start a partnership" form.
// Validates, bot-checks (honeypot + optional Cloudflare Turnstile), books the discovery call in
// Cal.com, and writes the rows. The notify webhook then texts/emails Kelsey & Zach.
import { supabaseAdmin } from '../lib/supabase-admin';
import { createBooking, MINUTES, type Host } from '../lib/calcom';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOSTS: Host[] = ['kelsey', 'zach', 'both'];
const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function humanCheck(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // optional until the widget is added to the form
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
  });
  return ((await res.json()) as { success?: boolean }).success === true;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return bad('Method not allowed', 405);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return bad('Invalid JSON'); }

  if (b.company_url_confirm) return Response.json({ ok: true }); // honeypot field — silently drop bots
  if (!(await humanCheck(b.turnstileToken, req.headers.get('x-nf-client-connection-ip')))) return bad('Bot check failed', 403);

  const inquiry = {
    company: str(b.company, 160), contact_name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40) || null,
    website: str(b.website, 200) || null, category: str(b.category, 60), budget: str(b.budget, 40), timeline: str(b.timeline, 40),
    goals: str(b.goals, 4000), formats: Array.isArray(b.formats) ? b.formats.map((f: unknown) => str(f, 40)).filter(Boolean).slice(0, 6) : [],
    sms_opt_in: b.smsOk === true && !!str(b.phone, 40),
  };
  if (!inquiry.company || !inquiry.contact_name || !inquiry.category || !inquiry.budget || !inquiry.timeline) return bad('Missing required fields');
  if (!EMAIL.test(inquiry.email)) return bad('Invalid email');
  if (inquiry.goals.length < 10) return bad('Tell us a little more about your goals');

  // Light rate limit: 3 inquiries per email per day.
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await supabaseAdmin.from('inquiries').select('id', { count: 'exact', head: true }).eq('email', inquiry.email).gte('created_at', since);
  if ((count ?? 0) >= 3) return bad('Too many inquiries — we already have yours!', 429);

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

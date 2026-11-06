// POST /.netlify/functions/book — existing partners book check-ins, content reviews and strategy
// sessions from the portal. Same Cal.com event types as the discovery call; caller must be signed in.
import { supabaseAdmin, callerFrom } from '../lib/supabase-admin';
import { createBooking, MINUTES, type Host, type MeetingType } from '../lib/calcom';

const HOSTS: Host[] = ['kelsey', 'zach', 'both'];
const PARTNER_TYPES: MeetingType[] = ['checkin', 'review', 'strategy'];

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const caller = await callerFrom(req);
  if (!caller || caller.profile.role !== 'partner' || !caller.profile.partner_id) return new Response('Unauthorized', { status: 401 });

  const b = (await req.json()) as { host?: Host; type?: MeetingType; start?: string; projectId?: string; notes?: string; timeZone?: string };
  if (!b.host || !HOSTS.includes(b.host) || !b.type || !PARTNER_TYPES.includes(b.type) || !b.start || Number.isNaN(Date.parse(b.start))) {
    return Response.json({ error: 'Bad booking request' }, { status: 400 });
  }
  if (b.projectId) {
    const { data: p } = await supabaseAdmin.from('projects').select('id').eq('id', b.projectId).eq('partner_id', caller.profile.partner_id).maybeSingle();
    if (!p) return Response.json({ error: 'Unknown project' }, { status: 400 });
  }
  const notes = (b.notes || '').slice(0, 500);
  try {
    const cal = await createBooking({ host: b.host, type: b.type, start: b.start, name: caller.profile.full_name, email: caller.user.email!, timeZone: b.timeZone, notes, metadata: { partnerId: caller.profile.partner_id } });
    const { data, error } = await supabaseAdmin.from('bookings').insert({
      type: b.type, host: b.host, starts_at: b.start, minutes: MINUTES[b.type], partner_id: caller.profile.partner_id,
      project_id: b.projectId || null, notes: notes || null, status: 'confirmed', calcom_uid: cal.uid, created_by: caller.user.id,
    }).select('*').single();
    if (error) throw error;
    return Response.json({ ok: true, booking: data });
  } catch {
    return Response.json({ error: 'That time was just taken — pick another.' }, { status: 409 });
  }
};

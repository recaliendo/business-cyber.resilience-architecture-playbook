// GET /.netlify/functions/availability?host=both&type=discovery&from=2027-03-01&to=2027-03-31
// Open times for the shared booking calendar (inquiry wizard + partner portal).
import { getSlots, MINUTES, type Host, type MeetingType } from '../lib/calcom';

const HOSTS: Host[] = ['kelsey', 'zach', 'both'];
const TYPES = Object.keys(MINUTES) as MeetingType[];

export default async (req: Request) => {
  const u = new URL(req.url);
  const host = u.searchParams.get('host') as Host;
  const type = u.searchParams.get('type') as MeetingType;
  const from = new Date(u.searchParams.get('from') || Date.now());
  const to = new Date(u.searchParams.get('to') || Date.now() + 31 * 864e5);
  if (!HOSTS.includes(host) || !TYPES.includes(type)) return Response.json({ error: 'Bad host or type' }, { status: 400 });
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 62 * 864e5) {
    return Response.json({ error: 'Range must be under 62 days' }, { status: 400 });
  }
  const earliest = new Date(Math.max(from.getTime(), Date.now() + 24 * 36e5)); // 24h minimum notice
  try {
    const slots = await getSlots(host, MINUTES[type], earliest.toISOString(), to.toISOString());
    return Response.json({ host, type, minutes: MINUTES[type], slots }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return Response.json({ error: 'Scheduler unavailable' }, { status: 502 });
  }
};

// Scheduling backend: Cal.com API v2.
// Each (host, length) pair maps to a Cal.com event type. "both" uses a COLLECTIVE event type, so
// Cal.com only offers times when Kelsey's AND Zach's connected calendars are free — travel days
// blocked on either calendar disappear automatically.
// Verify the cal-api-version headers against https://cal.com/docs/api-reference/v2 when wiring up.

export type Host = 'kelsey' | 'zach' | 'both';
export type MeetingType = 'discovery' | 'checkin' | 'review' | 'strategy';
export const MINUTES: Record<MeetingType, 30 | 45 | 60> = { discovery: 30, checkin: 30, review: 45, strategy: 60 };

const BASE = 'https://api.cal.com/v2';

/** CAL_EVENT_TYPES env: JSON like {"both:30":123,"kelsey:30":456,"zach:45":789,...} */
export function eventTypeId(host: Host, minutes: number): number {
  const map = JSON.parse(process.env.CAL_EVENT_TYPES || '{}') as Record<string, number>;
  const id = map[`${host}:${minutes}`];
  if (!id) throw new Error(`No Cal.com event type configured for ${host}:${minutes}`);
  return id;
}

const headers = (version: string) => ({ Authorization: `Bearer ${process.env.CAL_API_KEY}`, 'cal-api-version': version, 'Content-Type': 'application/json' });

export async function getSlots(host: Host, minutes: number, startIso: string, endIso: string): Promise<string[]> {
  const q = new URLSearchParams({ eventTypeId: String(eventTypeId(host, minutes)), start: startIso, end: endIso, timeZone: 'America/New_York' });
  const res = await fetch(`${BASE}/slots?${q}`, { headers: headers('2024-09-04') });
  if (!res.ok) throw new Error(`Cal.com slots ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, Array<{ start: string }>> };
  return Object.values(json.data ?? {}).flat().map((s) => s.start);
}

export async function createBooking(opts: { host: Host; type: MeetingType; start: string; name: string; email: string; timeZone?: string; notes?: string; metadata?: Record<string, string> }) {
  const res = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: headers('2024-08-13'),
    body: JSON.stringify({
      start: opts.start,
      eventTypeId: eventTypeId(opts.host, MINUTES[opts.type]),
      attendee: { name: opts.name, email: opts.email, timeZone: opts.timeZone || 'America/New_York' },
      bookingFieldsResponses: opts.notes ? { notes: opts.notes } : undefined,
      metadata: opts.metadata,
    }),
  });
  const json = (await res.json()) as { data?: { uid?: string }; error?: { message?: string } };
  if (!res.ok || !json.data?.uid) throw new Error(`Cal.com booking failed: ${json.error?.message ?? res.status}`);
  return { uid: json.data.uid };
}

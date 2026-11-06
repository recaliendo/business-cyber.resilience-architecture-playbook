// Outbound texts (Twilio) and emails (Resend), with quiet hours and a delivery log.
import { supabaseAdmin } from './supabase-admin';

export type Channel = 'sms' | 'email';
export type Recipient = 'kelsey' | 'zach' | 'inbox' | 'partner';
export interface Outgoing { event: string; channel: Channel; recipient: Recipient; address: string; subject?: string; body: string }

const TZ = 'America/New_York';

export async function inQuietHours(): Promise<boolean> {
  const { data } = await supabaseAdmin.from('site_settings').select('quiet_start, quiet_end').single();
  const start = data?.quiet_start ?? 22;
  const end = data?.quiet_end ?? 7;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

async function sendSms(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  // A Messaging Service (not a bare From number) is what US A2P 10DLC registration expects.
  const form = new URLSearchParams({ To: to, Body: body.slice(0, 600), MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID! });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${json.message ?? 'send failed'}`);
  return json.sid ?? '';
}

async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, reply_to: process.env.EMAIL_REPLY_TO }),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? 'send failed'}`);
  return json.id ?? '';
}

/** Send (or queue, during quiet hours) and log every message. Never throws — failures are logged. */
export async function deliver(items: Outgoing[]): Promise<void> {
  if (!items.length) return;
  const quiet = await inQuietHours();
  await Promise.all(items.map(async (m) => {
    const row = { event: m.event, channel: m.channel, recipient: m.recipient, address: m.address, subject: m.subject ?? null, body: m.body };
    if (m.channel === 'sms' && quiet) {
      await supabaseAdmin.from('notification_log').insert({ ...row, status: 'queued' });
      return;
    }
    try {
      const providerId = m.channel === 'sms' ? await sendSms(m.address, m.body) : await sendEmail(m.address, m.subject ?? 'Ellis Adventures', m.body);
      await supabaseAdmin.from('notification_log').insert({ ...row, status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() });
    } catch (err) {
      await supabaseAdmin.from('notification_log').insert({ ...row, status: 'failed', error: String(err).slice(0, 500) });
    }
  }));
}

/** Flush SMS queued during quiet hours (called by the scheduled flush-queue function). */
export async function flushQueued(): Promise<number> {
  if (await inQuietHours()) return 0;
  const { data } = await supabaseAdmin.from('notification_log').select('id, address, body').eq('status', 'queued').eq('channel', 'sms').limit(50);
  for (const q of data ?? []) {
    try {
      const providerId = await sendSms(q.address, q.body);
      await supabaseAdmin.from('notification_log').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() }).eq('id', q.id);
    } catch (err) {
      await supabaseAdmin.from('notification_log').update({ status: 'failed', error: String(err).slice(0, 500) }).eq('id', q.id);
    }
  }
  return data?.length ?? 0;
}

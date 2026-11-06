// Scheduled: sends texts that were queued during quiet hours (10pm–7am ET by default).
import type { Config } from '@netlify/functions';
import { flushQueued } from '../lib/messaging';

export default async () => {
  const sent = await flushQueued();
  return Response.json({ flushed: sent });
};

export const config: Config = { schedule: '*/15 * * * *' };

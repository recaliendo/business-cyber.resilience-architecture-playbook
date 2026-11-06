// Service-role Supabase client. Netlify Functions ONLY — never import from browser code.
// (Same pattern as templates/config/supabase-clients.ts in the playbook.)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
// Catches the "pasted the anon key into the service-role slot" mistake at startup.
if (serviceRoleKey.split('.').length !== 3) throw new Error('SUPABASE_SERVICE_ROLE_KEY does not look like a JWT');

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Resolve the signed-in caller from a `Authorization: Bearer <supabase access token>` header. */
export async function callerFrom(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await supabaseAdmin.from('profiles').select('id, role, partner_id, full_name').eq('id', data.user.id).single();
  return profile ? { user: data.user, profile } : null;
}

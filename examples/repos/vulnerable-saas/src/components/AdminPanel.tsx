'use client';
import { createClient } from '@supabase/supabase-js';
// Synthetic fixture: service-role key in a client component.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!);
const apiKey = "fixture0000aaaa1111";
export default function AdminPanel() { void admin; void apiKey; return null; }

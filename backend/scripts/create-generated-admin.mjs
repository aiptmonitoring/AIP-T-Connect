import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) {
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const email = process.env.AIPT_NEW_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.AIPT_NEW_ADMIN_PASSWORD;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !password || !secret || !process.env.SUPABASE_URL) throw new Error('Administrator creation configuration is incomplete.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 16) throw new Error('Generated administrator credentials are invalid.');

const supabase = createClient(process.env.SUPABASE_URL, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: 'administrator' },
  user_metadata: { full_name: 'AIP&T Administrator' },
});
if (created.error || !created.data.user) throw created.error ?? new Error('Administrator Auth account was not created.');

const profile = await supabase.from('profiles').upsert({
  id: created.data.user.id,
  full_name: 'AIP&T Administrator',
  company_name: 'AIP&T',
  role: 'administrator',
  approval_status: 'approved',
  account_status: 'active',
  failed_login_attempts: 0,
  locked_at: null,
}).select('role,approval_status,account_status,failed_login_attempts,locked_at').single();

if (profile.error) {
  await supabase.auth.admin.deleteUser(created.data.user.id);
  throw profile.error;
}

console.log(JSON.stringify({
  ok: true,
  email,
  role: profile.data.role,
  approval_status: profile.data.approval_status,
  account_status: profile.data.account_status,
  locked: Boolean(profile.data.locked_at),
}));

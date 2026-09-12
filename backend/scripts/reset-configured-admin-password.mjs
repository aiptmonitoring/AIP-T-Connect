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

const email = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.AIPT_TEMP_ADMIN_PASSWORD;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !password || !secret || !process.env.SUPABASE_URL) throw new Error('Administrator reset configuration is incomplete.');
if (password.length < 16 || password.length > 128) throw new Error('Generated password does not meet the required length.');

const supabase = createClient(process.env.SUPABASE_URL, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const user = authUsers.users.find((entry) => entry.email?.trim().toLowerCase() === email);
if (!user) throw new Error('The configured administrator Auth account does not exist.');

const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();
if (profileError || profile?.role !== 'administrator') throw new Error('Refusing to reset a non-administrator account.');

const { error: passwordError } = await supabase.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (passwordError) throw passwordError;

const { error: unlockError } = await supabase
  .from('profiles')
  .update({ failed_login_attempts: 0, locked_at: null })
  .eq('id', user.id)
  .eq('role', 'administrator');
if (unlockError) throw unlockError;

console.log(JSON.stringify({ ok: true, password_reset: true, lockout_cleared: true }));

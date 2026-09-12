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
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !secret || !process.env.SUPABASE_URL) throw new Error('Configured administrator access is incomplete.');

const supabase = createClient(process.env.SUPABASE_URL, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const user = authUsers.users.find((entry) => entry.email?.trim().toLowerCase() === email);
if (!user) throw new Error('The configured administrator Auth account does not exist.');

const { data: before, error: profileError } = await supabase
  .from('profiles')
  .select('role,approval_status,account_status,failed_login_attempts,locked_at')
  .eq('id', user.id)
  .single();
if (profileError || !before) throw profileError ?? new Error('Administrator profile not found.');
if (before.role !== 'administrator') throw new Error('Refusing to unlock: the configured account is not an administrator.');

const { data: after, error: unlockError } = await supabase
  .from('profiles')
  .update({ failed_login_attempts: 0, locked_at: null })
  .eq('id', user.id)
  .eq('role', 'administrator')
  .select('role,approval_status,account_status,failed_login_attempts,locked_at')
  .single();
if (unlockError) throw unlockError;

console.log(JSON.stringify({
  ok: true,
  auth_user_found: true,
  role: after.role,
  approval_status: after.approval_status,
  account_status: after.account_status,
  was_locked: Boolean(before.locked_at) || before.failed_login_attempts > 0,
  failed_login_attempts: after.failed_login_attempts,
  locked: Boolean(after.locked_at),
}, null, 2));

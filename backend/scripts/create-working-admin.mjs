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

const email = process.env.NEW_ADMIN_EMAIL ?? 'admin@aiptlaw.com';
const password = process.env.NEW_ADMIN_PASSWORD ?? 'AIPTAdmin123!';
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!secret) throw new Error('SUPABASE_SECRET_KEY is required.');

const supabase = createClient(process.env.SUPABASE_URL, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) throw listError;

let user = listData.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'administrator' },
    user_metadata: { full_name: 'System Administrator' },
  });

  if (error && error.code !== 'email_exists' && error.code !== 'user_already_exists') {
    throw error;
  }

  const refreshed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  user = refreshed.data.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
}

if (!user) throw new Error('Admin user could not be created or located.');

const { error: updateUserError } = await supabase.auth.admin.updateUserById(user.id, {
  password,
  app_metadata: { role: 'administrator' },
  user_metadata: { full_name: 'System Administrator' },
});

if (updateUserError) throw updateUserError;

const { error: profileError } = await supabase.from('profiles').upsert({
  id: user.id,
  full_name: 'System Administrator',
  role: 'administrator',
  approval_status: 'approved',
  account_status: 'active',
  company_name: 'AIP&T',
});

if (profileError) throw profileError;

const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });

if (loginError) throw loginError;

console.log(JSON.stringify({
  ok: true,
  email,
  password,
  userId: loginData.user.id,
  role: 'administrator',
  approval_status: 'approved',
  account_status: 'active',
}, null, 2));

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const [key, ...parts] = line.split('=');
  if (key && !process.env[key]) process.env[key] = parts.join('=');
}

for (const key of ['SUPABASE_URL', 'DEMO_ADMIN_EMAIL', 'DEMO_ADMIN_PASSWORD']) if (!process.env[key]) throw new Error(`${key} is required.`);
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!secret) throw new Error('SUPABASE_SECRET_KEY is required.');
const supabase = createClient(process.env.SUPABASE_URL, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const email = process.env.DEMO_ADMIN_EMAIL.trim().toLowerCase();

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: process.env.DEMO_ADMIN_PASSWORD,
  email_confirm: true,
  app_metadata: { role: 'administrator' },
  user_metadata: { full_name: 'Demo Administrator' },
});

if (error) {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') {
    throw new Error('An administrator account with the configured email already exists. Its password was not changed.');
  }

  throw error;
}

const { error: profileError } = await supabase
  .from('profiles')
  .upsert({ id: data.user.id, full_name: 'Demo Administrator', role: 'administrator' });

if (profileError) throw profileError;

console.log('Administrator account created and profile role verified.');

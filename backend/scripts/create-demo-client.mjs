import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const [key, ...parts] = line.split('=');
  if (key && !process.env[key]) process.env[key] = parts.join('=');
}

for (const key of ['SUPABASE_URL', 'DEMO_CLIENT_EMAIL', 'DEMO_CLIENT_PASSWORD', 'DEMO_CLIENT_COMPANY']) {
  if (!process.env[key]) throw new Error(`${key} is required.`);
}
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!secret) throw new Error('SUPABASE_SECRET_KEY is required.');
const supabase = createClient(process.env.SUPABASE_URL, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const email = process.env.DEMO_CLIENT_EMAIL.trim().toLowerCase();

let { data: client, error: clientError } = await supabase
  .from('clients')
  .select('id,company_name,email')
  .ilike('company_name', process.env.DEMO_CLIENT_COMPANY.trim())
  .is('deleted_at', null)
  .maybeSingle();
if (clientError) throw clientError;
if (!client) {
  const { data: country, error: countryError } = await supabase.from('countries').select('id').is('deleted_at', null).order('name').limit(1).maybeSingle();
  if (countryError) throw countryError;
  if (!country) throw new Error('Create at least one country before provisioning a client account.');
  const { data: createdClient, error: createClientError } = await supabase.from('clients').insert({
    company_name: process.env.DEMO_CLIENT_COMPANY.trim(),
    email,
    phone: '+1 (212) 555-0189',
    client_type: 'Corporate',
    address: '123 Innovation Drive, New York, NY 10001, USA',
    country_id: country.id,
    notes: 'Demo client account',
    status: 'Active',
  }).select('id,company_name,email').single();
  if (createClientError) throw createClientError;
  client = createdClient;
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: process.env.DEMO_CLIENT_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: client.company_name },
});
if (error) {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') throw new Error('A client account with the configured email already exists. Its password was not changed.');
  throw error;
}

const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, full_name: client.company_name, role: 'client', client_id: client.id });
if (profileError) throw profileError;
console.log(`Client account created for ${client.company_name}: ${email}`);

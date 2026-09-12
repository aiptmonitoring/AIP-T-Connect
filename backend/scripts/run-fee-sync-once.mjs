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

const email = process.argv[2];
const password = process.argv[3];
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!email || !password || !url || !secret) throw new Error('Sync credentials or Supabase configuration is missing.');

const db = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (users.error) throw users.error;
const user = users.data.users.find(entry => entry.email?.toLowerCase() === email.toLowerCase());
if (!user) throw new Error('Administrator account was not found.');
const profile = await db.from('profiles').select('role,approval_status,account_status').eq('id', user.id).single();
if (profile.error) throw profile.error;
if (profile.data.role !== 'administrator' || profile.data.approval_status !== 'approved' || profile.data.account_status !== 'active') {
  throw new Error('Provided account is not an active approved administrator.');
}
const login = await db.auth.signInWithPassword({ email, password });
if (login.error || !login.data.session) throw login.error ?? new Error('Admin login failed.');

const endpoint = `${url.replace(/\/$/, '')}/functions/v1/sync-fees`;
const before = await db.from('fee_sync_runs').select('id').order('started_at', { ascending: false }).limit(1).maybeSingle();
if (before.error) throw before.error;
const previousRunId = before.data?.id;
const request = fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'sync-now' }),
});

let finalRun;
for (let attempt = 0; attempt < 1800; attempt += 1) {
  const result = await db.from('fee_sync_runs').select('id,status,current_stage,current_sheet,current_operation,percentage,error_message,processed_rows,total_rows').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  const run = result.data;
  if (run && run.id === previousRunId) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    continue;
  }
  if (run) {
    console.log(`${new Date().toISOString()} ${run.status} ${run.percentage}% ${run.current_sheet || ''} ${run.current_operation || ''}`.trim());
    if (['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status)) {
      finalRun = run;
      break;
    }
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}

const response = await request;
const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({ http_status: response.status, response: body, final_run: finalRun }, null, 2));
if (!response.ok || finalRun?.status !== 'completed') process.exitCode = 1;
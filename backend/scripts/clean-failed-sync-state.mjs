import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const active = await db.from('fee_sync_runs').select('id').in('status', ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering']);
if (active.error) throw active.error;
for (const run of active.data || []) {
  const result = await db.from('fee_sync_runs').update({ status: 'interrupted', current_stage: 'interrupted', current_operation: 'Cleared before final retry', error_message: 'Cleared before final retry.', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', run.id);
  if (result.error) throw result.error;
  const locks = await db.from('fee_sync_locks').update({ released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('sync_run_id', run.id).is('released_at', null);
  if (locks.error) throw locks.error;
}
const staging = await db.from('fee_dataset_versions').select('id').eq('status', 'staging');
if (staging.error) throw staging.error;
for (const version of staging.data || []) {
  const result = await db.from('fee_dataset_versions').delete().eq('id', version.id);
  if (result.error) throw result.error;
}
console.log(JSON.stringify({ active_cleared: active.data?.length || 0, staging_cleared: staging.data?.length || 0 }));
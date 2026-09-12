import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const before = await db.from('fee_sync_runs').select('id').order('started_at', { ascending: false }).limit(1).maybeSingle();
if (before.error) throw before.error;
const request = fetch(`${process.env.SUPABASE_URL}/functions/v1/sync-fees`, {
  method: 'POST',
  headers: { 'x-fee-sync-scheduler-secret': process.env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'sync-now' }),
});
let finalRun;
for (let attempt = 0; attempt < 1800; attempt += 1) {
  const result = await db.from('fee_sync_runs').select('id,status,current_stage,current_sheet,current_operation,percentage,error_message,processed_rows,total_rows').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  if (result.data && result.data.id !== before.data?.id) {
    finalRun = result.data;
    console.log(`${finalRun.status} ${finalRun.percentage}% ${finalRun.current_sheet || ''} ${finalRun.current_operation || ''}`.trim());
    if (['completed', 'failed', 'interrupted', 'cancelled'].includes(finalRun.status)) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
const response = await request;
const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({ http_status: response.status, response: body, final_run: finalRun }, null, 2));
if (!response.ok || finalRun?.status !== 'completed') process.exitCode = 1;

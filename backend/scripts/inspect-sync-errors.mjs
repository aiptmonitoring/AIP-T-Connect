import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const countries = await db.from('countries').select('name,abbreviation').order('name');
if (countries.error) throw countries.error;
console.log(JSON.stringify({ countries: countries.data }, null, 2));
const result = await db.from('fee_sync_errors').select('error_type,error_message,sheet_name,source_row').eq('sync_run_id', process.argv[2]);
if (result.error) throw result.error;
const counts = {};
const messages = {};
for (const row of result.data || []) counts[row.error_type] = (counts[row.error_type] || 0) + 1;
for (const row of result.data || []) {
  const key = `${row.error_type}: ${row.error_message}`;
  messages[key] = (messages[key] || 0) + 1;
}
console.log(JSON.stringify({ count: result.data?.length || 0, counts, messages }, null, 2));

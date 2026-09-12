import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '18NnLMFTdfL50khE3vB-zmFuOMeKEpfAB7nx0u9SRanY';
const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  : JSON.parse(readFileSync(new URL('../../importtant/newaipt-506908-62986831bdff.json', import.meta.url), 'utf8'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const encode = (value) => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = encode(JSON.stringify({
  iss: serviceAccount.client_email,
  scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
}));
const signer = crypto.createSign('RSA-SHA256');
signer.update(`${header}.${claim}`);
const assertion = `${header}.${claim}.${signer.sign(serviceAccount.private_key).toString('base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
});
const tokenBody = await tokenResponse.json();
if (!tokenResponse.ok) throw new Error(`Google auth failed: ${JSON.stringify(tokenBody)}`);

const metadataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`, {
  headers: { Authorization: `Bearer ${tokenBody.access_token}` },
});
const metadataBody = await metadataResponse.json();
if (!metadataResponse.ok) throw new Error(`Spreadsheet metadata failed: ${JSON.stringify(metadataBody)}`);
const actualTitles = (metadataBody.sheets || []).map((sheet) => sheet.properties.title);
const titleMap = new Map(actualTitles.map((title) => [title.toLowerCase(), title]));

const readSheet = async (title) => {
  const configured = title === 'Classes' ? process.env.GOOGLE_SHEETS_CLASSES_RANGE : process.env.GOOGLE_SHEETS_RANGE;
  const ranges = (configured || '').split(',').map((value) => value.trim()).filter(Boolean);
  const matching = ranges.find((value) => value.split('!')[0].toLowerCase() === title.toLowerCase());
  const actualTitle = titleMap.get(title.toLowerCase());
  if (!actualTitle) throw new Error(`Google sheet tab not found: ${title}. Available tabs: ${actualTitles.join(', ')}`);
  const range = matching || `'${actualTitle}'!A1:ZZ10000`;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Sheet ${title} failed: ${JSON.stringify(body)}`);
  return body.values || [];
};

const readAll = async (table, select, versionId) => {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from(table).select(select).range(offset, offset + 999);
    if (versionId) query = query.eq('dataset_version_id', versionId);
    const result = await query;
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) return rows;
  }
};

const trimRow = (row) => {
  const values = (row || []).map((value) => String(value ?? '').trim());
  while (values.at(-1) === '') values.pop();
  return values;
};
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(trimRow(value))).digest('hex');
const report = { ok: true, checks: {}, mismatches: [] };

const publishedResult = await supabase.from('fee_dataset_versions').select('id,version_number,status').eq('status', 'published').order('version_number', { ascending: false }).limit(1).maybeSingle();
if (publishedResult.error || !publishedResult.data) throw publishedResult.error || new Error('No published dataset');
const version = publishedResult.data;
report.published_version = version;

const sheetNames = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others', 'Classes'];
const sheets = Object.fromEntries(await Promise.all(sheetNames.map(async (name) => [name, await readSheet(name)])));
const feeRows = await readAll('fee_values', 'source_sheet,source_row,source_values,record_key', version.id);
const classValues = await readAll('fee_class_values', 'country_id,class_number,source_row,source_values,total_fee', version.id);
const classes = await readAll('fee_classes', 'class_number,name,official_fee,attorney_fee,total_fee', version.id);
const countriesResult = await supabase.from('countries').select('id,name');
if (countriesResult.error) throw countriesResult.error;

const bySourceRow = new Map();
for (const row of feeRows) {
  const key = `${row.source_sheet}:${row.source_row}`;
  if (!bySourceRow.has(key)) bySourceRow.set(key, { hash: hash(row.source_values), count: 0, hashes: new Set() });
  const group = bySourceRow.get(key);
  group.count += 1;
  group.hashes.add(hash(row.source_values));
}
let sourceRowHashMismatches = 0;
for (const [key, group] of bySourceRow) {
  const [sheet, rowNumber] = key.split(':');
  const source = sheets[sheet]?.[Number(rowNumber) - 1];
  if (!source || !group.hashes.has(hash(source))) sourceRowHashMismatches += 1;
}

const classRows = sheets.Classes || [];
const classHeader = classRows[0] || [];
const classSubheader = classRows[1] || [];
const classNumbers = [...new Set(classHeader.map((value) => String(value || '').trim().match(/^Class\s+(\d+)$/i)?.[1]).filter(Boolean))].map(Number).filter((value) => value >= 1 && value <= 45);
const classCountryRows = classRows.slice(2).filter((row) => String(row[0] || '').trim());
let expectedClassValues = 0;
for (const row of classCountryRows) {
  for (const classNumber of classNumbers) {
    const indexes = classHeader.map((value, index) => String(value || '').trim().match(new RegExp(`^Class\\s+${classNumber}$`, 'i')) ? index : -1).filter((index) => index >= 0);
    if (indexes.some((index) => String(row[index] || '').trim() !== '')) expectedClassValues += 1;
  }
}
const classValueHashes = new Set(classValues.map((row) => hash(row.source_values)));
const classSourceRows = new Set(classValues.map((row) => row.source_row));
let missingClassSourceRows = 0;
for (const rowNumber of classSourceRows) {
  if (!classValueHashes.has(hash(classRows[rowNumber - 1]))) missingClassSourceRows += 1;
}

const sheetCounts = Object.fromEntries(sheetNames.filter((name) => name !== 'Classes').map((name) => [name, feeRows.filter((row) => row.source_sheet === name).length]));
report.checks.main_fee_rows = { google_data_rows: sheetNames.filter((name) => name !== 'Classes').map((name) => [name, (sheets[name] || []).length - 2]), supabase_fee_records: feeRows.length, records_by_sheet: sheetCounts };
report.checks.main_source_payloads = { source_row_groups: bySourceRow.size, source_row_hash_mismatches: sourceRowHashMismatches };
report.checks.classes = { google_class_numbers: classNumbers.length, supabase_class_definitions: classes.length, google_expected_value_cells: expectedClassValues, supabase_class_values: classValues.length, source_row_payload_mismatches: missingClassSourceRows };
report.checks.countries = { supabase_countries: countriesResult.data.length, google_class_countries: classCountryRows.length, missing_exact_names_are_aliases: classCountryRows.map((row) => String(row[0] || '').trim()).filter((name) => !countriesResult.data.some((country) => country.name === name)).length };

if (classes.length !== classNumbers.length) report.mismatches.push(`Class definition count differs: Google ${classNumbers.length}, Supabase ${classes.length}.`);
if (classValues.length !== expectedClassValues) report.mismatches.push(`Class value count differs: Google ${expectedClassValues}, Supabase ${classValues.length}.`);
if (sourceRowHashMismatches || missingClassSourceRows) report.mismatches.push('Stored source payloads do not exactly mirror Google row payloads.');
report.ok = report.mismatches.length === 0;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 2;

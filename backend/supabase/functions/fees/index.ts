import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' } });
const text = (value: string | undefined) => value?.trim() ?? '';
const amount = (value: string | undefined) => { const parsed = Number((value ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(parsed) ? parsed : 0; };
const procedureKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function googleAccessToken(credentials: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000), encode = (value: string) => btoa(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })); const claim = encode(JSON.stringify({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = Uint8Array.from(atob(credentials.private_key.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s/g, '')), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', pem, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  const signed = `${header}.${claim}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signed }) });
  const body = await response.json().catch(() => ({})); if (!response.ok || typeof body.access_token !== 'string') throw Error('Google authentication failed. Check the service-account secret and Sheets API access.'); return body.access_token as string;
}
async function readSheet() {
  const spreadsheetId = text(Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID')), range = text(Deno.env.get('GOOGLE_SHEETS_RANGE')) || 'Fees!A:E', raw = text(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (!spreadsheetId || !raw) throw Error('Google Sheets is not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_RANGE, and GOOGLE_SERVICE_ACCOUNT_JSON as Edge Function secrets.');
  let credentials: { client_email: string; private_key: string }; try { credentials = JSON.parse(raw); } catch { throw Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
  if (!credentials.client_email || !credentials.private_key) throw Error('Google service-account JSON must include client_email and private_key.');
  const token = await googleAccessToken(credentials), response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({})); if (!response.ok) throw Error(typeof body.error?.message === 'string' ? body.error.message : 'Google Sheets could not be read. Share the sheet with the service-account email and enable the Sheets API.');
  return { values: Array.isArray(body.values) ? body.values as string[][] : [], range, title: spreadsheetId };
}
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors }); 
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, ''), db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } }; if (!user) return json({ error: 'Authentication is required.' }, 401);
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single(); if (profile?.role !== 'administrator') return json({ error: 'Administrator access is required.' }, 403);
  try {
    const [sheet, countries, procedures, services] = await Promise.all([readSheet(), db.from('countries').select('id,name,abbreviation,flag_url').is('deleted_at', null).order('name'), db.from('procedures').select('id,description,service_id').is('deleted_at', null).order('description'), db.from('services').select('id,service').is('deleted_at', null).order('service')]);
    if (countries.error) throw countries.error; if (procedures.error) throw procedures.error; if (services.error) throw services.error;
    const headerRowIndex = sheet.values.findIndex((row: string[]) => row.some((value: string) => text(value).toLowerCase() === 'country'));
    const subheaderRowIndex = headerRowIndex + 1;
    if (headerRowIndex < 0 || !sheet.values[subheaderRowIndex]) throw Error('The sheet must contain a Country header row followed by fee-type headers.');
    const countryMap = new Map((countries.data ?? []).map((item: any) => [item.name.toLowerCase(), item.name])), procedureMap = new Map<string, { description: string; service_id: string }>((procedures.data ?? []).map((item: any) => [procedureKey(item.description), item as { description: string; service_id: string }])), serviceMap = new Map((services.data ?? []).map((item: any) => [item.id, item.service]));
    const regionalEntities = new Map([['aripo', 'ARIPO'], ['oapi', 'OAPI']]);
    const countryNames = [...countryMap.keys()];
    const countryCell = (row: string[]) => { const match = row.find((value) => countryNames.includes(text(value).toLowerCase()) || regionalEntities.has(text(value).toLowerCase())); return match ? countryMap.get(text(match).toLowerCase()) ?? regionalEntities.get(text(match).toLowerCase()) ?? text(match) : ''; };
    const procedureGroups: Array<{ procedure: string; service: string; officialIndex: number; attorneyIndex: number; totalIndex: number }> = [];
    let procedureLabel = '';
    for (let index = 0; index < sheet.values[headerRowIndex].length; index += 1) {
      const header = text(sheet.values[headerRowIndex][index]); if (header) procedureLabel = header;
      const subheader = text(sheet.values[subheaderRowIndex][index]).toLowerCase();
      if (!procedureLabel || !subheader || /country|remove|official|attorney|total/.test(procedureLabel.toLowerCase())) continue;
      const existing = procedureGroups.find((group) => group.procedure.toLowerCase() === procedureLabel.toLowerCase());
      if (existing) { if (/official|official fees|of fees/.test(subheader)) existing.officialIndex = index; if (/attorney|atty/.test(subheader)) existing.attorneyIndex = index; if (/total/.test(subheader)) existing.totalIndex = index; continue; }
      procedureGroups.push({ procedure: procedureLabel, service: '', officialIndex: /official|of fees/.test(subheader) ? index : -1, attorneyIndex: /attorney|atty/.test(subheader) ? index : -1, totalIndex: /total/.test(subheader) ? index : -1 });
    }
    const knownProcedureGroups = procedureGroups.map((group) => { const procedure = procedureMap.get(procedureKey(group.procedure)); return { ...group, procedure: procedure?.description ?? group.procedure, service: procedure ? serviceMap.get(procedure.service_id) ?? '' : '' }; });
    if (!knownProcedureGroups.length) throw Error('No procedure fee groups were found. Each group needs Official Fees, Attorney Fees, and Total subheaders.');
    const rows = sheet.values.slice(subheaderRowIndex + 1).map((row: string[]) => {
      const country = countryCell(row); if (!country) return null;
      const fees = knownProcedureGroups.reduce<Record<string, { government_fee: number; attorney_fee: number; total: number }>>((result, group) => { const government_fee = amount(row[group.officialIndex]); const attorney_fee = amount(row[group.attorneyIndex]); result[group.procedure] = { government_fee, attorney_fee, total: group.totalIndex >= 0 ? amount(row[group.totalIndex]) : government_fee + attorney_fee }; return result; }, {});
      return { country, fees };
    }).filter((row: any): row is { country: string; fees: Record<string, { government_fee: number; attorney_fee: number; total: number }> } => Boolean(row));
    const responseCountries = (countries.data ?? []).map((country: any) => ({ ...country, flag_url: country.flag_url || `https://flagcdn.com/w40/${country.abbreviation.toLowerCase()}.png` }));
    responseCountries.push({ id: 'regional-aripo', name: 'ARIPO', abbreviation: 'AR', flag_url: '/ARIPO' }, { id: 'regional-oapi', name: 'OAPI', abbreviation: 'OA', flag_url: '/OAPI' });
    return json({ rows, procedure_groups: knownProcedureGroups.map(({ procedure, service }) => ({ procedure, service })), countries: responseCountries, procedures: procedures.data ?? [], services: services.data ?? [], spreadsheet: { title: sheet.title, range: sheet.range, updated_at: new Date().toISOString() } });
  } catch (cause) { return json({ error: cause instanceof Error ? cause.message : 'Unable to load fees.' }, 400); }
});
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const validate = (value: unknown) => {
  const data = value as Record<string, unknown>;
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const abbreviation = typeof data?.abbreviation === 'string' ? data.abbreviation.trim().toUpperCase() : '';
  const flag_url = typeof data?.flag_url === 'string' ? data.flag_url.trim() : '';
  if (!name || name.length > 120 || !/^[A-Z]{2,3}$/.test(abbreviation) || !flag_url) throw new Error('Provide a country name, flag, and a 2–3 letter abbreviation.');
  return { name, abbreviation, flag_url };
};
const audit = (admin: ReturnType<typeof createClient>, actorId: string, action: string, country: Record<string, unknown>, beforeData: Record<string, unknown> | null = null) =>
  admin.from('audit_logs').insert({ actor_id: actorId, entity_type: 'country', entity_id: country.id, action, before_data: beforeData, after_data: action === 'delete' ? null : country });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const auth = request.headers.get('Authorization');
  if (!auth) return json({ error: 'Authentication is required.' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = auth.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: 'Invalid session.' }, 401);
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'administrator') return json({ error: 'Administrator access is required.' }, 403);
  const id = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  try {
    if (request.method === 'GET') { const { data, error } = await admin.from('countries').select('*').is('deleted_at', null).order('name'); if (error) throw error; return json(data); }
    if (request.method === 'POST') { const { data, error } = await admin.from('countries').insert(validate(await request.json())).select().single(); if (error) throw error; await audit(admin, user.id, 'create', data); return json(data, 201); }
    if (!id || id === 'countries') return json({ error: 'Country id is required.' }, 400);
    if (request.method === 'PUT') { const { data: before, error: beforeError } = await admin.from('countries').select('*').eq('id', id).is('deleted_at', null).single(); if (beforeError) throw beforeError; const { data, error } = await admin.from('countries').update(validate(await request.json())).eq('id', id).is('deleted_at', null).select().single(); if (error) throw error; await audit(admin, user.id, 'update', data, before); return json(data); }
    if (request.method === 'DELETE') { const { data: before, error: beforeError } = await admin.from('countries').select('*').eq('id', id).is('deleted_at', null).single(); if (beforeError) throw beforeError; const { error } = await admin.from('countries').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null); if (error) throw error; await audit(admin, user.id, 'delete', before, before); return new Response(null, { status: 204, headers: cors }); }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) { const message = cause instanceof Error ? cause.message : 'Request failed.'; const status = /duplicate key/i.test(message) ? 409 : 400; return json({ error: status === 409 ? 'A country with that name or abbreviation already exists.' : message }, status); }
});

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

async function context(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) throw Object.assign(new Error('Authentication is required.'), { status: 401 });
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'administrator') throw Object.assign(new Error('Administrator access is required.'), { status: 403 });
  return db;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  try {
    const db = await context(request);
    const url = new URL(request.url);
    const id = url.pathname.split('/').filter(Boolean).at(-1);
    if (request.method === 'GET') {
      const { data, error } = await db
        .from('vat_rates')
        .select('id,country_id,vat,country:countries(id,name,abbreviation,flag_url)')
        .is('deleted_at', null)
        .order('country(name)');
      if (error) throw error;
      return json({ data: data ?? [] });
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      const countryId = typeof body.country_id === 'string' ? body.country_id : '';
      const vat = Number(body.vat);
      if (!countryId) throw Error('Country is required.');
      if (!Number.isFinite(vat) || vat < 0 || vat > 100) throw Error('VAT must be between 0 and 100.');
      const { data: country } = await db.from('countries').select('id').eq('id', countryId).is('deleted_at', null).maybeSingle();
      if (!country) throw Error('The selected country does not exist.');
      const query = request.method === 'POST'
        ? db.from('vat_rates').upsert({ country_id: countryId, vat, deleted_at: null }, { onConflict: 'country_id' })
        : db.from('vat_rates').update({ country_id: countryId, vat, deleted_at: null }).eq('id', id);
      const { data, error } = await query.select('id,country_id,vat,country:countries(id,name,abbreviation,flag_url)').single();
      if (error) throw error;
      return json(data, request.method === 'POST' ? 201 : 200);
    }
    if (request.method === 'DELETE') {
      if (!id) throw Error('VAT record id is required.');
      const { error } = await db.from('vat_rates').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const error = cause as Error & { status?: number };
    return json({ error: error.message || 'VAT request failed.' }, error.status ?? 400);
  }
});
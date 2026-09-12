import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const colors = new Set(['purple','blue','green','orange','red','teal','yellow','gray','pink','indigo']);
function validate(body: unknown) {
  const value = body as Record<string, unknown>;
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const color_indication = typeof value.color_indication === 'string' ? value.color_indication : '';
  if (description.length < 3 || description.length > 255) throw Error('Description must be between 3 and 255 characters.');
  if (!colors.has(color_indication)) throw Error('Choose a valid color indicator.');
  return { description, color_indication };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'administrator') return json({ error: 'Administrator access is required.' }, 403);
  const last = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  const id = last === 'fee-classifications' ? null : last;
  try {
    if (request.method === 'GET' && id) {
      const { data, error } = await db.from('fee_classifications').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      return data ? json(data) : json({ error: 'Classification not found.' }, 404);
    }
    if (request.method === 'GET') {
      const { data, error } = await db.from('fee_classifications').select('*').is('deleted_at', null).order('description');
      if (error) throw error;
      return json(data);
    }
    if (request.method === 'POST') {
      const { data, error } = await db.from('fee_classifications').insert(validate(await request.json())).select().single();
      if (error) throw error;
      await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'fee_classification', entity_id: data.id, action: 'create', after_data: data });
      return json(data, 201);
    }
    if (!id) return json({ error: 'Classification id is required.' }, 400);
    const { data: before } = await db.from('fee_classifications').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!before) return json({ error: 'Classification not found.' }, 404);
    if (request.method === 'PUT') {
      const { data, error } = await db.from('fee_classifications').update(validate(await request.json())).eq('id', id).select().single();
      if (error) throw error;
      await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'fee_classification', entity_id: id, action: 'update', before_data: before, after_data: data });
      return json(data);
    }
    if (request.method === 'DELETE') {
      const { error } = await db.from('fee_classifications').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'fee_classification', entity_id: id, action: 'delete', before_data: before });
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Request failed.';
    return json({ error: /duplicate/i.test(message) ? 'That description already exists.' : message }, /duplicate/i.test(message) ? 409 : 400);
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2';
import { defaultClientPermissions, permissionPages, permissionActions } from '../_shared/permission-matrix.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const user = token ? (await db.auth.getUser(token)).data.user : null;
    if (!user) return json({ error: 'Authentication is required.' }, 401);
    const { data: profile, error } = await db.from('profiles').select('role,client_id,approval_status,account_status').eq('id', user.id).maybeSingle();
    if (error) throw error;
    const admin = ['admin','administrator'].includes(profile?.role ?? '') && profile.account_status === 'active' && profile.approval_status === 'approved';
    const client = profile?.role === 'client' && profile.account_status === 'active' && profile.approval_status === 'approved' && profile.client_id;
    if (!admin && !client) return json({ error: 'Access is denied.' }, 403);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.searchParams.has('lookup')) {
      if (!client) return json({ error:'Client lookup access is required.' },403);
      const name = url.searchParams.get('lookup');
      if (!['clients','countries','services','procedures'].includes(name ?? '')) return json({ error:'Invalid lookup.' },400);
      if (name === 'clients') {
        const result = await db.from('clients').select('id,assigned_id,company_name,email').eq('id',profile!.client_id).is('deleted_at',null).maybeSingle();
        if (result.error) throw result.error;
        return json({ data:result.data ? [result.data] : [], total:result.data ? 1 : 0 });
      }
      const select = name === 'countries' ? 'id,name,abbreviation,flag_url' : name === 'services' ? 'id,service,color' : 'id,description,detail_text,color_indication,service_id';
      const page = Math.max(1,Number(url.searchParams.get('page')) || 1), size = Math.min(100,Math.max(1,Number(url.searchParams.get('page_size') || url.searchParams.get('perPage')) || 100));
      let query = db.from(name!).select(select,{ count:'exact' }).is('deleted_at',null).order('id');
      if (name !== 'countries') query = query.range((page-1)*size,page*size-1);
      const result = await query;
      if (result.error) throw result.error;
      return json(name === 'countries' ? result.data : { data:result.data ?? [],total:result.count ?? 0,page,page_size:size });
    }
    if (request.method === 'GET' && url.searchParams.get('clients') === 'true') {
      if (!admin) return json({ error: 'Administrator access is required.' }, 403);
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const result = await db.from('profiles').select('id,full_name,company_name,client_id,approval_status,account_status,client:clients(company_name,email)').eq('role','client').not('client_id','is',null).order('id').range(offset,offset+499);
        if (result.error) throw result.error;
        rows.push(...result.data ?? []);
        if ((result.data?.length ?? 0) < 500) break;
      }
      const emails = new Map<string,string>();
      for (let page=1;;page++) {
        const result = await db.auth.admin.listUsers({page,perPage:500});
        if (result.error) throw result.error;
        result.data.users.forEach(account => { if (account.email) emails.set(account.id,account.email); });
        if (result.data.users.length < 500) break;
      }
      return json({ clients: rows.map(row => ({...row,email:emails.get(row.id) ?? ''})), pages: permissionPages });
    }
    const userId = admin ? url.searchParams.get('user_id') : user.id;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'Select a client account.' }, 400);
    if (admin) {
      const target = await db.from('profiles').select('id').eq('id',userId).eq('role','client').not('client_id','is',null).maybeSingle();
      if (target.error) throw target.error;
      if (!target.data) return json({ error: 'Client account not found.' }, 404);
    }
    if (request.method === 'GET') {
      const result = await db.from('client_permission_sets').select('permissions,revision,updated_at').eq('user_id',userId).maybeSingle();
      if (result.error) throw result.error;
      return json(result.data ?? { permissions: defaultClientPermissions(), revision: 0, updated_at: null });
    }
    if (request.method === 'PUT') {
      if (!admin) return json({ error: 'Only administrators can assign permissions.' }, 403);
      const body = await request.json();
      const value = body.permissions;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== permissionPages.length || !Number.isSafeInteger(body.revision) || body.revision < 0) return json({ error: 'Invalid permission matrix.' }, 400);
      for (const page of permissionPages) {
        const row = value[page.key];
        if (!row || typeof row !== 'object' || Object.keys(row).length !== permissionActions.length) return json({ error: 'Incomplete permission matrix.' }, 400);
        for (const action of permissionActions) {
          if (typeof row[action] !== 'boolean' || (row[action] && !(page.actions as readonly string[]).includes(action)) || (action !== 'view' && row[action] && !row.view)) return json({ error: 'Invalid permission selection.' }, 400);
        }
        if (row.update && !row.edit) return json({ error: 'Update requires Edit permission.' }, 400);
      }
      const result = await db.rpc('save_client_permissions',{ p_actor_id:user.id, p_user_id:userId, p_permissions:value, p_revision:body.revision });
      if (result.error) return json({ error: result.error.message }, result.error.code === '40001' ? 409 : result.error.code === '42501' ? 403 : 400);
      return json({ permissions:value, revision:result.data, updated_at:new Date().toISOString() });
    }
    return json({ error:'Method not allowed.' },405);
  } catch (cause) { return json({ error: cause instanceof Error ? cause.message : 'Permission service failed.' },503); }
});
import { createClient } from 'npm:@supabase/supabase-js@2';
import { defaultClientPermissions, type PermissionAction, type PermissionPage } from './permission-matrix.ts';
export async function enforceClientPermission(db: ReturnType<typeof createClient>, userId: string, page: PermissionPage, action: PermissionAction) {
  const { data: profile, error } = await db.from('profiles').select('role,client_id,approval_status,account_status').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (['admin','administrator'].includes(profile?.role ?? '')) { if (profile?.account_status === 'inactive' || (profile?.approval_status && profile.approval_status !== 'approved')) throw Object.assign(Error('Administrator access is denied.'),{ status:403 }); return; }
  if (profile?.role !== 'client' || profile.approval_status !== 'approved' || profile.account_status !== 'active' || !profile.client_id) throw Object.assign(Error('An approved, active client account is required.'), { status: 403 });
  const result = await db.from('client_permission_sets').select('permissions').eq('user_id', userId).maybeSingle();
  if (result.error) throw Object.assign(Error('Client permissions could not be verified.'), { status: 503 });
  const permissions = result.data?.permissions ?? defaultClientPermissions();
  if (!permissions[page]?.view || !permissions[page]?.[action] || (action === 'update' && !permissions[page]?.edit)) throw Object.assign(Error(`You do not have ${action} permission for this page.`), { status: 403 });
}
export function actionForRequest(request: Request): PermissionAction {
  if (request.method === 'POST' && ['upload','upload-image'].includes(new URL(request.url).pathname.split('/').at(-1) ?? '') && new URL(request.url).searchParams.get('permission_action') === 'update') return 'update';
  return request.method === 'GET' ? 'view' : request.method === 'DELETE' ? 'delete' : ['PUT', 'PATCH'].includes(request.method) ? 'update' : 'add';
}
export async function clientPermissionResponse(db: ReturnType<typeof createClient>, userId: string, page: PermissionPage, action: PermissionAction, cors: Record<string, string>) {
  try { await enforceClientPermission(db, userId, page, action); return null; }
  catch (cause) { const error = cause as Error & { status?: number }; return new Response(JSON.stringify({ error: error.message }), { status: error.status ?? 503, headers: { ...cors, 'Content-Type': 'application/json' } }); }
}
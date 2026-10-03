'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { PermissionPage } from './client-permissions';
import { useClientPermissions } from '../components/ClientPermissions';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from './supabase/browser';
export function useAdministratorAccess(clientDestination = '/client-dashboard', clientPage?: PermissionPage) {
 const router = useRouter(); const pathname = usePathname(); const { canManage, can } = useClientPermissions(clientPage); const clientAllowed = clientPage ? can('view') : canManage;
 const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
 const [accessError, setAccessError] = useState('');
 const [administrator, setAdministrator] = useState({ name: 'Administrator', email: '', initials: 'AD' });
 useEffect(() => {
  let active = true;
  async function verify() {
   const db = getSupabaseBrowserClient();
   if (!db) throw Error('Supabase is not configured for this environment.');
   const { data: { user }, error } = await db.auth.getUser();
   if (error) throw error;
   if (!active) return;
   if (!user) { router.replace('/login'); return; }
   const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
   if (profileError) throw profileError;
   if (!active) return;
   const role = String(profile?.role ?? '').trim().toLowerCase();
   if (role === 'client' && pathname.startsWith('/client-dashboard/') && clientAllowed) { setAccess('allowed'); return; }
   if (!['admin', 'administrator'].includes(role)) { setAccess('denied'); router.replace(role === 'client' ? clientDestination : '/login'); return; }
   const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Administrator');
   setAdministrator({ name, email: user.email ?? '', initials: name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() });
   setAccess('allowed');
  }
  void verify().catch(cause => { if (active) { setAccessError(cause instanceof Error ? cause.message : 'Unable to verify administrator access.'); setAccess('denied'); } });
  return () => { active = false; };
 }, [router, clientDestination, pathname, clientAllowed]);
 return { access, accessError, administrator };
}
export async function requestDocument<T>(service: string, path = '', options: RequestInit = {}): Promise<T> {
 if (typeof window !== 'undefined' && window.location.pathname.startsWith('/client-dashboard/') && service === 'poa') path += (path.includes('?') ? '&' : '?') + 'manage=true';
 const response = await fetchSupabaseFunction(service + path, { ...options, timeoutMs: 120000 });
 if (response.status === 204) return null as T;
 const body = await response.json().catch(() => null);
 if (!response.ok) {
  if (typeof body?.error === 'string') throw Error(body.error);
  if (response.status === 401) throw Error('Sign in with an administrator account to manage documents.');
  if (response.status === 403) throw Error('Only administrators can manage documents.');
  if (response.status === 404) throw Error('The document service or document was not found. Check the function deployment.');
  throw Error('The document request failed (HTTP ' + response.status + ').');
 }
 if (!body) throw Error('The document service returned an empty response.');
 return body as T;
}
export function formatDocumentDate(value: string | null) {
 const date = value ? new Date(value) : null;
 return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date) : '—';
}
export function downloadDocumentUrl(url: string) {
 const link = document.createElement('a'); link.href = url; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove();
}

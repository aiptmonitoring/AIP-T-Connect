'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchSupabaseFunction } from '../lib/supabase/browser';
import { pageForClientPath, permissionPages, type ClientPermissions, type PermissionAction, type PermissionPage } from '../lib/client-permissions';
const Context = createContext<ClientPermissions | null>(null);
export function useClientPermissions(page?: PermissionPage) {
  const value = useContext(Context); const pathname = usePathname(); const key = page ?? pageForClientPath(pathname);
  return { permissions:value, can:(action:PermissionAction) => Boolean(value?.[key]?.view && value?.[key]?.[action] && (action !== 'update' || value?.[key]?.edit)), canManage:Boolean(value?.[key]?.view && ['add','edit','delete'].some(action => value?.[key]?.[action as PermissionAction])) };
}
export default function ClientPermissionProvider({ children }: { children:ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [permissions,setPermissions] = useState<ClientPermissions | null>(null), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try { const response = await fetchSupabaseFunction('client-permissions', { signal:controller.signal }); const body = await response.json(); if (response.status === 401) { router.replace('/login'); return; } if (!response.ok) throw Error(body.error || 'Unable to verify permissions.'); if (!controller.signal.aborted) { setPermissions(body.permissions); setError(''); } }
      catch(cause) { if (!controller.signal.aborted) { setPermissions(null); setError(cause instanceof Error ? cause.message : 'Unable to verify permissions.'); } }
    };
    void refresh(); window.addEventListener('focus',refresh); const timer = window.setInterval(refresh,30000);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus',refresh); };
  },[pathname,retry,router]);
  if (!permissions) return <section className="client-page" aria-busy={!error}><p role={error ? 'alert' : 'status'}>{error || 'Checking client permissions...'}</p>{error && <button onClick={() => setRetry(value => value+1)}>Retry</button>}</section>;
  const page = pageForClientPath(pathname);
  const blocked = permissionPages.filter(item => !permissions[item.key]?.view).map(item => `.client-app-shell a[href="/client-dashboard${item.key === 'dashboard' ? '' : '/' + item.key}"]`);
  if (!permissions.fees?.view) blocked.push('.client-app-shell a[href="/client-dashboard/schedule-of-fees"]');
  const deniedActions = ['add','edit','update','delete'].filter(action => !permissions[page]?.[action as PermissionAction]).map(action => `.client-app-shell [data-action="${action}"]:not([data-local-action])`);
  const selectors = [...blocked,...deniedActions,'.client-app-shell [data-action="approve"]','.client-app-shell [data-action="restore"]','.client-app-shell [data-admin-only]','.client-app-shell .countries-topbar','.client-app-shell .clients-topbar'];
  return <Context.Provider value={permissions}><style>{selectors.join(',')+'{display:none!important}'}</style>{children}</Context.Provider>;
}
export function ClientPageAccess({ children }: { children:ReactNode }) {
  const { can } = useClientPermissions();
  return can('view') ? <>{children}</> : <section className="client-page"><p className="client-error" role="alert">You do not have permission to view this page. Contact your administrator.</p></section>;
}
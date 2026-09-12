import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null | undefined;
const FEE_SYNC_ACTIVITY_KEY = 'aipt-fee-sync-activity';

export function setFeeSyncActivity(active: boolean) {
  if (typeof window === 'undefined') return;
  if (active) window.localStorage.setItem(FEE_SYNC_ACTIVITY_KEY, String(Date.now()));
  else window.localStorage.removeItem(FEE_SYNC_ACTIVITY_KEY);
  window.dispatchEvent(new CustomEvent('aipt-fee-sync-activity', { detail: active }));
}

export function isFeeSyncActive() {
  if (typeof window === 'undefined') return false;
  const startedAt = Number(window.localStorage.getItem(FEE_SYNC_ACTIVITY_KEY) || 0);
  return startedAt > 0 && Date.now() - startedAt < 10 * 60 * 1000;
}

export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  browserClient = url && key ? createClient(url, key) : null;
  return browserClient;
}

export function getSupabaseFunctionUrl(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!url) throw Error('Supabase URL is not configured. Set NEXT_PUBLIC_SUPABASE_URL in frontend/.env.local.');
  return `${url}/functions/v1/${path.replace(/^\//, '')}`;
}

export async function getActiveSession() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('Supabase session lookup failed:', error.message);
    return null;
  }

  if (!session?.access_token) return null;
  return session;
}

export async function fetchSupabaseFunction(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  const headers = new Headers(init.headers);

  const supabase = getSupabaseBrowserClient();
  if (supabase && !headers.has('Authorization')) {
    const session = await getActiveSession();
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
  }

  // Edge functions are authenticated with the current user JWT in Authorization.
  // Do not inject the anon/publishable key here; that creates an auth mismatch and
  // triggers incorrect CORS preflight behavior for browser calls to Supabase functions.
  try {
    let response = await fetch(getSupabaseFunctionUrl(path), { ...init, headers, signal: init.signal ?? controller.signal, cache: 'no-store' });
    if (response.status === 401 && supabase) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        headers.set('Authorization', `Bearer ${data.session.access_token}`);
        response = await fetch(getSupabaseFunctionUrl(path), { ...init, headers, signal: init.signal ?? controller.signal, cache: 'no-store' });
      }
    }
    // A 403 is a valid authorization decision (for example, a client opening
    // an administrator-only endpoint), not evidence that the auth session is expired.
    if (response.status === 401) {
      const body = await response.clone().json().catch(() => ({}));
      const message = typeof body?.error === 'string' ? body.error : 'Your session is no longer valid.';
      if (message.toLowerCase().includes('authentication') || message.toLowerCase().includes('administrator access') || message.toLowerCase().includes('session')) {
        if (supabase) {
          await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
        }
        window.sessionStorage.clear();
        window.localStorage.clear();
      }
    }
    return response;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw Error('The project service took too long to respond. Check the Supabase function deployment.');
    throw Error('Unable to reach the project service. Check your network connection and Supabase URL.');
  } finally {
    window.clearTimeout(timeout);
  }
}

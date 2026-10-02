'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';
import ClientDashboardIcon from './ClientDashboardIcon';
import TablePagination from './TablePagination';

export type ReferenceCountry = { id?: string; name: string; abbreviation?: string; flag_url?: string };
export async function clientReferenceRequest<T>(path: string): Promise<T> {
  const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
  if (!session) throw Error('Please sign in.');
  const response = await fetchSupabaseFunction(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || 'Unable to load client data.');
  return body as T;
}
export function useClientReferenceData<T>(path: string) {
  const pending = useRef<{ path: string; promise: Promise<T> } | null>(null);
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (!pending.current || pending.current.path !== path) pending.current = { path, promise: clientReferenceRequest<T>(path) };
    pending.current.promise.then(value => { if (active) setData(value); }).catch(cause => {
      pending.current = null;
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load client data.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, attempt]);
  return { data, error, loading, retry: () => { pending.current = null; setAttempt(value => value + 1); } };
}
export function ReferenceTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon: 'requirements' | 'notifications' }) {
  return <div className="reference-title"><h1><ClientDashboardIcon name={icon} />{title}</h1>{subtitle && <p>{subtitle}</p>}</div>;
}
export function ReferenceCountryBadge({ country }: { country: ReferenceCountry }) {
  const [failed, setFailed] = useState(false);
  const flag = /^https?:\/\//i.test(country.flag_url || '') ? country.flag_url : '';
  return <span className="reference-country">{flag && !failed ? <img src={flag} alt="" onError={() => setFailed(true)} /> : country.abbreviation && <span className="reference-country-code" aria-hidden="true">{country.abbreviation}</span>}<span>{country.name}</span></span>;
}
export function ReferenceSearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg>; }
export function ReferencePagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  return <TablePagination page={page} pageSize={10} total={total} onPageChange={onChange} onPageSizeChange={() => {}} />;
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';
import TablePagination from '../../../src/components/TablePagination';
type Fee = { id: string; country_id: string; category: string; procedure_name: string; official_fee: number | null; attorney_fee: number | null; total_fee: number | null; currency: string; available: boolean; issue?: string };
type Lookup = { countries: { id: string; name: string }[]; fees: Fee[] };
export default function ClientFeesPage() {
  const [data, setData] = useState<Lookup>({ countries: [], fees: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  useEffect(() => { let active = true; void (async () => {
    try {
      const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
      if (!session) throw Error('Please sign in to view fees.');
      const response = await fetchSupabaseFunction('quotations?lookup=true', { headers: { Authorization: 'Bearer ' + session.access_token } });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Unable to load fees.');
      if (active) setData({ countries: body.countries ?? [], fees: body.fees ?? [] });
    } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load fees.'); }
    finally { if (active) setLoading(false); }
  })(); return () => { active = false; }; }, []);
  const country = (id: string) => data.countries.find(item => item.id === id)?.name || '-';
  const rows = useMemo(() => data.fees.filter(item => [data.countries.find(c => c.id === item.country_id)?.name, item.category, item.procedure_name].join(' ').toLowerCase().includes(search.trim().toLowerCase())), [data, search]);
  const amount = (value: number | null) => value === null || value === undefined || !Number.isFinite(Number(value)) ? 'Not available' : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className="client-page"><div className="client-heading"><div><h1>Fees</h1><p>Published service fees. Create a quotation for class pricing and your final total.</p></div><Link className="client-primary" href="/client-dashboard/quotations">Quotations</Link></div>
    {error && <p className="client-error" role="alert">{error}</p>}
    <div className="client-toolbar"><label><input aria-label="Search fees" placeholder="Search country, service or procedure" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label></div>
    <section className="client-panel"><div className="client-table-wrap"><table className="client-table"><thead><tr><th>Country</th><th>Service</th><th>Procedure</th><th>Currency</th><th>Official fee</th><th>Attorney fee</th><th>Total fee</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={7}>Loading fees...</td></tr> : rows.length ? rows.slice((page - 1) * pageSize, page * pageSize).map(item => <tr key={item.id}><td>{country(item.country_id)}</td><td>{item.category}</td><td>{item.procedure_name}</td><td>{item.currency || '-'}</td><td>{amount(item.official_fee)}</td><td>{amount(item.attorney_fee)}</td><td>{item.available ? amount(item.total_fee) : <span title={item.issue}>Not available</span>}</td></tr>) : <tr><td colSpan={7}>No published fees match your search.</td></tr>}
    </tbody></table></div><TablePagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} loading={loading} /></section>
  </section>;
}

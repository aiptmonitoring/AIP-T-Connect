'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import { useCallback, useEffect, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

type Invoice = { id: string; reference_no: string; invoice_date: string; subject: string; grand_total: number; currency: string; client_matter_ref?: string; status: string };

async function request<T>(path: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw Error('Supabase is not configured.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw Error('Please sign in.');
  const response = await fetchSupabaseFunction(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.error || 'Unable to load invoices.');
  return body as T;
}

const dateText = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
const money = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);

export default function ClientInvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const body = await request<{ data: Invoice[] }>('quotations?status=Approved&page=1&page_size=100'); setItems(body.data ?? []); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load invoices.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="client-page client-invoices-page">
    <div className="client-heading"><div><p className="client-kicker">BILLING</p><h1>Invoices</h1><p>Approved invoices shared with your account.</p></div><button className="client-secondary" type="button" onClick={() => void load()} disabled={loading} data-action="refresh" title="Refresh"><ActionIcon name="refresh" /><span className="aipt-action-label">Refresh</span></button></div>
    {error && <p className="client-error">{error}</p>}
    <section className="client-panel"><div className="panel-title"><h2>My invoices</h2><span>{items.length} approved</span></div><div className="client-table-wrap"><table className="client-table"><thead><tr><th>Invoice</th><th>Date</th><th>Matter</th><th>Subject</th><th>Amount due</th><th>Document</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={6} className="client-empty">Loading invoices...</td></tr> : items.length ? items.map((item) => <tr key={item.id}><td><strong>{item.reference_no}</strong></td><td>{dateText(item.invoice_date)}</td><td>{item.client_matter_ref || '-'}</td><td>{item.subject || '-'}</td><td><strong>{item.currency} {money(item.grand_total)}</strong></td><td><a className="client-secondary invoice-download-link" href={`/invoice/${item.id}`} target="_blank" rel="noreferrer" data-action="pdf" data-icon-only="true" title="PDF"><ActionIcon name="pdf" /><span className="aipt-action-label">PDF</span></a></td></tr>) : <tr><td colSpan={6} className="client-empty">No approved invoices are available.</td></tr>}
    </tbody></table></div></section>
  </section>;
}
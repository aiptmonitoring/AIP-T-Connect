'use client';
import ActionIcon from '../../src/components/ActionIcon';


import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';
import '../countries.css';
import './vat.css';

type Country = { id: string; name: string; abbreviation: string; flag_url?: string };
type VatRate = { id: string; country_id: string; vat: number; country?: Country };
type Modal = 'add' | 'edit' | 'delete' | null;

export default function VatPage() {
  const [rows, setRows] = useState<VatRate[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selected, setSelected] = useState<VatRate | null>(null);
  const [countryId, setCountryId] = useState('');
  const [vat, setVat] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async <T,>(path: string, options: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured for this environment.');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetchSupabaseFunction(path, {
      ...options,
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json', ...options.headers },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body?.error ?? 'Unable to complete the request.');
    return body as T;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vatResponse, countryResponse] = await Promise.all([
        request<{ data: VatRate[] }>('vat'),
        request<Country[]>('countries'),
      ]);
      setRows(vatResponse.data ?? []);
      setCountries(countryResponse ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load VAT data.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => !term || row.country?.name.toLowerCase().includes(term));
  }, [query, rows]);
  const assignedCountryIds = new Set(rows.filter((row) => row.id !== selected?.id).map((row) => row.country_id));

  const openAdd = () => { setSelected(null); setCountryId(''); setVat(''); setError(''); setModal('add'); };
  const openEdit = (row: VatRate) => { setSelected(row); setCountryId(row.country_id); setVat(String(row.vat)); setError(''); setModal('edit'); };
  const close = () => { if (!submitting) { setModal(null); setError(''); } };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await request(selected ? `vat/${selected.id}` : 'vat', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({ country_id: countryId, vat: Number(vat) }),
      });
      setModal(null);
      setNotice(selected ? 'VAT updated successfully.' : 'VAT added successfully.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save VAT.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await request(`vat/${selected.id}`, { method: 'DELETE' });
      setModal(null);
      setNotice('VAT deleted successfully.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete VAT.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="countries-page vat-page">
    <section className="countries-content">
      <header className="countries-topbar"><p>Home <i>/</i> <b>VAT</b></p><div className="country-user"><span>MS</span><p><b>Mohammad Saleh</b><small>Administrator</small></p></div></header>
      <div className="countries-heading"><div><h1>VAT</h1><p>Manage VAT rates by country.</p></div><button className="country-add" type="button" onClick={openAdd} data-action="add" title="Add VAT"><ActionIcon name="add" /><span className="aipt-action-label">Add VAT</span></button></div>
      {notice && <div className="country-toast">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      {error && !modal && <p className="country-page-error">{error}</p>}
      <section className="country-table-card"><header><h2>VAT Table Data</h2><label className="country-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search countries..." /></label></header>
        <div className="country-table-wrap"><table><thead><tr><th>Country</th><th>VAT</th><th>Actions</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={3} className="country-state">Loading VAT data...</td></tr> : visible.length ? visible.map((row) => <tr key={row.id}><td><b>{row.country?.name ?? 'Unknown'}</b></td><td>{Number(row.vat).toFixed(2)}%</td><td className="country-actions"><button type="button" onClick={() => openEdit(row)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button type="button" onClick={() => { setSelected(row); setError(''); setModal('delete'); }} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></td></tr>) : <tr><td colSpan={3} className="country-state">No VAT rates configured.</td></tr>}
        </tbody></table></div>
      </section>
      {modal === 'add' || modal === 'edit' ? <div className="country-modal-backdrop"><section className="country-modal"><header><h2>{modal === 'edit' ? 'Edit VAT' : 'Add VAT'}</h2><button type="button" onClick={close}>×</button></header><form onSubmit={save}><label className="country-label">Country <em>*</em><select value={countryId} onChange={(event) => setCountryId(event.target.value)} disabled={modal === 'edit'} required><option value="">Select country</option>{countries.filter((country) => !assignedCountryIds.has(country.id)).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label><label className="country-label">VAT <em>*</em><input type="number" min="0" max="100" step="0.01" value={vat} onChange={(event) => setVat(event.target.value)} placeholder="e.g. 15" required /></label>{error && <p className="country-page-error">{error}</p>}<footer><button type="button" onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="primary" type="submit" disabled={submitting} data-action="update" title="Save VAT"><ActionIcon name="update" /><span className="aipt-action-label">{submitting ? 'Saving...' : 'Save VAT'}</span></button></footer></form></section></div> : null}
      {modal === 'delete' && <div className="country-modal-backdrop"><section className="country-modal"><header><h2>Delete VAT</h2><button type="button" onClick={close}>×</button></header><p>Delete the VAT rate for {selected?.country?.name ?? 'this country'}?</p><footer><button type="button" onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="danger" type="button" onClick={() => void remove()} disabled={submitting} data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></footer></section></div>}
    </section>
  </main>;
}

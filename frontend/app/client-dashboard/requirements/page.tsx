'use client';
import { useMemo, useRef, useState } from 'react';
import { toPlainText } from '../../../src/lib/plain-text';
import ActionIcon from '../../../src/components/ActionIcon';
import { ReferenceCountryBadge, ReferenceCountry, ReferencePagination, ReferenceSearchIcon, ReferenceTitle, useClientReferenceData } from '../../../src/components/ClientReference';
import '../../client-reference.css';

type Requirement = { id: string; country_id: string; service_id: string | null; procedure_id: string | null; description: string; country?: ReferenceCountry; service?: { id: string; service: string } | null; procedure?: { id: string; description: string; service_id: string } };
type Group = { id: string; service: string; procedure: string; description: string; countries: ReferenceCountry[] };
export default function ClientRequirementsPage() {
  const { data, loading, error, retry } = useClientReferenceData<{ data: Requirement[] }>('requirements?catalog=true');
  const [service, setService] = useState(''), [countries, setCountries] = useState<string[]>([]), [procedure, setProcedure] = useState('');
  const [filters, setFilters] = useState({ service: '', countries: [] as string[], procedure: '' }), [page, setPage] = useState(1), [exportError, setExportError] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const rows = data?.data || [];
  const options = useMemo(() => ({
    services: [...new Map(rows.filter(r => r.service).map(r => [r.service!.id, r.service!])).values()].sort((a,b) => a.service.localeCompare(b.service)),
    countries: [...new Map(rows.filter(r => r.country).map(r => [r.country_id, r.country!])).entries()].sort((a,b) => a[1].name.localeCompare(b[1].name)),
    procedures: [...new Map(rows.filter(r => r.procedure && (!service || r.service_id === service)).map(r => [r.procedure!.id, r.procedure!])).values()].sort((a,b) => a.description.localeCompare(b.description)),
  }), [rows, service]);
  const groups = useMemo(() => {
    const result = new Map<string, Group>();
    rows.filter(r => (!filters.service || r.service_id === filters.service) && (!filters.countries.length || filters.countries.includes(r.country_id)) && (!filters.procedure || r.procedure_id === filters.procedure)).forEach(r => {
      const description = toPlainText(r.description), key = JSON.stringify([r.service_id, r.procedure_id, description]);
      const group = result.get(key) || { id: r.id, service: r.service?.service || 'Unspecified service', procedure: r.procedure?.description || 'Unspecified procedure', description, countries: [] };
      if (r.country && !group.countries.some(c => (c.id || c.name) === (r.country!.id || r.country!.name))) group.countries.push(r.country);
      result.set(key, group);
    });
    return [...result.values()];
  }, [rows, filters]);
  const exportPdf = async (items: Group[]) => {
    try { setExportError(''); const { exportTable } = await import('../../../src/lib/table-files'); await exportTable('Requirements', [{ key: 'service', label: 'Service / Project' }, { key: 'country', label: 'Country' }, { key: 'procedure', label: 'Procedure' }, { key: 'description', label: 'Description' }], items.map(r => ({ ...r, country: r.countries.map(c => c.name).join(', ') })), 'pdf'); }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Unable to export requirements.'); }
  };
  return <section className="client-reference-page reference-requirements">
    <ReferenceTitle title="Requirements" icon="requirements" />
    <form className="reference-filter" onSubmit={e => { e.preventDefault(); menu.current?.removeAttribute('open'); setFilters({ service, countries, procedure }); setPage(1); }}>
      <label>Services / Projects *<select aria-label="Services / Projects" value={service} disabled={loading} onChange={e => { setService(e.target.value); setProcedure(''); }}><option value="">Select Services / Project</option>{options.services.map(s => <option key={s.id} value={s.id}>{s.service}</option>)}</select></label>
      <div className="reference-country-filter"><span>Country * <small>(multiple selection)</small></span><details ref={menu} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.removeAttribute('open'); }} onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.removeAttribute('open'); }}><summary>{countries.length ? countries.map(id => <span className="reference-selected-country" key={id}>{options.countries.find(c => c[0] === id)?.[1].name}<button type="button" aria-label={'Remove ' + options.countries.find(c => c[0] === id)?.[1].name} onClick={e => { e.preventDefault(); setCountries(current => current.filter(c => c !== id)); }}>×</button></span>) : 'Select Country'}</summary><div className="reference-country-options">{options.countries.map(([id, country]) => <label key={id}><input type="checkbox" checked={countries.includes(id)} onChange={e => { const checked = e.target.checked; setCountries(current => checked ? [...current, id] : current.filter(c => c !== id)); menu.current?.removeAttribute('open'); }} />{country.name}</label>)}</div></details></div>
      <label>Procedure *<select aria-label="Procedure" value={procedure} disabled={loading} onChange={e => setProcedure(e.target.value)}><option value="">Select Procedure</option>{options.procedures.map(p => <option key={p.id} value={p.id}>{p.description}</option>)}</select></label>
      <button className="reference-primary" type="submit" disabled={loading}><ReferenceSearchIcon />Search</button>
    </form>
    {(error || exportError) && <p className="client-error" role="alert">{error || exportError}{error && <button onClick={retry}>Retry</button>}</p>}
    <div className="reference-table-card"><div className="reference-table-toolbar"><button className="reference-primary" disabled={loading || !groups.length} onClick={() => void exportPdf(groups)}><ActionIcon name="download" />Download to PDF (All)</button></div>
      <div className="reference-table-scroll"><table className="reference-table"><thead><tr><th>Service / Project</th><th>Country</th><th>Procedure</th><th>Description</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={5}>Loading requirements...</td></tr> : groups.length ? groups.slice((page-1)*10,page*10).map(r => <tr key={r.id}><td><strong>{r.service}</strong></td><td>{r.countries.map(c => <ReferenceCountryBadge key={c.id || c.name} country={c} />)}</td><td><strong>{r.procedure}</strong></td><td className="reference-description">{r.description}</td><td><button className="reference-icon-button" aria-label={'Download requirements for ' + r.countries.map(c => c.name).join(', ')} onClick={() => void exportPdf([r])}><ActionIcon name="download" /></button></td></tr>) : <tr><td colSpan={5}>No requirements match your selection.</td></tr>}
      </tbody></table></div><ReferencePagination page={page} total={groups.length} onChange={setPage} />
    </div>
  </section>;
}

'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdministratorAccess, requestDocument, formatDocumentDate as formatDate, downloadDocumentUrl as downloadUrl } from '../../src/lib/admin-documents';
import ActionIcon from '../../src/components/ActionIcon';
import '../client-dashboard/poa/poa.css';
import './admin-poa.css';

type Country = { id: string; name: string; abbreviation: string; flag_url: string | null };
type POADocument = { id: string; key: string; countries: Country[]; document_name: string; last_modified: string | null };
type POAResponse = { data: POADocument[]; countries: Country[] };

const PAGE_SIZE = 12;

const request = <T,>(path = '', options: RequestInit = {}) => requestDocument<T>('poa', path, options);

export default function AdminPoaPage() {
  const { access, accessError } = useAdministratorAccess('/client-dashboard/poa');
  const [documents, setDocuments] = useState<POADocument[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countrySelection, setCountrySelection] = useState<string[]>([]);
  const [appliedCountrySelection, setAppliedCountrySelection] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<POADocument | null>(null);
  const [uploadCountryIds, setUploadCountryIds] = useState<string[]>([]);
  const [documentName, setDocumentName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<POADocument | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const operation = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = await request<POAResponse>();
      if (!Array.isArray(body.data)) throw Error('The POA service returned invalid data.');
      setDocuments(body.data);
      if (!Array.isArray(body.countries)) throw Error('The POA service returned invalid countries.');
      setCountries(body.countries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load POA documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access === 'allowed') void load();
  }, [access, load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents
      .filter(item => !appliedCountrySelection.length || item.countries.some(country => country.id === 'shared-all' || appliedCountrySelection.includes(country.id)))
      .filter(item => !term || `${item.countries.map(country => country.name).join(' ')} ${item.document_name} ${item.last_modified ?? ''}`.toLowerCase().includes(term))
      .sort((first, second) => first.document_name.localeCompare(second.document_name));
  }, [documents, appliedCountrySelection, search]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const applyCountryFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedCountrySelection(countrySelection);
    setPage(1);
  };

  const toggleCountry = (id: string) => {
    setCountrySelection(current => current.includes(id) ? current.filter(countryId => countryId !== id) : [...current, id]);
  };

  const openCreate = () => {
    if (operation.current) return;
    setCountrySearch('');
    setSelected(null);
    setUploadCountryIds([]);
    setDocumentName('');
    setFile(null);
    setError('');
    setNotice('');
    setModal(true);
  };

  const openEdit = (item: POADocument) => {
    if (operation.current) return;
    setCountrySearch('');
    setSelected(item);
    setUploadCountryIds(item.countries.some(country => country.id === 'shared-all')
      ? ['shared']
      : item.countries.filter(country => country.id !== 'unassigned').map(country => country.id));
    setDocumentName(item.document_name);
    setFile(null);
    setError('');
    setNotice('');
    setModal(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operation.current) return;
    if (!uploadCountryIds.length) return setError('Select one or more countries, or All Countries.');
    if (!documentName.trim()) return setError('Enter a document name.');
    if (!selected && !file) return setError('Choose a POA document to upload.');
    if (file && (file.size < 1 || file.size > 10 * 1024 * 1024 || !['pdf', 'doc', 'docx'].includes(file.name.split('.').pop()?.toLowerCase() ?? ''))) return setError('Upload a PDF, DOC, or DOCX document up to 10MB.');
    const form = new FormData();
    uploadCountryIds.forEach(id => form.append('country_ids', id));
    form.set('document_name', documentName.trim());
    if (selected) form.set('key', selected.key);
    if (file) form.set('file', file);
    operation.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await request<{ warning?: string }>(selected
        ? `?${selected.id.startsWith('legacy:') ? `key=${encodeURIComponent(selected.key)}` : `id=${encodeURIComponent(selected.id)}`}`
        : '', { method: selected ? 'PUT' : 'POST', body: form });
      setModal(false);
      setNotice(saved?.warning || (selected ? 'POA document updated.' : 'POA document uploaded.'));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save POA document.');
    } finally {
      operation.current = false;
      setSaving(false);
    }
  };

  const toggleUploadCountry = (id: string) => {
    setUploadCountryIds(current => {
      if (id === 'shared') return current.includes('shared') ? [] : ['shared'];
      const selectedCountries = current.filter(countryId => countryId !== 'shared');
      return selectedCountries.includes(id)
        ? selectedCountries.filter(countryId => countryId !== id)
        : [...selectedCountries, id];
    });
  };

  const remove = async () => {
    if (!deleteTarget || operation.current) return;
    const item = deleteTarget;
    operation.current = true;
    setBusyKey(item.id);
    setDeleteError('');
    setError('');
    setNotice('');
    try {
      await request(`?${item.id.startsWith('legacy:') ? `key=${encodeURIComponent(item.key)}` : `id=${encodeURIComponent(item.id)}`}`, { method: 'DELETE' });
      setDocuments(current => current.filter(document => document.id !== item.id && document.key !== item.key));
      setDeleteTarget(null);
      setNotice('POA document deleted.');
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Unable to delete POA document.');
    } finally {
      operation.current = false;
      setBusyKey('');
    }
  };

  const download = async (item: POADocument) => {
    if (operation.current) return;
    operation.current = true;
    setBusyKey(item.id);
    setError('');
    try {
      const result = await request<{ url: string }>(`?${item.id.startsWith('legacy:') ? `key=${encodeURIComponent(item.key)}` : `id=${encodeURIComponent(item.id)}`}`);
      if (!result?.url) throw Error('The POA service returned an invalid download link.');
      downloadUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download this POA document.');
    } finally {
      operation.current = false;
      setBusyKey('');
    }
  };

  if (access !== 'allowed') {
    return accessError
      ? <main className="poa-page admin-poa-page"><p className="poa-error" role="alert">{accessError}</p></main>
      : <main className="poa-page admin-poa-page" aria-busy="true"><p>Verifying administrator access…</p></main>;
  }

  return <main className="poa-page admin-poa-page">

    <h1 className="admin-poa-accessible-title">POA Management</h1>

    <section className="poa-results-panel admin-poa-results" aria-label="Manage POA documents">
      <form className="admin-poa-country-filter" onSubmit={applyCountryFilter}>
        <label htmlFor="admin-poa-country-options">Country</label>
        <details className="admin-poa-country-select" id="admin-poa-country-options">
          <summary aria-label="Select countries">
            {countrySelection.length === 0
              ? 'All countries'
              : countrySelection.length === 1
                ? countries.find(country => country.id === countrySelection[0])?.name ?? '1 country'
                : `${countrySelection.length} countries selected`}
          </summary>
          <div className="admin-poa-country-menu">
            <button type="button" onClick={() => setCountrySelection([])}>Select all countries</button>
            <label><input type="checkbox" checked={countrySelection.includes('shared-all')} onChange={() => toggleCountry('shared-all')} />All Countries (shared)</label>
            {countries.map(country => <label key={country.id}>
              <input type="checkbox" checked={countrySelection.includes(country.id)} onChange={() => toggleCountry(country.id)} />
              <span>{country.name}</span>
            </label>)}
            {!countries.length && <p>{loading ? 'Loading countries...' : 'No countries available.'}</p>}
          </div>
        </details>
        <button type="submit" className="poa-download-all admin-poa-filter-submit" disabled={loading}>Search</button>
      </form>

      <div className="poa-results-toolbar">
        <label className="poa-table-search" htmlFor="admin-poa-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></svg>
          <input id="admin-poa-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search documents..." />
        </label>
        <span>{documents.length} document{documents.length === 1 ? '' : 's'}</span>
        <button type="button" className="poa-download-all admin-poa-add" data-action="add" onClick={openCreate} disabled={loading || saving || Boolean(busyKey)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Upload POA
        </button>
      </div>

      {notice && <p className="admin-poa-notice" role="status">{notice}</p>}
      {error && !modal && <p className="poa-error" role="alert">{error}</p>}
      <div className="poa-table-wrap">
        <table className="poa-table admin-poa-table">
          <thead><tr><th scope="col">Countries</th><th scope="col">Doc Name</th><th scope="col">Date</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="poa-empty">Loading POA documents...</td></tr>}
            {!loading && pageItems.map(item => <tr key={item.id}>
              <td>{item.countries.map(country => country.name).join(', ') || 'All Countries (shared)'}</td>
              <td>{item.document_name}</td>
              <td>{formatDate(item.last_modified)}</td>
              <td className="admin-poa-actions"><div className="admin-poa-row-actions">
                <button type="button" className="poa-download-button" onClick={() => void download(item)} disabled={saving || Boolean(busyKey)} aria-label={`Download ${item.document_name}`} title="Download"><ActionIcon name="download" /></button>
                <button type="button" className="poa-download-button admin-poa-edit" data-action="edit" onClick={() => openEdit(item)} disabled={saving || Boolean(busyKey)} aria-label={`Edit ${item.document_name}`} title="Edit"><ActionIcon name="edit" /><span>Edit</span></button>
                <button type="button" data-action="delete" className="poa-download-button admin-poa-delete" onClick={() => { if (operation.current) return; setDeleteTarget(item); setDeleteError(''); }} disabled={saving || Boolean(busyKey)} aria-label={`Delete ${item.document_name}`} title="Delete"><ActionIcon name="delete" /><span>Delete</span></button>
              </div>
              </td>
            </tr>)}
            {!loading && !error && !pageItems.length && <tr><td colSpan={4} className="poa-empty">{search || appliedCountrySelection.length ? 'No documents match the selected filters.' : 'No POA documents have been uploaded.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="poa-pagination">
        <span>Showing {visible.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}</span>
        <nav aria-label="POA document pages">
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Previous</button>
          <span aria-current="page">{currentPage} / {pageCount}</span>
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount}>Next</button>
        </nav>
      </div>
    </section>

    {modal && <div className="admin-poa-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setModal(false); }}>
      <section className="admin-poa-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-poa-dialog-title">
        <header><h2 id="admin-poa-dialog-title">{selected ? 'Edit POA document' : 'Upload POA document'}</h2><button type="button" onClick={() => setModal(false)} disabled={saving} aria-label="Close">×</button></header>
        <form onSubmit={event => void save(event)}>
          <label htmlFor="admin-poa-country">Countries <span aria-hidden="true">*</span></label>
          <details className="admin-poa-country-select admin-poa-upload-country" id="admin-poa-country">
            <summary aria-label="Select countries for this document">
              {uploadCountryIds.length === 0
                ? 'Select countries'
                : uploadCountryIds[0] === 'shared'
                  ? 'All Countries (shared)'
                  : uploadCountryIds.length === 1
                    ? countries.find(country => country.id === uploadCountryIds[0])?.name ?? '1 country selected'
                    : `${uploadCountryIds.length} countries selected`}
            </summary>
            <div className="admin-poa-country-menu">
              <input type="search" aria-label="Search countries to save" placeholder="Search countries..." value={countrySearch} onChange={event => setCountrySearch(event.target.value)} disabled={saving} />
              <div className="admin-poa-country-shortcuts"><button type="button" disabled={saving || !countries.length} onClick={() => setUploadCountryIds(countries.map(country => country.id))}>Select all countries</button><button type="button" disabled={saving} onClick={() => setUploadCountryIds([])}>Clear selection</button></div>
              <label><input type="checkbox" disabled={saving} checked={uploadCountryIds.includes('shared')} onChange={() => toggleUploadCountry('shared')} />All Countries (shared)</label>
              {countries.filter(country => country.name.toLowerCase().includes(countrySearch.trim().toLowerCase())).map(country => <label key={country.id}>
                <input type="checkbox" disabled={saving} checked={uploadCountryIds.includes(country.id)} onChange={() => toggleUploadCountry(country.id)} />
                <span>{country.name}</span>
              </label>)}
              {!countries.length && <p>{loading ? 'Loading countries...' : 'No countries available.'}</p>}
            </div>
          </details>
          <div className="admin-poa-selected-countries" aria-label="Selected countries">
            {uploadCountryIds.map(id => <button key={id} type="button" disabled={saving} onClick={() => toggleUploadCountry(id)} aria-label={`Remove ${id === 'shared' ? 'All Countries' : countries.find(country => country.id === id)?.name ?? 'country'}`}>{id === 'shared' ? 'All Countries (shared)' : countries.find(country => country.id === id)?.name ?? 'Unavailable country'}<span aria-hidden="true"> ?</span></button>)}
          </div>
          <p className="admin-poa-hint">Select multiple countries for one document. All Countries shares it with every country.</p>
          <label htmlFor="admin-poa-name">Document name <span aria-hidden="true">*</span></label>
          <input disabled={saving} id="admin-poa-name" value={documentName} onChange={event => setDocumentName(event.target.value)} maxLength={160} required />
          <label htmlFor="admin-poa-file">Document {selected ? '(optional replacement)' : '*'}</label>
          <input disabled={saving} id="admin-poa-file" type="file" accept=".pdf,.doc,.docx" required={!selected} onChange={event => {
            const next = event.target.files?.[0] ?? null;
            if (next && (next.size < 1 || next.size > 10 * 1024 * 1024 || !['pdf', 'doc', 'docx'].includes(next.name.split('.').pop()?.toLowerCase() ?? ''))) {
              setError('Upload a PDF, DOC, or DOCX document up to 10MB.');
              setFile(null);
              event.target.value = '';
              return;
            }
            setFile(next);
            setError('');
            if (next && !documentName) setDocumentName(next.name.replace(/\.[^.]+$/, ''));
          }} />
          <p className="admin-poa-hint">PDF, DOC, or DOCX · Maximum 10 MB</p>
          {error && <p className="poa-error" role="alert">{error}</p>}
          <footer><button type="button" className="admin-poa-cancel" onClick={() => setModal(false)} disabled={saving}>Cancel</button><button type="submit" data-action={selected ? "update" : "add"} className="poa-download-all" disabled={saving}>{saving ? 'Saving...' : selected ? 'Update document' : 'Upload document'}</button></footer>
        </form>
      </section>
    </div>}
    {deleteTarget && <div className="admin-poa-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !operation.current) setDeleteTarget(null); }}>
      <section className="admin-poa-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-poa-delete-title">
        <header><h2 id="admin-poa-delete-title">Delete POA document</h2><button type="button" disabled={Boolean(busyKey)} onClick={() => setDeleteTarget(null)} aria-label="Close delete dialog">?</button></header>
        <div className="admin-poa-delete-body"><p>Delete <strong>{deleteTarget.document_name}</strong>?</p><p>Countries: {deleteTarget.countries.map(country => country.name).join(', ') || 'All Countries'}</p><p>This removes the document from AWS and all its country links.</p>{deleteError && <p className="poa-error" role="alert">{deleteError}</p>}
          <footer><button type="button" className="admin-poa-cancel" disabled={Boolean(busyKey)} onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="admin-poa-confirm-delete" disabled={Boolean(busyKey)} onClick={() => void remove()}>{busyKey ? 'Deleting...' : 'Delete document'}</button></footer>
        </div>
      </section>
    </div>}
  </main>;
}

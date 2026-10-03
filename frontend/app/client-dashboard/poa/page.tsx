'use client';
import ClientManagement from '../../../src/components/ClientManagement';
import dynamic from 'next/dynamic';
const AdminPoaPage = dynamic(() => import('../../poa/page'), { loading: () => <p>Loading management form...</p> });

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSupabaseFunction } from '../../../src/lib/supabase/browser';
import './poa.css';

type Country = { id: string; name: string; abbreviation: string; flag_url: string | null };
type POADocument = {
  id: string;
  key: string;
  countries: Country[];
  document_name: string;
  last_modified: string | null;
};
type POAResponse = { data: POADocument[]; countries: Country[] };

const PAGE_SIZE = 12;

async function getDownloadUrl(item: POADocument) {
  const parameter = item.id.startsWith('legacy:') ? `key=${encodeURIComponent(item.key)}` : `id=${encodeURIComponent(item.id)}`;
  const response = await fetchSupabaseFunction(`poa?${parameter}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.error || 'Unable to prepare this download.');
  if (typeof body.url !== 'string') throw Error('The POA download service returned an invalid link.');
  return body.url;
}

function triggerDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ClientPoaPage() {
  const [documents, setDocuments] = useState<POADocument[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [appliedCountry, setAppliedCountry] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');

  const loadDocuments = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchSupabaseFunction('poa', { signal });
      const body = await response.json().catch(() => ({})) as Partial<POAResponse> & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load POA documents.');
      if (!Array.isArray(body.data) || !Array.isArray(body.countries)) throw Error('The POA document service returned an invalid response.');
      setDocuments(body.data);
      setCountries([...new Map([...body.countries, ...body.data.flatMap(({ countries: linked }) => linked)].map(country => [country.id, country])).values()]);
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load POA documents.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDocuments(controller.signal);
    return () => controller.abort();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => documents
    .filter(({ countries: linked }) => !appliedCountry || linked.some(country => country.id === 'shared-all' || country.id === appliedCountry))
    .filter(({ countries: linked, document_name, last_modified }) => {
      const query = tableSearch.trim().toLowerCase();
      return !query || [linked.map(country => country.name).join(' '), document_name, last_modified ?? ''].some(value => value.toLowerCase().includes(query));
    })
    .sort((a, b) => a.document_name.localeCompare(b.document_name)), [documents, appliedCountry, tableSearch]);
  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleDocuments = filteredDocuments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const applyFilter = (event: FormEvent) => {
    event.preventDefault();
    setAppliedCountry(countryFilter);
    setPage(1);
  };

  const downloadOne = async (item: POADocument) => {
    setError('');
    setDownloadStatus('');
    try {
      triggerDownload(await getDownloadUrl(item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download this POA document.');
    }
  };

  const downloadAllPdfs = async () => {
    if (!filteredDocuments.length || downloading) return;
    setError('');
    setDownloadStatus(`Preparing ${filteredDocuments.length} document${filteredDocuments.length === 1 ? '' : 's'}...`);
    setDownloading(true);
    try {
      const urls = await Promise.all(filteredDocuments.map(getDownloadUrl));
      urls.forEach(triggerDownload);
      setDownloadStatus(`Started ${urls.length} document download${urls.length === 1 ? '' : 's'}.`);
    } catch (cause) {
      setDownloadStatus('');
      setError(cause instanceof Error ? cause.message : 'Unable to prepare the POA PDF downloads.');
    } finally {
      setDownloading(false);
    }
  };

  return <main className="poa-page">
    <div className="poa-title"><span aria-hidden="true" className="poa-title-icon"><svg viewBox="0 0 24 24"><path d="M5 2h10l5 5v15H5z"/><path d="M14 2v6h6M8 12h8M8 16h8"/></svg></span><h1>POA</h1></div>
    <section className="poa-filter-panel" aria-label="Filter POA documents">
      <form onSubmit={applyFilter}>
        <label htmlFor="poa-country">Country <span aria-hidden="true">*</span></label>
        <div className="poa-filter-controls">
          <select id="poa-country" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} disabled={loading}>
            <option value="">Select Country</option>
            {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
          <button type="submit" disabled={loading} className="poa-search-button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></svg>Search</button>
        </div>
      </form>
    </section>

    <section className="poa-results-panel" aria-label="POA documents">
      <div className="poa-results-toolbar">
        <label className="poa-table-search" htmlFor="poa-table-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></svg><input id="poa-table-search" type="search" value={tableSearch} onChange={(event) => { setTableSearch(event.target.value); setPage(1); }} placeholder="Search documents..." /></label>
        <span aria-live="polite">{downloadStatus}</span>
        <button type="button" className="poa-download-all" onClick={downloadAllPdfs} disabled={loading || downloading || filteredDocuments.length === 0}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>
          {downloading ? 'Preparing downloads...' : 'Download All Documents'}
        </button>
      </div>

      {error && <p className="poa-error" role="alert">{error}</p>}
      <div className="poa-table-wrap">
        <table className="poa-table">
          <thead><tr><th scope="col">Country</th><th scope="col">Doc Name</th><th scope="col">Date</th><th scope="col">Download</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="poa-empty">Loading POA documents...</td></tr>}
            {!loading && !error && visibleDocuments.map((item) => <tr key={item.id}>
              <td><span className="poa-country-cell">{item.countries.map(country => <span className="poa-country-cell" key={country.id}>{country.flag_url ? <img src={country.flag_url} alt="" /> : <span className="poa-country-initials">{country.abbreviation}</span>}<span>{country.name}</span></span>)}</span></td>
              <td>{item.document_name}</td>
              <td>{item.last_modified ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(item.last_modified)) : '—'}</td>
              <td><button type="button" className="poa-download-button" onClick={() => void downloadOne(item)} aria-label={`Download ${item.document_name}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg></button></td>
            </tr>)}
            {!loading && !error && !visibleDocuments.length && <tr><td colSpan={4} className="poa-empty">{tableSearch ? 'No documents match your search.' : appliedCountry ? 'No POA documents are available for this country.' : 'No POA documents are currently available.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <footer className="poa-pagination">
        <span>Showing {filteredDocuments.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}-{Math.min(currentPage * PAGE_SIZE, filteredDocuments.length)} of {filteredDocuments.length} results</span>
        <nav aria-label="POA document pages">
          <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1}>First</button>
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button>
          <span aria-live="polite">{currentPage}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Next</button>
          <button type="button" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount}>Last</button>
        </nav>
      </footer>
    </section>
  </main>;
}

export default function ManagedPage() { return <ClientManagement manager={<AdminPoaPage />}><ClientPoaPage /></ClientManagement>; }

'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import ActionIcon from '../../../src/components/ActionIcon';
import ClientManagement from '../../../src/components/ClientManagement';
import { ReferenceCountryBadge, ReferencePagination, ReferenceSearchIcon, ReferenceTitle, useClientReferenceData } from '../../../src/components/ClientReference';
import '../client-documents.css';

const NotificationsPage = dynamic(() => import('../../notifications/page'), { loading: () => <p>Loading management form...</p> });

type Notification = {
  id: string;
  notification_date: string;
  description: string;
  document_name: string | null;
  document_size: number | null;
  document_type: string | null;
  created_at: string;
  updated_at: string;
  aws_metadata: { size_bytes: number | null; content_type: string | null; last_modified: string | null; etag: string | null } | null;
  countries: Array<{ country: { id?: string; name: string; abbreviation?: string; flag_url?: string } }>;
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
};
const fileSize = (value: number | null) => value == null ? null : value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;

function ClientNotificationsPage() {
  const { data, loading, error, retry } = useClientReferenceData<Notification[]>('notifications');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [opening, setOpening] = useState('');
  const records = data ?? [];
  const rows = useMemo(() => records.filter(item => [
    item.id, item.description, item.notification_date, item.document_name, item.document_type,
    item.aws_metadata?.content_type, item.aws_metadata?.etag, item.countries.map(entry => entry.country.name).join(' '),
  ].filter(Boolean).join(' ').toLowerCase().includes(submitted.trim().toLowerCase())), [records, submitted]);
  const pages = Math.max(1, Math.ceil(rows.length / (pageSize || Math.max(rows.length, 1))));
  const currentPage = Math.min(page, pages);
  const visibleRows = pageSize === 0 ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openDocument = async (item: Notification) => {
    if (!item.document_name) return;
    try {
      setOpening(item.id);
      const { clientReferenceRequest } = await import('../../../src/components/ClientReference');
      const { url } = await clientReferenceRequest<{ url: string }>(`notifications/${item.id}/download-url`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'Unable to open this document.');
    } finally {
      setOpening('');
    }
  };

  return <section className="client-reference-page reference-notifications client-notifications-page">
    <ReferenceTitle title="Notifications" subtitle={loading ? 'Loading your notifications…' : `${rows.length} of ${records.length} notifications`} icon="notifications" />
    <form className="reference-filter" role="search" onSubmit={event => { event.preventDefault(); setSubmitted(query); setPage(1); }}>
      <label className="reference-search-input"><ReferenceSearchIcon /><input aria-label="Search notifications" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by description, country, date, or document…" /></label>
      <button className="reference-primary" type="submit" disabled={loading}><ReferenceSearchIcon />Search</button>
      {submitted && <button className="notifications-clear-search" type="button" onClick={() => { setQuery(''); setSubmitted(''); setPage(1); }}>Clear</button>}
    </form>
    {error && <div className="client-error notifications-error" role="alert"><span>{error}</span><button type="button" onClick={retry}>Try again</button></div>}
    <div className="notifications-summary" aria-live="polite">
      <div><span>Notifications</span><strong>{loading ? '—' : records.length}</strong></div>
      <div><span>With documents</span><strong>{loading ? '—' : records.filter(item => item.document_name).length}</strong></div>
      <div><span>Countries covered</span><strong>{loading ? '—' : new Set(records.flatMap(item => item.countries.map(entry => entry.country.id || entry.country.name))).size}</strong></div>
      <div><span>Showing</span><strong>{loading ? '—' : rows.length}</strong></div>
    </div>
    <div className="reference-table-card notifications-table-card">
      <div className="notifications-table-heading"><div><h2>Notification records</h2><p>Dates, countries, documents, and file details</p></div><span className="notifications-live-count">{rows.length} {rows.length === 1 ? 'record' : 'records'}</span></div>
      <div className="reference-table-scroll notifications-table-scroll">
        <table className="reference-table notifications-table">
          <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Countries</th><th>Document and file details</th><th>Record activity</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? <tr><td className="notifications-state" colSpan={7}>Loading notification records…</td></tr> : visibleRows.length ? visibleRows.map(item => {
              const size = fileSize(item.aws_metadata?.size_bytes ?? item.document_size);
              const type = item.aws_metadata?.content_type || item.document_type;
              return <tr key={item.id}>
                <td data-label="Date"><strong className="notifications-date">{formatDate(item.notification_date)}</strong></td>
                <td data-label="Reference"><code className="notifications-reference" title={item.id}>{item.id}</code></td>
                <td data-label="Description"><strong className="notifications-description">{item.description || '—'}</strong></td>
                <td data-label="Countries"><div className="notifications-countries">{item.countries.length ? item.countries.map(entry => <ReferenceCountryBadge key={entry.country.id || entry.country.name} country={entry.country} />) : <span>—</span>}</div></td>
                <td data-label="Document and file details"><div className="notifications-document"><strong>{item.document_name || 'No document attached'}</strong><span>{[type, size].filter(Boolean).join(' · ') || 'File details unavailable'}</span>{item.aws_metadata?.last_modified && <span>File updated {formatDate(item.aws_metadata.last_modified)}</span>}{item.aws_metadata?.etag && <code title={item.aws_metadata.etag}>ETag {item.aws_metadata.etag}</code>}</div></td>
                <td data-label="Record activity"><div className="notifications-activity"><span><b>Created</b>{formatDate(item.created_at)}</span><span><b>Updated</b>{formatDate(item.updated_at)}</span></div></td>
                <td data-label="Action"><button type="button" className="reference-primary reference-read notifications-open" onClick={() => void openDocument(item)} disabled={!item.document_name || opening === item.id} aria-label={`${opening === item.id ? 'Opening' : 'Open'} ${item.document_name || 'document'}`} title={item.document_name ? 'Open attached document' : 'No document attached'}><ActionIcon name={opening === item.id ? 'refresh' : 'view'} /><span>{opening === item.id ? 'Opening…' : 'Open'}</span></button></td>
              </tr>;
            }) : <tr><td className="notifications-state" colSpan={7}><strong>{submitted ? 'No matching notifications' : 'No notifications yet'}</strong><span>{submitted ? 'Try another search term or clear the filter.' : 'Notifications for your account will appear here.'}</span></td></tr>}
          </tbody>
        </table>
      </div>
      <ReferencePagination page={currentPage} total={rows.length} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} allowAll loading={loading} />
    </div>
  </section>;
}

export default function ManagedPage() {
  return <ClientManagement manager={<NotificationsPage />}><ClientNotificationsPage /></ClientManagement>;
}

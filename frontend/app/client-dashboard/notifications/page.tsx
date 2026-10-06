'use client';
import ClientManagement from '../../../src/components/ClientManagement';
import dynamic from 'next/dynamic';
const NotificationsPage = dynamic(() => import('../../notifications/page'), { loading: () => <p>Loading management form...</p> });

import { useMemo, useState } from 'react';
import ActionIcon from '../../../src/components/ActionIcon';
import { ReferenceCountryBadge, ReferencePagination, ReferenceSearchIcon, ReferenceTitle, useClientReferenceData } from '../../../src/components/ClientReference';
import '../client-documents.css';

type Notification = { id: string; notification_date: string; description: string; document_name: string | null; document_size: number | null; document_type: string | null; created_at: string; updated_at: string; aws_metadata: { size_bytes: number | null; content_type: string | null; last_modified: string | null; etag: string | null } | null; countries: Array<{ country: { id?: string; name: string; abbreviation?: string; flag_url?: string } }> };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const fileSize = (value: number | null) => value == null ? '—' : value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;

function ClientNotificationsPage() {
  const { data, loading, error, retry } = useClientReferenceData<Notification[]>('notifications');
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState(''), [page, setPage] = useState(1), [opening, setOpening] = useState('');
  const rows = useMemo(() => (data || []).filter(item => `${item.id} ${item.description} ${item.document_name || ''} ${item.document_type || ''} ${item.countries.map(entry => entry.country.name).join(' ')}`.toLowerCase().includes(submitted.toLowerCase())), [data, submitted]);
  const open = async (item: Notification) => { if (!item.document_name) return; try { setOpening(item.id); const { clientReferenceRequest } = await import('../../../src/components/ClientReference'); const { url } = await clientReferenceRequest<{ url: string }>(`notifications/${item.id}/download-url`); window.open(url, '_blank', 'noopener,noreferrer'); } finally { setOpening(''); } };
  return <section className="client-reference-page reference-notifications client-notifications-page"><ReferenceTitle title="Notifications" icon="notifications" />
    <form className="reference-filter" onSubmit={e => { e.preventDefault(); setSubmitted(query); setPage(1); }}><label className="reference-search-input"><ReferenceSearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notifications..." /></label><button className="reference-primary" disabled={loading}><ReferenceSearchIcon />Search</button></form>
    {error && <p className="client-error" role="alert">{error} <button onClick={retry}>Retry</button></p>}
    <div className="reference-table-card"><div className="reference-table-scroll"><table className="reference-table"><thead><tr><th>Reference</th><th>Country</th><th>Description</th><th>Notification Date</th><th>Document</th><th>AWS Content Type</th><th>AWS Size</th><th>AWS Last Modified</th><th>AWS ETag</th><th>Created</th><th>Updated</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={12}>Loading notifications...</td></tr> : rows.length ? rows.slice((page - 1) * 10, page * 10).map(item => <tr key={item.id}><td title={item.id}>{item.id}</td><td>{item.countries.map(entry => <ReferenceCountryBadge key={entry.country.id || entry.country.name} country={entry.country} />)}</td><td><strong>{item.description}</strong></td><td>{date(item.notification_date)}</td><td>{item.document_name || '—'}</td><td>{item.aws_metadata?.content_type || item.document_type || '—'}</td><td>{fileSize(item.aws_metadata?.size_bytes ?? item.document_size)}</td><td>{date(item.aws_metadata?.last_modified || null)}</td><td title={item.aws_metadata?.etag || undefined}>{item.aws_metadata?.etag || '—'}</td><td>{date(item.created_at)}</td><td>{date(item.updated_at)}</td><td><button className="reference-primary reference-read" onClick={() => void open(item)} disabled={!item.document_name || opening === item.id}><ActionIcon name="view" />{opening === item.id ? 'Opening…' : 'Read'}</button></td></tr>) : <tr><td colSpan={12}>No notifications match your search.</td></tr>}</tbody></table></div><ReferencePagination page={page} total={rows.length} onChange={setPage} /></div>
  </section>;
}

export default function ManagedPage() { return <ClientManagement manager={<NotificationsPage />}><ClientNotificationsPage /></ClientManagement>; }

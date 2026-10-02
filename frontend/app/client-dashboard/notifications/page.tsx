'use client';

import { useMemo, useState } from 'react';
import ActionIcon from '../../../src/components/ActionIcon';
import { ReferenceCountryBadge, ReferencePagination, ReferenceSearchIcon, ReferenceTitle, useClientReferenceData } from '../../../src/components/ClientReference';

type Notification = { id: string; notification_date: string; description: string; document_name: string | null; countries: Array<{ country: { id?: string; name: string; abbreviation?: string; flag_url?: string } }> };
const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function ClientNotificationsPage() {
  const { data, loading, error, retry } = useClientReferenceData<Notification[]>('notifications');
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState(''), [page, setPage] = useState(1), [opening, setOpening] = useState('');
  const rows = useMemo(() => (data || []).filter(item => `${item.description} ${item.countries.map(entry => entry.country.name).join(' ')}`.toLowerCase().includes(submitted.toLowerCase())), [data, submitted]);
  const open = async (item: Notification) => { if (!item.document_name) return; try { setOpening(item.id); const { clientReferenceRequest } = await import('../../../src/components/ClientReference'); const { url } = await clientReferenceRequest<{ url: string }>(`notifications/${item.id}/download-url`); window.open(url, '_blank', 'noopener,noreferrer'); } finally { setOpening(''); } };
  return <section className="client-reference-page reference-notifications"><ReferenceTitle title="Notifications" subtitle="Stay up to date with the latest news, announcements and important information from AIP&T." icon="notifications" />
    <form className="reference-filter" onSubmit={e => { e.preventDefault(); setSubmitted(query); setPage(1); }}><label className="reference-search-input"><ReferenceSearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notifications..." /></label><button className="reference-primary" disabled={loading}><ReferenceSearchIcon />Search</button></form>
    {error && <p className="client-error" role="alert">{error} <button onClick={retry}>Retry</button></p>}
    <div className="reference-table-card"><div className="reference-table-scroll"><table className="reference-table"><thead><tr><th>Country</th><th>Title</th><th>Date</th><th>Read</th></tr></thead><tbody>{loading ? <tr><td colSpan={4}>Loading notifications...</td></tr> : rows.length ? rows.slice((page - 1) * 10, page * 10).map(item => <tr key={item.id}><td>{item.countries.map(entry => <ReferenceCountryBadge key={entry.country.id || entry.country.name} country={entry.country} />)}</td><td><strong>{item.description}</strong></td><td>{date(item.notification_date)}</td><td><button className="reference-primary reference-read" onClick={() => void open(item)} disabled={!item.document_name || opening === item.id}><ActionIcon name="view" />{opening === item.id ? 'Opening…' : 'Read'}</button></td></tr>) : <tr><td colSpan={4}>No notifications match your search.</td></tr>}</tbody></table></div><ReferencePagination page={page} total={rows.length} onChange={setPage} /></div>
  </section>;
}

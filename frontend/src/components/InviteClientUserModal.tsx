'use client';
import ActionIcon from './ActionIcon';


import { FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type ClientOption = {
  id: string;
  assigned_id: number;
  company_name: string;
  email: string;
  invitation_status: 'not_invited';
};

type Props = { onClose: () => void; onSent: (message: string) => void };

export default function InviteClientUserModal({ onClose, onSent }: Props) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<'account_exists' | 'invitation_exists' | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        if (!session) throw Error('Please sign in.');
        const response = await fetchSupabaseFunction('company-registration', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list_eligible_clients' }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(body.error || 'Unable to load eligible clients.');
        const next = (body.data || []) as ClientOption[];
        setClients(next);
        setClientId(next[0]?.id || '');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load eligible clients.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((client) => !term || `${client.company_name} ${client.email} ${client.assigned_id}`.toLowerCase().includes(term));
  }, [clients, search]);
  const selected = clients.find((client) => client.id === clientId) ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setConflict(null);
    try {
      setSending(true);
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction('company-registration', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_invitation', client_id: clientId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.code === 'account_exists' || body.code === 'invitation_exists') setConflict(body.code);
        throw Error(body.error || 'Unable to send invitation email.');
      }
      onSent(`Invitation email sent to ${selected?.email}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send invitation email.');
    } finally {
      setSending(false);
    }
  };

  return <div className="client-modal-backdrop modal-layer-top" onMouseDown={() => !sending && onClose()}>
    <section className="client-modal invite-client-modal" onMouseDown={(event) => event.stopPropagation()}>
      <form onSubmit={submit}>
        <header className="client-modal-heading"><div><span className="modal-kicker">CLIENT ACCESS</span><h2>Invite Client User</h2><p>Only active clients with a valid registered email, no account, and no active invitation are shown.</p></div><button type="button" className="modal-close" onClick={onClose} disabled={sending} aria-label="Close">×</button></header>
        <div className="invite-client-fields">
          <label><span>Search eligible clients</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client name, ID, or email" /></label>
          <label><span>Client <em>*</em></span><select value={clientId} onChange={(event) => setClientId(event.target.value)} required disabled={loading || !visible.length}><option value="">{loading ? 'Loading...' : 'Select client'}</option>{visible.map((client) => <option key={client.id} value={client.id}>#{client.assigned_id} — {client.company_name}</option>)}</select></label>
          <label><span>Registered email</span><input value={selected?.email || ''} readOnly /></label>
          <label><span>Company</span><input value={selected?.company_name || ''} readOnly /></label>
          <label><span>Invitation status</span><input value={selected ? 'Not invited — eligible' : ''} readOnly /></label>
        </div>
        {!loading && !clients.length && !error && <p className="modal-error">No clients are currently eligible for invitation.</p>}
        {conflict && <div className="approval-modal"><h3>{conflict === 'account_exists' ? 'Account Already Exists' : 'Invitation Already Sent'}</h3><p>{error}</p></div>}
        {error && !conflict && <p className="modal-error" role="alert">{error}</p>}
        <footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={sending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="modal-primary" disabled={sending || loading || !clientId}>{sending ? 'Sending invitation...' : 'Send Invitation'}</button></footer>
      </form>
    </section>
  </div>;
}

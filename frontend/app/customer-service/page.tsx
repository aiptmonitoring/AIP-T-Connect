'use client';
import ActionIcon from '../../src/components/ActionIcon';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from '../../src/lib/supabase/browser';
type Client = {
  id: string;
  assigned_id: number;
  company_name: string;
  email: string;
  phone: string;
  address: string;
  country?: { name: string; abbreviation: string };
};
type Ticket = {
  id: string;
  client_id: string;
  subject: string;
  category: string;
  priority: string;
  status: 'Open' | 'Pending' | 'Resolved';
  created_at: string;
  updated_at: string;
  unread_count?: number;
  client?: Client;
};
type Message = {
  id: string;
  sender_role: 'client' | 'administrator';
  message: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_to?: { id: string; message: string; sender_role: string } | null;
  attachments?: Attachment[];
};
type Attachment = { id: string; file_name: string; file_size: number; file_type: string; is_image: boolean };
type StatusAction = { id: string; from_status: Ticket['status']; to_status: Ticket['status']; note?: string | null; created_at: string };
const supportEmojis = ['😀','😂','😊','😍','👍','🙏','🎉','❤️','✅','👋','🤝','📎'];
const supportAttachmentAccept = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.html,.htm,.msg,.eml';
export default function CustomerServicePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [selected, setSelected] = useState<Ticket | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [query, setQuery] = useState(''),
    [tab, setTab] = useState('All');
  const [reply, setReply] = useState(''),
    [modal, setModal] = useState(false),
    [clientId, setClientId] = useState(''),
    [subject, setSubject] = useState(''),
    [category, setCategory] = useState('General'),
    [priority, setPriority] = useState('Normal'),
    [firstMessage, setFirstMessage] = useState('');
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [clientTyping, setClientTyping] = useState(false);
  const [statusActions, setStatusActions] = useState<StatusAction[]>([]);
  const [actionNote, setActionNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const messageHistoryRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingLastSentRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured.');
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw Error('Please sign in.');
    const isForm = init.body instanceof FormData;
    const response = await fetchSupabaseFunction(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.error || 'Request failed.');
    return body;
  }, []);
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const ticketBody = await request('customer-service');
      const allClients: Client[] = [];
      let page = 1,
        total = 0;
      do {
        const body = await request(`clients?page=${page}&page_size=100`);
        allClients.push(...body.data);
        total = body.total;
        page++;
      } while (allClients.length < total);
      setTickets(ticketBody.tickets);
      setClients(allClients);
      setSelected((current) => current ?? ticketBody.tickets[0] ?? null);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to load customer service.',
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [request]);
  const signalTyping = useCallback((typing = true) => {
    if (!selected) return;
    const now = Date.now();
    if (!typing || now - typingLastSentRef.current > 1500) {
      typingLastSentRef.current = now;
      void request(`customer-service/${selected.id}/typing`, { method: 'POST', body: JSON.stringify({ typing }) }).catch(() => undefined);
    }
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    if (typing) typingStopTimerRef.current = window.setTimeout(() => signalTyping(false), 2500);
  }, [request, selected]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    const onFocus = () => void load(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load]);
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    const selectedId = selected.id;
    const refresh = () => void request(`customer-service/${selectedId}`)
      .then((body) => {
        setMessages(body.messages);
        setStatusActions(body.status_actions ?? []);
        setClientTyping(Boolean(body.other_typing));
        setTickets((current) => current.map((ticket) => ticket.id === selectedId ? { ...ticket, unread_count: 0 } : ticket));
      })
      .catch((cause) => setError(cause.message));
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => { window.clearInterval(timer); setClientTyping(false); };
  }, [selected?.id, request]);
  useEffect(() => () => {
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
  }, []);
  useEffect(() => {
    const history = messageHistoryRef.current;
    if (history) history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' });
  }, [messages.length, selected?.id, clientTyping]);
  const visible = useMemo(() => {
    const term = query.toLowerCase();
    return tickets.filter(
      (ticket) =>
        (tab === 'All' || ticket.status === tab) &&
        `${ticket.client?.company_name ?? ''} ${ticket.subject}`
          .toLowerCase()
          .includes(term),
    );
  }, [tickets, query, tab]);
  const counts = {
    open: tickets.filter((x) => x.status === 'Open').length,
    pending: tickets.filter((x) => x.status === 'Pending').length,
    resolved: tickets.filter((x) => x.status === 'Resolved').length,
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await request('customer-service', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          subject,
          category,
          priority,
          message: firstMessage,
        }),
      });
      setModal(false);
      setClientId('');
      setSubject('');
      setFirstMessage('');
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to create ticket.',
      );
    } finally {
      setSaving(false);
    }
  };
  const send = async () => {
    if (!selected || (!reply.trim() && !files.length)) return;
    setSaving(true);
    try {
      signalTyping(false);
      const form = new FormData();
      form.append('message', reply.trim());
      if (replyTo) form.append('reply_to_id', replyTo.id);
      files.forEach((file) => form.append('files', file));
      await request(`customer-service/${selected.id}/messages`, {
        method: 'POST',
        body: form,
      });
      setReply('');
      setFiles([]);
      setReplyTo(null);
      setEmojiOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const body = await request(`customer-service/${selected.id}`);
      setMessages(body.messages);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to send message.',
      );
    } finally {
      setSaving(false);
    }
  };
  const chooseFiles = (selectedFiles: FileList | null) => {
    const next = Array.from(selectedFiles ?? []);
    if (next.length > 5 || next.some((file) => file.size < 1 || file.size > 10 * 1024 * 1024)) { setError('Attach up to 5 files, with each file no larger than 10MB.'); return; }
    setError(''); setFiles(next);
  };
  const downloadAttachment = async (messageId: string, attachment: Attachment) => {
    try { const body = await request(`customer-service/${selected?.id}/messages/${messageId}/attachments/download-url?attachment_id=${attachment.id}`); window.open(body.url, '_blank', 'noopener,noreferrer'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to download the attachment.'); }
  };
  const update = async (status: 'Open' | 'Pending' | 'Resolved') => {
    if (!selected || saving || selected.status === status) return;
    setSaving(true);
    setError('');
    try {
      await request(`customer-service/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, note: actionNote }),
      });
      setSelected({ ...selected, status });
      setActionNote('');
      const body = await request(`customer-service/${selected.id}`);
      setMessages(body.messages ?? []);
      setStatusActions(body.status_actions ?? []);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the conversation status.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="customer-service-page">
      <header className="countries-topbar">
        <p>
          Home <i>/</i> <b>Customer Service</b>
        </p>
      </header>
      <section className="customer-heading">
        <div>
          <h1>◉ Customer Service</h1>
          <p>Client concerns and inquiries</p>
        </div>
        <div className="customer-stats">
          <span>
            <b>{counts.open}</b>Open Chats
          </span>
          <span>
            <b>{counts.resolved}</b>Resolved
          </span>
          <span>
            <b>{counts.pending}</b>Pending
          </span>
          <button onClick={() => setModal(true)} data-action="add" title="New Support Ticket"><ActionIcon name="add" /><span className="aipt-action-label">New Support Ticket</span></button>
        </div>
      </section>
      {error && <p className="customer-error">{error}</p>}
      <section className="customer-grid">
        <aside className="conversation-list">
          <h2>Client Conversations</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client or concern..."
          />
          <nav>
            {['All', 'Open', 'Pending', 'Resolved'].map((value) => (
              <button
                className={tab === value ? 'active' : ''}
                onClick={() => setTab(value)}
                key={value}
              >
                {value}
              </button>
            ))}
          </nav>
          <div>
            {loading ? (
              <p>Loading conversations...</p>
            ) : (
              visible.map((ticket) => (
                <button
                  className={`conversation-row${selected?.id === ticket.id ? ' selected' : ''}${ticket.unread_count ? ' has-unread' : ''}`}
                  onClick={() => setSelected(ticket)}
                  key={ticket.id}
                >
                  <span>
                    {ticket.client?.company_name?.slice(0, 2).toUpperCase()}
                  </span>
                  <b>
                    {ticket.client?.company_name}
                    <small>{ticket.subject}</small>
                  </b>
                  <em>{ticket.status}</em>
                  {Boolean(ticket.unread_count) && <mark>{ticket.unread_count}</mark>}
                </button>
              ))
            )}
          </div>
        </aside>
        <section className="conversation-panel">
          {selected ? (
            <>
              <header>
                <div className="customer-avatar">
                  {selected.client?.company_name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2>{selected.client?.company_name}</h2>
                  <p>{selected.client?.email}</p>
                </div>
                <span
                  className={`customer-status ${selected.status.toLowerCase()}`}
                >
                  {selected.status}
                </span>
              </header>
              <div className="message-history" ref={messageHistoryRef}>
                {messages.length ? (
                  messages.map((message) => (
                    <article
                      className={
                        message.sender_role === 'administrator'
                          ? 'admin-message'
                          : 'client-message'
                      }
                      key={message.id}
                    >
                      {message.reply_to && <blockquote><small>Reply to {message.reply_to.sender_role === 'administrator' ? 'Administrator' : selected.client?.company_name}</small>{message.reply_to.message || 'Attachment'}</blockquote>}
                      <b>
                        {message.sender_role === 'administrator'
                          ? 'Administrator'
                          : selected.client?.company_name}
                      </b>
                      {message.message && <p>{message.message}</p>}
                      {Boolean(message.attachments?.length) && <div className="support-attachments">{message.attachments!.map((attachment) => <button type="button" key={attachment.id} onClick={() => void downloadAttachment(message.id, attachment)}><span>{attachment.is_image ? '🖼️' : '📄'}</span><b>{attachment.file_name}<small>{Math.ceil(attachment.file_size / 1024)} KB</small></b></button>)}</div>}
                      <small>
                        {new Date(message.created_at).toLocaleString()}
                      </small>
                      <button className="support-reply-button" type="button" onClick={() => setReplyTo(message)}>Reply</button>
                    </article>
                  ))
                ) : (
                  <p className="empty-chat">No messages yet.</p>
                )}
                {clientTyping && <div className="admin-typing-indicator" role="status" aria-live="polite"><span><i></i><i></i><i></i></span><b>{selected.client?.company_name ?? 'Client'} is typing...</b></div>}
              </div>
              <footer>
                <div className="support-compose-extras">{replyTo && <div className="support-reply-preview"><span>Replying to {replyTo.sender_role === 'administrator' ? 'Administrator' : selected.client?.company_name}<small>{replyTo.message || 'Attachment'}</small></span><button type="button" onClick={() => setReplyTo(null)}>×</button></div>}{files.length > 0 && <div className="support-selected-files">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>×</button></span>)}</div>}</div>
                <div className="support-compose-row"><input ref={fileInputRef} type="file" hidden multiple accept={supportAttachmentAccept} onChange={(event) => chooseFiles(event.target.files)} /><button className="support-tool-button" type="button" aria-label="Attach files" title="Attach files" onClick={() => fileInputRef.current?.click()}>📎</button><button className="support-tool-button" type="button" aria-label="Add emoji" title="Add emoji" onClick={() => setEmojiOpen((value) => !value)}>😊</button>{emojiOpen && <div className="support-emoji-picker">{supportEmojis.map((emoji) => <button type="button" key={emoji} onClick={() => { setReply((value) => `${value}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
                <input
                  value={reply}
                  onChange={(e) => { setReply(e.target.value); signalTyping(Boolean(e.target.value.trim())); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send();
                  }}
                  placeholder="Type your message..."
                />
                <button className="support-send-button" onClick={() => void send()} disabled={saving || (!reply.trim() && !files.length)}>
                  Send
                </button>
                </div>
              </footer>
            </>
          ) : (
            <p className="empty-chat">Select a client conversation.</p>
          )}
        </section>
        <aside className="customer-details">
          {selected && (
            <>
              <section>
                <h3>Client Information</h3>
                <dl>
                  <dt>Name</dt>
                  <dd>{selected.client?.company_name}</dd>
                  <dt>Email</dt>
                  <dd>{selected.client?.email}</dd>
                  <dt>Country</dt>
                  <dd>{selected.client?.country?.name ?? '-'}</dd>
                </dl>
                <a href={`/clients?client=${selected.client_id}`} data-action="view" title="View Client Profile"><ActionIcon name="view" /><span className="aipt-action-label">View Client Profile</span></a>
              </section>
              <section>
                <h3>Concern Details</h3>
                <dl>
                  <dt>Subject</dt>
                  <dd>{selected.subject}</dd>
                  <dt>Category</dt>
                  <dd>{selected.category}</dd>
                  <dt>Priority</dt>
                  <dd>{selected.priority}</dd>
                  <dt>Status</dt>
                  <dd>{selected.status}</dd>
                </dl>
              </section>
              <section className="customer-quick-actions">
                <h3>Quick Actions</h3>
                <textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} maxLength={500} placeholder="Optional status note visible to the client" />
                <button disabled={saving || selected.status === 'Resolved'} onClick={() => void update('Resolved')}>
                  ✓ Mark as Resolved
                </button>
                <button disabled={saving || selected.status === 'Pending'} onClick={() => void update('Pending')}>
                  Mark Pending
                </button>
                <button disabled={saving || selected.status === 'Open'} onClick={() => void update('Open')}>
                  Reopen Ticket
                </button>
                {statusActions.length > 0 && <div className="customer-status-history">{statusActions.slice().reverse().map((action) => <p key={action.id}><b>{action.from_status} → {action.to_status}</b><small>{new Date(action.created_at).toLocaleString()}</small>{action.note && <span>{action.note}</span>}</p>)}</div>}
              </section>
            </>
          )}
        </aside>
      </section>
      {modal && (
        <div className="country-modal-backdrop">
          <section className="country-modal customer-ticket-modal">
            <header className="country-panel-heading">
              <h2>New Support Ticket</h2>
              <button onClick={() => setModal(false)}>×</button>
            </header>
            <form onSubmit={create}>
              <label className="country-label">
                Client
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option value={client.id} key={client.id}>
                      {client.company_name} — {client.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="country-label">
                Subject
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </label>
              <div className="customer-form-grid">
                <label className="country-label">
                  Category
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </label>
                <label className="country-label">
                  Priority
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {['Low', 'Normal', 'High', 'Urgent'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="country-label">
                Initial message
                <textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                />
              </label>
              <footer className="country-panel-footer">
                <button type="button" onClick={() => setModal(false)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                <button disabled={saving} data-action="add" title="Create Ticket"><ActionIcon name="add" /><span className="aipt-action-label">
                  {saving ? 'Saving...' : 'Create Ticket'}
                </span></button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

'use client';
import ActionIcon from '../../src/components/ActionIcon';


import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from '../../src/lib/supabase/browser';

type User = {
  id: string;
  email: string;
  full_name: string;
  company_name: string;
  logo_url: string | null;
  ip: string;
  role: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'suspended';
  account_status: 'active' | 'inactive';
  failed_login_attempts: number;
  locked: boolean;
  last_login_at: string | null;
  registration_date: string | null;
};
type Tab =
  | 'all'
  | 'clients'
  | 'admins'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'active'
  | 'inactive'
  | 'locked';
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Never';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]),
    [tab, setTab] = useState<Tab>('all'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState<'name' | 'email' | 'status' | 'last'>('name'),
    [ascending, setAscending] = useState(true),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const [reviewUser, setReviewUser] = useState<User | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw Error('Supabase is not configured.');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction('users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to load users.');
      setUsers(body as User[]);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load users.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users
      .filter(
        (user) =>
          (tab === 'all' ||
            (tab === 'clients' && user.role === 'client') ||
            (tab === 'admins' && user.role === 'administrator') ||
            (tab === 'pending' && user.approval_status === 'pending') ||
            (tab === 'approved' && user.approval_status === 'approved') ||
            (tab === 'rejected' && user.approval_status === 'rejected') ||
            (tab === 'suspended' && user.approval_status === 'suspended') ||
            (tab === 'active' && user.account_status === 'active') ||
            (tab === 'inactive' && user.account_status === 'inactive') ||
            (tab === 'locked' && user.locked)) &&
          (!term ||
            `${user.email} ${user.full_name} ${user.company_name} ${user.ip}`
              .toLowerCase()
              .includes(term)),
      )
      .sort((left, right) => {
        const a =
          sort === 'name'
            ? left.full_name
            : sort === 'email'
              ? left.email
              : sort === 'status'
                ? left.approval_status
                : (left.last_login_at ?? '');
        const b =
          sort === 'name'
            ? right.full_name
            : sort === 'email'
              ? right.email
              : sort === 'status'
                ? right.approval_status
                : (right.last_login_at ?? '');
        return (a > b ? 1 : a < b ? -1 : 0) * (ascending ? 1 : -1);
      });
  }, [users, tab, query, sort, ascending]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const rows = visible.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    setPage((current) => Math.min(current, pages));
  }, [pages]);
  const sortBy = (key: typeof sort) => {
    if (key === sort) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(true);
    }
    setPage(1);
  };
  const action = async (
    user: User,
    payload: Record<string, unknown>,
    message: string,
  ) => {
    setBusy(user.id);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw Error('Supabase is not configured.');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error('Please sign in.');
      const response = await fetchSupabaseFunction(`users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || 'Unable to update user.');
      setNotice(payload.approval_status === 'approved' && body.email_delivered === false ? `${message} Approval email could not be delivered; check SES configuration.` : message);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to update user.',
      );
    } finally {
      setBusy(null);
    }
  };
  const heading = (label: string, key: typeof sort) => (
    <button
      className="statement-sort"
      type="button"
      onClick={() => sortBy(key)}
    >
      {label} {sort === key ? (ascending ? 'â†‘' : 'â†“') : 'â†•'}
    </button>
  );
  const tabButton = (value: Tab, label: string, count: number) => (
    <button
      className={tab === value ? 'active' : ''}
      onClick={() => {
        setTab(value);
        setPage(1);
      }}
    >
      {label} ({count})
    </button>
  );
  return (
    <main className="procedure-page users-page">
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Users</b>
          </p>
          <div className="top-profile">
            <span>MS</span>
            <b>Administrator</b>
          </div>
        </header>
        <div className="countries-heading">
          <div>
            <h1>Users</h1>
            <p>Review client access, approvals, and account security.</p>
          </div>
          <div className="users-heading-actions"><button type="button" className="client-refresh" onClick={() => void load()} disabled={loading} data-action="refresh" title="Refresh"><ActionIcon name="refresh" /><span className="aipt-action-label">Refresh</span></button></div>
        </div>
        {notice && (
          <div className="country-toast">
            {notice}
            <button onClick={() => setNotice('')}>Ã—</button>
          </div>
        )}
        {error && <p className="country-page-error">{error}</p>}
        <section className="country-table-card">
          <nav className="statement-tabs" aria-label="User filters">
            {tabButton('all', 'All users', users.length)}
            {tabButton(
              'clients',
              'Client accounts',
              users.filter((user) => user.role === 'client').length,
            )}
            {tabButton(
              'admins',
              'Admin accounts',
              users.filter((user) => user.role === 'administrator').length,
            )}
            {tabButton(
              'pending',
              'Need approval',
              users.filter((user) => user.approval_status === 'pending').length,
            )}
            {tabButton(
              'approved',
              'Approved',
              users.filter((user) => user.approval_status === 'approved')
                .length,
            )}
            {tabButton('rejected', 'Rejected', users.filter((user) => user.approval_status === 'rejected').length)}
            {tabButton('suspended', 'Suspended', users.filter((user) => user.approval_status === 'suspended').length)}
            {tabButton(
              'active',
              'Active',
              users.filter((user) => user.account_status === 'active').length,
            )}
            {tabButton(
              'inactive',
              'Deactivated',
              users.filter((user) => user.account_status === 'inactive').length,
            )}
            {tabButton(
              'locked',
              'Locked',
              users.filter((user) => user.locked).length,
            )}
          </nav>
          <div className="users-toolbar">
            <label>
              âŒ•{' '}
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search users..."
              />
            </label>
            <span>{visible.length} users</span>
          </div>
          <div className="country-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Logo</th>
                  <th>{heading('Full name', 'name')}</th>
                  <th>Company</th>
                  <th>{heading('Email', 'email')}</th>
                  <th>IP address</th>
                  <th>{heading('Approval', 'status')}</th>
                  <th>Registration date</th>
                  <th>Account</th>
                  <th>Security</th>
                  <th>{heading('Last login', 'last')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="country-state">
                      Loading users...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((user) => (
                    <tr key={user.id}>
                      <td>
                        {user.logo_url ? (
                          <img
                            className="user-logo"
                            src={user.logo_url}
                            alt=""
                          />
                        ) : (
                          <span className="user-logo-placeholder">
                            {user.full_name.slice(0, 1).toUpperCase() || '?'}
                          </span>
                        )}
                      </td>
                      <td>
                        <b>{user.full_name || 'Unnamed user'}</b>
                        <small>{user.role}</small>
                      </td>
                      <td>{user.company_name || '-'}</td>
                      <td>{user.email}</td>
                      <td>{user.ip}</td>
                      <td>
                        <span
                          className={`statement-status ${user.approval_status}`}
                        >
                          {user.approval_status === 'pending' ? 'Need approval' : user.approval_status[0].toUpperCase() + user.approval_status.slice(1)}
                        </span>
                      </td>
                      <td>{formatDate(user.registration_date)}</td>
                      <td>
                        <span
                          className={`user-account-status ${user.account_status}`}
                        >
                          {user.account_status === 'active'
                            ? 'Active'
                            : 'Deactivated'}
                        </span>
                      </td>
                      <td>
                        {user.locked ? (
                          <span className="user-locked">Locked</span>
                        ) : (
                          `${user.failed_login_attempts}/5 attempts`
                        )}
                      </td>
                      <td>{formatDate(user.last_login_at)}</td>
                      <td>
                        <div className="user-actions">
                          <button type="button" onClick={() => setReviewUser(user)}>Review</button>
                          {user.approval_status !== 'approved' && (
                            <button
                              onClick={() =>
                                void action(
                                  user,
                                  { approval_status: 'approved' },
                                  'User approved.',
                                )
                              }
                             data-action="approve" data-icon-only="true" title="Approve"><ActionIcon name="approve" /><span className="aipt-action-label">Approve</span></button>
                          )}
                          {user.approval_status !== 'rejected' && user.role !== 'administrator' && (
                            <button
                              onClick={() =>
                                void action(
                                  user,
                                  { approval_status: 'rejected' },
                                  'User rejected.',
                                )
                              }
                            >
                              Reject
                            </button>
                          )}
                          {user.approval_status === 'approved' && user.role !== 'administrator' && <button onClick={() => void action(user, { approval_status: 'suspended' }, 'User suspended.')}>Suspend</button>}
                          <button
                            onClick={() =>
                              void action(
                                user,
                                {
                                  account_status:
                                    user.account_status === 'active'
                                      ? 'inactive'
                                      : 'active',
                                },
                                user.account_status === 'active'
                                  ? 'User deactivated.'
                                  : 'User activated.',
                              )
                            }
                          >
                            {user.account_status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                          {user.locked && (
                            <button
                              onClick={() =>
                                void action(
                                  user,
                                  { unlock: true },
                                  'Account unlocked.',
                                )
                              }
                            >
                              Unlock
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="country-state">
                      No users match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="country-pagination">
            <p>
              Showing {visible.length ? (page - 1) * pageSize + 1 : 0}-
              {Math.min(page * pageSize, visible.length)} of {visible.length}{' '}
              users
            </p>
            <label>
              Rows per page{' '}
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
            </label>
            <div>
              <button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page === 1}
              >
                â€¹
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
                disabled={page === pages}
              >
                â€º
              </button>
            </div>
          </footer>
        </section>
      </section>
      {reviewUser && <div className="company-verify-backdrop" onMouseDown={() => setReviewUser(null)}><section className="company-verify-modal" role="dialog" aria-modal="true" aria-labelledby="review-user-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="company-verify-close" onClick={() => setReviewUser(null)} aria-label="Close">×</button><span>ACCOUNT REVIEW</span><h2 id="review-user-title">{reviewUser.full_name || 'Unnamed user'}</h2><p><b>Email:</b> {reviewUser.email}</p><p><b>Company:</b> {reviewUser.company_name || '-'}</p><p><b>Registration:</b> {formatDate(reviewUser.registration_date)}</p><p><b>Status:</b> {reviewUser.approval_status}</p><div className="user-actions">{reviewUser.approval_status !== 'approved' && <button onClick={() => { setReviewUser(null); void action(reviewUser, { approval_status: 'approved' }, 'User approved.'); }} data-action="approve" title="Approve"><ActionIcon name="approve" /><span className="aipt-action-label">Approve</span></button>}{reviewUser.approval_status !== 'rejected' && <button onClick={() => { setReviewUser(null); void action(reviewUser, { approval_status: 'rejected' }, 'User rejected.'); }}>Reject</button>}<button type="button" onClick={() => setReviewUser(null)} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button></div></section></div>}
    </main>
  );
}



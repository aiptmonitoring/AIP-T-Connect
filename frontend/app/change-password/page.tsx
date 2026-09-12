'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardPreview } from '../../src/components/DashboardPreview';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirm) {
      setError('New password and confirmation must match.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError('Your verification session has expired. Request a new email code.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your verification session has expired. Request a new email code.');
        return;
      }
      const unlockResponse = await fetchSupabaseFunction('reset-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!unlockResponse.ok) {
        setError('Password changed, but the account could not be unlocked. Contact an administrator.');
        return;
      }

      router.push('/login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <form className="login-form simple-auth reset-form" onSubmit={submit}>
            <header>
              <h1>Create New Password</h1>
              <p>Please enter a new password. It must be different from your previous password.</p>
            </header>

            <label htmlFor="new-password">New Password <em>*</em></label>
            <div className="field">
              <input
                id="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={shown ? 'text' : 'password'}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="eye"
                aria-label="Toggle password visibility"
                onClick={() => setShown(!shown)}
              >
                {shown ? 'â—‰' : 'âŠ™'}
              </button>
            </div>
            <p className="password-help">Password must be at least 8 characters long.</p>

            <label htmlFor="confirm-password">Confirm New Password <em>*</em></label>
            <div className="field">
              <input
                id="confirm-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                type={shown ? 'text' : 'password'}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="eye"
                aria-label="Toggle password visibility"
                onClick={() => setShown(!shown)}
              >
                {shown ? 'â—‰' : 'âŠ™'}
              </button>
            </div>

            {error && <p className="trouble">{error}</p>}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <footer>Â© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>

        <DashboardPreview />
      </section>
    </main>
  );
}

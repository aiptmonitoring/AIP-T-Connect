'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import './login.css';
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from '../../src/lib/supabase/browser';

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getLoginErrorMessage(code?: string, message?: string) {
  if (code === 'email_not_confirmed') {
    return 'This account requires email confirmation. Disable Confirm email in Supabase Auth for password-only login.';
  }

  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit'
  ) {
    return 'Too many attempts. Please wait a moment before trying again.';
  }

  if (code === 'invalid_credentials') {
    return 'The email address or password is incorrect.';
  }

  if (code === 'otp_delivery_failed') {
    return 'Your password was verified, but the login verification email could not be sent. Please contact support or try again later.';
  }

  return message || 'Unable to log in. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepLogin, setKeepLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [loginModal, setLoginModal] = useState<{ type: 'locked' | 'invalid'; remaining: number | null } | null>(null);

  useEffect(() => {
    const message = window.sessionStorage.getItem('aipt-auth-message');
    if (message) {
      setServerError(message);
      window.sessionStorage.removeItem('aipt-auth-message');
    }
  }, []);

  const emailError = submitted && !validEmail.test(email.trim().toLowerCase());
  const passwordError = submitted && password.length === 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;

    setSubmitted(true);
    setServerError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!validEmail.test(normalizedEmail) || password.length === 0) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setServerError('Supabase is not configured.');
      return;
    }

    requestPending.current = true;
    setBusy(true);

    try {
      const response = await fetchSupabaseFunction('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok && body.session && !body.otp_required) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { shouldCreateUser: false },
        });
        if (otpError) throw otpError;
        window.sessionStorage.setItem('aipt-login-otp-mode', 'supabase-email');
        window.sessionStorage.setItem('aipt-login-otp-email', normalizedEmail);
        window.sessionStorage.removeItem('aipt-login-otp-challenge');
        router.push('/login/verify-otp');
        return;
      }

      if (!response.ok || !body.otp_required) {
        if (response.status === 423 || body.code === 'account_locked') {
          setLoginModal({ type: 'locked', remaining: 0 });
          return;
        }
        if (
          response.status === 403 &&
          body.code === 'account_pending'
        ) {
          setPendingApproval(true);
          return;
        }
        if (response.status === 401 && body.code === 'invalid_credentials') {
          setLoginModal({ type: 'invalid', remaining: body.attempts_remaining == null ? null : Number(body.attempts_remaining) });
          return;
        }
        setServerError(getLoginErrorMessage(body.code, body.error));
        return;
      }

      if (!body.challenge_id) throw new Error('The login verification challenge was not created.');
      window.sessionStorage.setItem('aipt-login-otp-mode', 'challenge');
      window.sessionStorage.setItem('aipt-login-otp-challenge', body.challenge_id);
      window.sessionStorage.setItem('aipt-login-otp-email', body.masked_email || 'your registered email');
      router.push('/login/verify-otp');
    } catch (caught) {
      setServerError(
        caught instanceof Error
          ? caught.message
          : 'Unable to determine your account role.',
      );
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="auth-page login-reference-page">
      <section className="auth-card">
        <div className="login-panel">
          <div className="brand">
            <strong>AIP&amp;T</strong>
            <span>INTELLECTUAL PROPERTY</span>
          </div>

          <form className="login-form" onSubmit={submit} noValidate>
            <header>
              <h1>Welcome Back</h1>
              <p>Glad to see you again. Log in to your account.</p>
            </header>

            <label htmlFor="email">
              Email Address <em>*</em>
            </label>
            <div className={`field ${emailError ? 'invalid' : ''}`}>
              <span className="field-icon">✉</span>
              <input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                type="email"
                autoComplete="email"
              />
            </div>
            {emailError && (
              <p className="validation">
                <b>!</b>
                <span>
                  <strong>The email address you entered is wrong!</strong>
                  <small>
                    Please enter a valid email address (e.g., name@domain.com).
                  </small>
                </span>
              </p>
            )}

            <label htmlFor="password">
              Password <em>*</em>
            </label>
            <div className={`field ${passwordError ? 'invalid' : ''}`}>
              <span className="field-icon">♙</span>
              <input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="eye"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '◉' : '⊙'}
              </button>
            </div>
            {passwordError && (
              <p className="validation">
                <b>!</b>
                <span>
                  <strong>Password is required.</strong>
                  <small>
                    Enter the password already registered for this account.
                  </small>
                </span>
              </p>
            )}

            <div className="form-options">
              <label className="check">
                <input
                  checked={keepLogin}
                  onChange={(event) => setKeepLogin(event.target.checked)}
                  type="checkbox"
                />{' '}
                <span>Remember me</span>
              </label>
              <Link href="/forgot-password">Forgot Password?</Link>
            </div>

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Logging in...' : 'Login'}
            </button>

            {((submitted && (emailError || passwordError)) || serverError) && (
              <p className="trouble">
                {serverError ||
                  'Having trouble? Please check your details and try again.'}
              </p>
            )}

            <p className="auth-link">
              Don&apos;t have an account? <Link href="/register">Register</Link>
            </p>
          </form>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>

        <aside className="login-reference-visual" aria-label="Manage your intellectual property smarter and faster"><div className="login-reference-image" role="img" aria-label="AIP&T intellectual property dashboard on a laptop in an office" /></aside>
      </section>
      {pendingApproval && (
        <div
          className="approval-modal-backdrop"
          role="presentation"
          onMouseDown={() => setPendingApproval(false)}
        >
          <section
            className="approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="approval-modal-icon">⌛</div>
            <h2 id="approval-title">Account review in progress</h2>
            <p>
              Your account still needs administrator approval. Please wait up to
              24 hours while we validate your registration.
            </p>
            <button type="button" onClick={() => setPendingApproval(false)}>
              Okay, I understand
            </button>
          </section>
        </div>
      )}
      {loginModal && <div className="approval-modal-backdrop" role="presentation" onMouseDown={() => setLoginModal(null)}><section className={`approval-modal ${loginModal.type === 'locked' ? 'login-locked-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="login-notice-title" onMouseDown={(event) => event.stopPropagation()}><div className="approval-modal-icon">{loginModal.type === 'locked' ? '🔒' : '!'}</div><h2 id="login-notice-title">{loginModal.type === 'locked' ? 'Your account has been locked' : 'Invalid credentials'}</h2><p>{loginModal.type === 'locked' ? 'Your account was locked after three failed attempts. Use Forgot Password to reset it or contact the administrator.' : loginModal.remaining === null ? 'The email address or password is incorrect. Administrator accounts are not locked after failed attempts.' : `The email address or password is incorrect. You have ${loginModal.remaining} attempt${loginModal.remaining === 1 ? '' : 's'} remaining before your account is locked.`}</p><button type="button" onClick={() => setLoginModal(null)}>{loginModal.type === 'locked' ? 'Close' : 'Try again'}</button></section></div>}
    </main>
  );
}

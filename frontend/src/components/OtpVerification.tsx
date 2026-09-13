'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthArtwork } from './AuthArtwork';
import { beginOtpRequest } from '../lib/otp-request-log';
import { getRoleDestination } from '../lib/auth/role-routing';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type Context = 'signup' | 'login' | 'recovery';
const RESEND_COOLDOWN_SECONDS = 60;

export function OtpVerification({ context }: { context: Context }) {
  const router = useRouter();
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const queryEmail = new URLSearchParams(window.location.search).get('email') || '';
    const loginEmail = context === 'login' ? window.sessionStorage.getItem('aipt-login-otp-email') || '' : '';
    const nextEmail = loginEmail || queryEmail;
    setEmail(nextEmail);
    if (context === 'login' && !nextEmail) router.replace('/login');
  }, [context, router]);

  useEffect(() => {
    if (!seconds) return;

    const intervalId = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [seconds]);

  const update = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  };

  const verify = async () => {
    if (requestPending.current) return;

    const token = digits.join('');
    if (!email || token.length !== 6) {
      setError('Enter the six-digit verification code.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    requestPending.current = true;
    setBusy(true);

    try {
      if (context === 'login') {
        const loginOtpMode = window.sessionStorage.getItem('aipt-login-otp-mode');
        const challengeId = window.sessionStorage.getItem('aipt-login-otp-challenge');
        if (loginOtpMode === 'supabase-email') {
          const { error: verificationError } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
          if (verificationError) {
            setError('The verification code is invalid or expired.');
            return;
          }
        } else if (!challengeId) {
          router.replace('/login');
          return;
        } else {
          const response = await fetchSupabaseFunction('login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challenge_id: challengeId, code: token }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || !body.session) {
            setError(body.error || 'The verification code is invalid or expired.');
            return;
          }
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: body.session.access_token,
            refresh_token: body.session.refresh_token,
          });
          if (sessionError) throw sessionError;
        }
      } else {
        const { error: verificationError } = await supabase.auth.verifyOtp({ email, token, type: context });
        if (verificationError) {
          setError('The verification code is invalid or expired.');
          return;
        }
      }

      if (context === 'recovery') {
        router.push('/change-password');
        return;
      }

      const user = (await supabase.auth.getUser()).data.user;
      const profile = user ? await supabase.from('profiles').select('company_name').eq('id', user.id).maybeSingle() : null;
      const companyName = profile?.data?.company_name?.trim() || user?.user_metadata?.company_name?.trim() || 'AIP&T';
      window.sessionStorage.removeItem('aipt-login-otp-email');
      window.sessionStorage.removeItem('aipt-login-otp-challenge');
      window.sessionStorage.removeItem('aipt-login-otp-mode');
      window.sessionStorage.setItem('aipt-welcome-message', `Welcome back ${companyName}`);
      const destination = await getRoleDestination(supabase);
      router.push(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine your account role.');
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (requestPending.current) return;
    if (!email) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    requestPending.current = true;
    setBusy(true);

    try {
      if (context === 'login') {
        const loginOtpMode = window.sessionStorage.getItem('aipt-login-otp-mode');
        if (loginOtpMode === 'supabase-email') {
          const { error: resendError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
          if (resendError) {
            setError('Unable to resend the code. Please try again.');
            return;
          }
          setError('');
          setSeconds(RESEND_COOLDOWN_SECONDS);
          return;
        }
        const challengeId = window.sessionStorage.getItem('aipt-login-otp-challenge');
        if (!challengeId) {
          router.replace('/login');
          return;
        }
        const response = await fetchSupabaseFunction('login-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge_id: challengeId, action: 'resend' }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(body.error || 'Unable to resend the code. Please try again.');
          return;
        }
        setError('');
        setSeconds(RESEND_COOLDOWN_SECONDS);
        return;
      }

      const resendMeta = context === 'signup'
        ? {
            flow: 'resend_signup' as const,
            action: 'resend' as const,
            request: () => supabase.auth.resend({ type: 'signup', email }),
          }
        : {
            flow: 'resend_recovery' as const,
            action: 'resetPasswordForEmail' as const,
            request: () => supabase.auth.resetPasswordForEmail(email),
          };

      const otpRequest = beginOtpRequest({
        flow: resendMeta.flow,
        email,
        triggeredBy: 'OtpVerification.resend',
        action: resendMeta.action,
      });

      try {
        const { data, error: resendError } = await resendMeta.request();

        otpRequest.finish({
          response: data,
          error: resendError,
        });

        if (resendError) {
          setError('Unable to resend the code. Please try again.');
          return;
        }
      } catch (caught) {
        otpRequest.finish({ error: caught });
        setError('Unable to resend the code. Please try again.');
        return;
      }

      setError('');
      setSeconds(RESEND_COOLDOWN_SECONDS);
    } finally {
      requestPending.current = false;
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

          <div className="otp-form">
            <header>
              <h1>{context === 'login' ? 'Verify your login' : 'OTP Verification'}</h1>
              <p>Enter the six-digit code sent to</p>
              <b>{email}</b>
            </header>

            <div className="otp-boxes">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputs.current[index] = element;
                  }}
                  value={digit}
                  autoFocus={index === 0}
                  onChange={(event) => update(index, event.target.value)}
                  onPaste={(event) => {
                    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    if (pasted.length !== 6) return;
                    event.preventDefault();
                    setDigits(pasted.split(''));
                    inputs.current[5]?.focus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !digit && index) inputs.current[index - 1]?.focus();
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`OTP digit ${index + 1}`}
                />
              ))}
            </div>

            <button className="primary-button" type="button" disabled={busy} onClick={verify}>
              {busy ? 'Verifying...' : 'Verify code'}
            </button>

            {error && <p className="trouble">{error}</p>}

            <button className="resend" type="button" disabled={seconds > 0 || busy} onClick={resend}>
              Resend code in <b>{`00:${String(seconds).padStart(2, '0')}`}</b>
            </button>
          </div>

          <footer>© 2026 AIP&amp;T. All rights reserved.</footer>
        </div>

        <AuthArtwork />
      </section>
    </main>
  );
}

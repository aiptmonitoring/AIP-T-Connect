'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardPreview } from '../../src/components/DashboardPreview';
import { fetchSupabaseFunction } from '../../src/lib/supabase/browser';

type VerifiedInvitation = {
  claim_id: string;
  email: string;
  company: { id: string; assigned_id: number; company_name: string };
};

export default function JoinPage() {
  const router = useRouter();
  const [verified, setVerified] = useState<VerifiedInvitation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')?.trim() || '';
    if (token.length < 32) {
      setError('This invitation link is invalid. Ask the administrator for a new invitation.');
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const response = await fetchSupabaseFunction('company-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify_invitation', invitation_code: token }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.verified) throw Error(body.error || 'This invitation is invalid or expired.');
        setVerified(body as VerifiedInvitation);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'This invitation is invalid or expired.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const continueRegistration = () => {
    if (!verified) return;
    sessionStorage.setItem('aipt-registration-invitation', JSON.stringify(verified));
    router.push('/register?invited=1');
  };

  return <main className="auth-page"><section className="auth-card"><div className="login-panel"><div className="brand"><strong>AIP&amp;T</strong><span>INTELLECTUAL PROPERTY</span></div><div className="login-form"><header><h1>Join AIP&amp;T</h1><p>Secure client invitation verification</p></header>{loading && <p className="trouble">Verifying your invitation...</p>}{error && <><p className="trouble" role="alert">{error}</p><p className="auth-link"><Link href="/login">Return to login</Link></p></>}{verified && <div className="company-verified"><b>{verified.company.company_name}</b><p>Registered email: {verified.email}</p><p>Client #{verified.company.assigned_id}</p><button className="primary-button" type="button" onClick={continueRegistration}>Create Account</button></div>}</div><footer>© 2026 AIP&amp;T. All rights reserved.</footer></div><DashboardPreview /></section></main>;
}

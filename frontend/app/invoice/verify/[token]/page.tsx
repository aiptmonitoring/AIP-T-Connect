'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchSupabaseFunction } from '../../../../src/lib/supabase/browser';
import QuotationPrintView from '../../../../src/components/QuotationPrintView';
import type { PrintableQuotation, QuotationRequirement } from '../../../../src/components/QuotationDocument';
import '../../invoice.css';
import '../../quotation-document.css';

type VerifiedQuotation = PrintableQuotation & { requirements: QuotationRequirement[] };

export default function VerifyInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<VerifiedQuotation | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setInvoice(null);
    setError('');
    const load = async () => {
      try {
        const response = await fetchSupabaseFunction('quotations/verify/' + encodeURIComponent(token));
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(body.error || 'Quotation verification failed.');
        if (!Array.isArray(body.requirements)) throw Error('The quotation verification service needs to be updated before this document can be displayed.');
        if (active) setInvoice(body);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Quotation verification failed.');
      }
    };
    if (token) void load();
    return () => { active = false; };
  }, [token]);
  if (error) return <main className="invoice-document-error"><h1>Quotation verification failed</h1><p>{error}</p></main>;
  if (!invoice) return <main className="invoice-document-error">Verifying quotation...</main>;
  return <QuotationPrintView invoice={invoice} requirements={invoice.requirements} verificationToken={token} verified />;
}

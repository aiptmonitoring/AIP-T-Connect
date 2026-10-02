'use client';

import { useEffect, useState } from 'react';
import { createQuotationQr, quotationVerificationUrl } from '../lib/quotation-qr';
import QuotationDocument, { type PrintableQuotation, type QuotationRequirement } from './QuotationDocument';

type Props = { invoice: PrintableQuotation; requirements: QuotationRequirement[]; verificationToken: string; verified?: boolean };

/** Both the signed-in PDF and the QR destination print this exact document. */
export default function QuotationPrintView({ invoice, requirements, verificationToken, verified = false }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let active = true;
    let url: string;
    try { url = quotationVerificationUrl(verificationToken); }
    catch (cause) { setQrDataUrl(''); setVerificationUrl(''); setError(cause instanceof Error ? cause.message : 'Unable to prepare verification.'); return; }
    setVerificationUrl(url);
    setQrDataUrl('');
    setError('');
    void createQuotationQr(url)
      .then(value => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setError('Unable to prepare the QR code. Reload this page to try again.'); });
    return () => { active = false; };
  }, [verificationToken]);
  const print = async () => {
    if (!qrDataUrl || !verificationUrl) return;
    setPrinting(true);
    setError('');
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.quotation-document img')).map(image => image.decode()));
      window.print();
    } catch {
      setError('A document image could not load. Reload this page before printing.');
    } finally { setPrinting(false); }
  };
  return <main className="quotation-document">
    <div className="invoice-document-actions">
      {verified && <span role="status">Quotation verified</span>}
      <button type="button" disabled={!qrDataUrl || printing} onClick={print}>{printing ? 'Preparing PDF...' : 'Download / Print PDF'}</button>
      <button type="button" onClick={() => window.close()}>Close</button>
      {error && <span role="alert">{error}</span>}
    </div>
    <QuotationDocument invoice={invoice} requirements={requirements} qrDataUrl={qrDataUrl} verificationUrl={verificationUrl} />
  </main>;
}

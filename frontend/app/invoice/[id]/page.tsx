'use client';
import { toPlainText } from '../../../src/lib/plain-text';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';
import '../invoice.css';

type Requirement = { id: string; country_id: string; procedure: string | null; description: string };
type Item = { requirement_ids?: string[]; class_numbers?: number[]; country_id: string; category: string; procedure_name: string; quantity?: number; class_input?: string | null; class_charge?: number; official_fee: number; attorney_fee: number; other_fee: number; claiming_priority?: boolean; claiming_priority_fee?: number; state_country_ids?: string[]; state_fee_total?: number; vat_rate?: number; country?: { name: string } };
type Invoice = { id: string; reference_no: string; invoice_verification_token: string; invoice_date: string; subject: string; grand_total: number; total_official_fee: number; total_attorney_fee: number; total_other_fee: number; total_vat: number; discount: number; currency: string; client_matter_ref?: string; vatable: boolean; vat_rate: number; status: string; client?: { company_name: string; address: string }; quotation_items: Item[] };

export default function InvoiceDocumentPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let active = true; const load = async () => { try { const supabase = getSupabaseBrowserClient(); if (!supabase) throw Error('Supabase is not configured.'); const { data: { session } } = await supabase.auth.getSession(); if (!session) throw Error('Please sign in.'); const response = await fetchSupabaseFunction(`quotations?page=1&page_size=100&search=${encodeURIComponent(params.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw Error(body.error || 'Unable to load invoice.'); const found = (body.data ?? []).find((item: Invoice) => item.id === params.id); if (!found) throw Error('Invoice not found or not approved.'); const lookupResponse = await fetchSupabaseFunction('quotations?lookup=true', { headers: { Authorization: `Bearer ${session.access_token}` } }); const lookupBody = await lookupResponse.json().catch(() => ({})); if (!lookupResponse.ok) throw Error(lookupBody.error || 'Unable to load invoice requirements.'); if (active) { setRequirements(lookupBody.requirements ?? []); setInvoice(found); } } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load invoice.'); } }; if (params.id) void load(); return () => { active = false; }; }, [params.id]);
  useEffect(() => {
    if (!invoice) return;
    const verificationValue = invoice.invoice_verification_token || invoice.id;
    void QRCode.toDataURL(`${window.location.origin}/invoice/verify/${verificationValue}`, { width: 190, margin: 2, errorCorrectionLevel: 'H' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [invoice]);
  if (error) return <main className="invoice-document-error">{error}</main>;
  if (!invoice) return <main className="invoice-document-error">Loading invoice...</main>;
  return <main className="invoice-document"><div className="invoice-document-actions"><button type="button" onClick={() => window.print()}>Download / Print PDF</button><button type="button" onClick={() => window.close()}>Close</button></div><article>
    <header><div><h1>CLIENT INVOICE</h1><p>Intellectual Property Services</p></div><div className="invoice-brand"><strong>QUOTATION</strong><span>PROFESSIONAL BILLING DOCUMENT</span></div></header>
    <section className="invoice-meta"><div><small>INVOICE NUMBER</small><b>{invoice.reference_no}</b></div><div><small>INVOICE DATE</small><b>{invoice.invoice_date}</b></div><div><small>CURRENCY</small><b>{invoice.currency} - US Dollar</b></div><div><small>MATTER REF.</small><b>{invoice.client_matter_ref || '-'}</b></div></section>
    <section className="invoice-client"><div><small>CLIENT</small><b>{invoice.client?.company_name || '-'}</b></div><div><small>BILL TO ADDRESS</small><span>{invoice.client?.address || '-'}</span></div></section>
    <h2>FEE DETAILS</h2><table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Official fee</th><th>Attorney fee</th><th>VAT</th>{Number(invoice.discount) > 0 && <th>Discount</th>}<th>Total (US$)</th></tr></thead><tbody>{invoice.quotation_items.map((item, index) => { const vat = invoice.vatable ? Number(item.attorney_fee) * Number(item.vat_rate ?? invoice.vat_rate) / 100 : 0; const discount = index === 0 ? Number(invoice.discount) : 0; const addonTotal = Number(item.claiming_priority_fee || 0) + Number(item.state_fee_total || 0); const total = Number(item.official_fee) + Number(item.attorney_fee) + Number(item.other_fee || 0) + Number(item.class_charge || 0) + addonTotal + vat - discount; const addons = [item.claiming_priority ? 'Claiming Priority' : '', item.state_country_ids?.length ? `States (${item.state_country_ids.length})` : ''].filter(Boolean).join(', '); return <tr key={`${item.country_id}-${index}`}><td>{String(index + 1).padStart(2, '0')}</td><td>{item.procedure_name} in {item.country?.name || '-'} {item.class_numbers?.length ? `(classes ${item.class_numbers.join(', ')})` : ''} {addons ? `· ${addons}` : ''}</td><td>{Number(item.quantity || 1)}</td><td>${Number(item.official_fee).toFixed(2)}</td><td>${Number(item.attorney_fee).toFixed(2)}</td><td>${vat.toFixed(2)}</td>{Number(invoice.discount) > 0 && <td>${discount.toFixed(2)}</td>}<td>${total.toFixed(2)}</td></tr>; })}</tbody></table>
    <section className="invoice-requirements"><h2>REQUIREMENTS</h2><table><thead><tr><th>Country</th><th>Procedure</th><th>Description</th></tr></thead><tbody>{invoice.quotation_items.flatMap((item, index) => (item.requirement_ids ?? []).map((id) => {
      const requirement = requirements.find((entry) => entry.id === id && entry.country_id === item.country_id);
      return <tr key={index + '-' + id}><td>{item.country?.name || '-'}</td><td>{item.procedure_name}</td><td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{requirement ? toPlainText(requirement.description) : 'Requirement is no longer available.'}</td></tr>;
    }))}{!invoice.quotation_items.some((item) => item.requirement_ids?.length) && <tr><td colSpan={3}>No requirements selected.</td></tr>}</tbody></table></section>
    <section className="invoice-subject"><h2>SUBJECT</h2><p>{invoice.subject || '-'}</p></section><section className="invoice-breakdown"><span>TAXABLE <b>{invoice.vatable ? 'Yes' : 'No'}</b></span><span>VAT <b>{invoice.vatable ? 'Country-specific rates' : '0%'}</b></span><span>DISCOUNT <b>${Number(invoice.discount).toFixed(2)}</b></span></section><section className="invoice-total"><span>AMOUNT DUE</span><strong>{invoice.currency} {Number(invoice.grand_total).toFixed(2)}</strong></section><section className="invoice-verification"><div className="invoice-qr-frame">{qrDataUrl ? <img src={qrDataUrl} alt="Invoice verification QR code" /> : <span className="invoice-qr-status">Preparing QR code...</span>}</div><div><h2>INVOICE VERIFICATION</h2><p>Scan the QR code to verify the invoice reference and billing summary.</p><b>Invoice: <span>{invoice.reference_no}</span></b><b>Client: <span>{invoice.client?.company_name || '-'}</span> &nbsp; Matter Ref: <span>{invoice.client_matter_ref || '-'}</span></b><b>Amount Due: <span>{invoice.currency} {Number(invoice.grand_total).toFixed(2)}</span></b></div></section><footer>Thank you for your business.<br />Please retain this invoice for your records.<b>{invoice.reference_no}</b></footer>
  </article></main>;
}
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fetchSupabaseFunction } from '../../../../src/lib/supabase/browser';
import '../../invoice.css';

type Item = { country_id: string; category: string; procedure_name: string; quantity?: number; class_input?: string | null; class_charge?: number; official_fee: number; attorney_fee: number; other_fee: number; claiming_priority?: boolean; claiming_priority_fee?: number; state_fee_total?: number; state_country_ids?: string[]; vat_rate?: number; country?: { name: string } };
type Invoice = { reference_no: string; invoice_date: string; subject: string; grand_total: number; total_official_fee: number; total_attorney_fee: number; total_other_fee: number; total_vat: number; discount: number; currency: string; client_matter_ref?: string; vatable: boolean; vat_rate: number; client?: { company_name: string; address: string }; quotation_items: Item[] };

export default function VerifyInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; const load = async () => { try { const response = await fetchSupabaseFunction(`quotations/verify/${encodeURIComponent(token)}`); const body = await response.json().catch(() => ({})); if (!response.ok) throw Error(body.error || 'Invoice verification failed.'); if (active) setInvoice(body); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Invoice verification failed.'); } }; if (token) void load(); return () => { active = false; }; }, [token]);
  useEffect(() => {
    if (!invoice) return;
    const createDownload = async () => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let y = 790;
      const write = (value: string, size = 11, strong = false) => {
        page.drawText(value.slice(0, 105), { x: 42, y, size, font: strong ? bold : font });
        y -= size + 10;
      };
      write('INVOICE VERIFIED', 22, true);
      write(`Invoice: ${invoice.reference_no}`, 11, true);
      write(`Client: ${invoice.client?.company_name || '-'}`);
      write(`Date: ${invoice.invoice_date}`);
      y -= 8;
      write('FEE DETAILS', 14, true);
      invoice.quotation_items.forEach((item) => {
        const addons = Number(item.class_charge || 0) + Number(item.claiming_priority_fee || 0) + Number(item.state_fee_total || 0);
        const vat = invoice.vatable ? Number(item.attorney_fee) * Number(item.vat_rate ?? invoice.vat_rate) / 100 : 0;
        const total = Number(item.official_fee) + Number(item.attorney_fee) + Number(item.other_fee || 0) + addons + vat;
          write(`${item.procedure_name} in ${item.country?.name || '-'}: ${invoice.currency} ${total.toFixed(2)}`);
      });
      write(`AMOUNT DUE: ${invoice.currency} ${Number(invoice.grand_total).toFixed(2)}`, 15, true);
      const bytes = await pdf.save();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.reference_no || 'invoice'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    };
    void createDownload();
  }, [invoice]);

  if (error) return <main className="invoice-document-error"><h1>Invoice verification failed</h1><p>{error}</p></main>;
  if (!invoice) return <main className="invoice-document-error">Verifying invoice...</main>;
  return <main className="invoice-document"><article><header><div><h1>INVOICE VERIFIED</h1><p>Intellectual Property Services</p></div><div className="invoice-brand"><strong>VERIFIED</strong><span>OFFICIAL BILLING RECORD</span></div></header><section className="invoice-meta"><div><small>INVOICE NUMBER</small><b>{invoice.reference_no}</b></div><div><small>INVOICE DATE</small><b>{invoice.invoice_date}</b></div><div><small>CURRENCY</small><b>{invoice.currency} - US Dollar</b></div><div><small>MATTER REF.</small><b>{invoice.client_matter_ref || '-'}</b></div></section><section className="invoice-client"><div><small>CLIENT</small><b>{invoice.client?.company_name || '-'}</b></div><div><small>BILL TO ADDRESS</small><span>{invoice.client?.address || '-'}</span></div></section><h2>FEE DETAILS</h2><table><thead><tr><th>#</th><th>Description</th><th>Official fee</th><th>Attorney fee</th><th>VAT</th>{Number(invoice.discount) > 0 && <th>Discount</th>}<th>Total</th></tr></thead><tbody>{invoice.quotation_items.map((item, index) => { const vat = invoice.vatable ? Number(item.attorney_fee) * Number(item.vat_rate ?? invoice.vat_rate) / 100 : 0; const discount = index === 0 ? Number(invoice.discount) : 0; const total = Number(item.official_fee) + Number(item.attorney_fee) + Number(item.other_fee || 0) + vat - discount; return <tr key={`${item.country_id}-${index}`}><td>{String(index + 1).padStart(2, '0')}</td><td>{item.procedure_name} in {item.country?.name || '-'} {item.class_input ? `(classes ${item.class_input})` : ''}</td><td>${Number(item.official_fee).toFixed(2)}</td><td>${Number(item.attorney_fee).toFixed(2)}</td><td>${vat.toFixed(2)}</td>{Number(invoice.discount) > 0 && <td>${discount.toFixed(2)}</td>}<td>${total.toFixed(2)}</td></tr>; })}</tbody></table><section className="invoice-subject"><h2>SUBJECT</h2><p>{invoice.subject || '-'}</p></section><section className="invoice-breakdown"><span>TAXABLE <b>{invoice.vatable ? 'Yes' : 'No'}</b></span><span>VAT <b>Country-specific rates</b></span><span>DISCOUNT <b>${Number(invoice.discount).toFixed(2)}</b></span></section><section className="invoice-total"><span>AMOUNT DUE</span><strong>{invoice.currency} {Number(invoice.grand_total).toFixed(2)}</strong></section><p className="verified-note">This invoice was verified from the official billing record.</p></article></main>;
}

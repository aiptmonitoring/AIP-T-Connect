import { toPlainText } from '../lib/plain-text';

export type QuotationRequirement = { id: string; country_id: string; procedure: string | null; description: string };
export type QuotationItem = { requirement_ids?: string[]; class_numbers?: number[]; class_count?: number; country_id: string; procedure_name: string; quantity?: number; official_fee: number; attorney_fee: number; other_fee: number; claiming_priority_fee?: number; state_fee_total?: number; vat_rate?: number; country?: { name: string } };
export type PrintableQuotation = { valid_until?: string | null; reference_no: string; invoice_date: string; grand_total: number; total_vat: number; discount: number; currency: string; client_matter_ref?: string; vatable: boolean; vat_rate: number; client?: { company_name: string; address: string }; quotation_items: QuotationItem[] };
const amount = (value: number) => (value === 0 ? 0 : value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : value;
};

/** Saved fees already include quantity and classes. Never multiply them again. */
export function quotationRow(item: QuotationItem, invoice: PrintableQuotation, index: number) {
  const multiplier = Math.max(1, Number(item.quantity || 1)) * Math.max(1, item.class_numbers?.length || item.class_count || 0);
  const extras = Number(item.other_fee || 0) + Number(item.claiming_priority_fee || 0) + Number(item.state_fee_total || 0);
  const discount = index === 0 ? Number(invoice.discount) : 0;
  const vat = invoice.vatable ? Number(item.attorney_fee) * Number(item.vat_rate ?? invoice.vat_rate) / 100 : 0;
  return { multiplier, extras, discount, vat, total: Number(item.official_fee) + Number(item.attorney_fee) + extras - discount };
}

export default function QuotationDocument({ invoice, requirements, qrDataUrl }: { invoice: PrintableQuotation; requirements: QuotationRequirement[]; qrDataUrl: string }) {
  const symbol = invoice.currency === 'USD' ? '$' : invoice.currency;
  return <article className="quotation-sheet">
    <header className="quotation-heading">
      <h1>Quotation</h1>
      <div className="quotation-verification">
        <div className="quotation-qr">{qrDataUrl ? <img src={qrDataUrl} alt="Quotation verification QR code" /> : <span>Preparing QR code...</span>}</div>
        <div><h2>QUOTATION VERIFICATION</h2><p>Scan the QR code to verify the quotation<br />reference and billing summary.</p></div>
      </div>
    </header>
    <section className="quotation-parties">
      <div className="quotation-sender"><h2>AIPT for Trademark Registration Agents</h2><p>Building No.58<br />Salah Aldin Street, Office 3, Plot 6 - Jibla Kuwait<br />Email: Info@aiptlaw.com</p>
        <div className="quotation-recipient" aria-label="Quotation recipient"><p>{toPlainText(invoice.client?.company_name) || '-'}</p><p>{toPlainText(invoice.client?.address) || '-'}</p></div>
      </div>
      <dl className="quotation-meta"><div><dt>Date:</dt><dd>{date(invoice.invoice_date)}</dd></div><div><dt>Ref# Number:</dt><dd>{invoice.reference_no}</dd></div><div><dt>Client Reference:</dt><dd>{invoice.client_matter_ref || '-'}</dd></div><div><dt>Valid Until:</dt><dd>{invoice.valid_until ? new Date(invoice.valid_until).toLocaleDateString('en-US', { timeZone: 'Asia/Kuwait' }) : 'Not yet available'}</dd></div></dl>
    </section>
    <section className="quotation-requirements"><h3 className="quotation-tab">REQUIREMENTS</h3><table><colgroup><col style={{ width: '22%' }} /><col style={{ width: '25%' }} /><col /></colgroup><thead><tr><th>Country</th><th>Procedure</th><th>Description</th></tr></thead><tbody>
      {invoice.quotation_items.flatMap((item, index) => (item.requirement_ids ?? []).map(id => {
        const requirement = requirements.find(entry => entry.id === id && entry.country_id === item.country_id);
        return <tr key={`${index}-${id}`}><td>{item.country?.name || '-'}</td><td>{item.procedure_name}</td><td>{requirement ? toPlainText(requirement.description) : 'Requirement is no longer available.'}</td></tr>;
      }))}
      {!invoice.quotation_items.some(item => item.requirement_ids?.length) && <tr><td colSpan={3}>No requirements selected.</td></tr>}
    </tbody></table></section>
    <section className="quotation-fees"><h3 className="quotation-tab">FEE DETAILS</h3><table><colgroup>{[19, 8, 9.5, 14.5, 15, 10.5, 10, 13.5].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th>Procedure<br />(procedure)</th><th>Qty</th><th>No. of<br />classes</th><th>Official Fees<small>“per mark per class”</small></th><th>Attorney Fees<small>“per mark per class”</small></th><th>discount<small>line amount</small></th><th>vat<small>line amount</small></th><th>TOTAL ({invoice.currency === 'USD' ? 'US$' : invoice.currency})<small>before VAT</small></th></tr></thead><tbody>
      {invoice.quotation_items.map((item, index) => {
        const row = quotationRow(item, invoice, index);
        return <tr key={`${item.country_id}-${index}`}><td><strong>{item.procedure_name}</strong><br />({item.country?.name || '-'}){row.extras !== 0 && <small>Additional fees: {amount(row.extras)}</small>}</td><td>{item.quantity || 1}</td><td>{item.class_numbers?.length || item.class_count || '-'}</td><td>{amount(Number(item.official_fee) / row.multiplier)}</td><td>{amount(Number(item.attorney_fee) / row.multiplier)}</td><td>{amount(-row.discount)}</td><td>{amount(row.vat)}</td><td>{amount(row.total)}</td></tr>;
      })}
    </tbody></table></section>
    <div className="quotation-ending"><section className="quotation-totals"><div><span>Sub Total</span><strong>{symbol} {amount(Number(invoice.grand_total) - Number(invoice.total_vat))}</strong></div><div><span>Total VAT</span><strong>{symbol} {amount(Number(invoice.total_vat))}</strong></div><div className="quotation-due"><span>Total amount due</span><strong>{symbol} {amount(Number(invoice.grand_total))}</strong></div></section>
    <footer className="quotation-offices" aria-label="AIPT offices: Saudi Arabia, UAE, Bahrain, Kuwait, Oman, Lebanon, Egypt, Sudan, Tanzania, Azerbaijan, India and China"><img src="/images/quotation-reference.png" alt="AIPT regional offices and contact details from the supplied quotation artwork" /></footer></div>
  </article>;
}

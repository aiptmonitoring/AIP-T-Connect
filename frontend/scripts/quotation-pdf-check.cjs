/* Render the production component with explicit test fixtures; no account data is used. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const QRCode = require('qrcode');
const root = path.resolve(__dirname, '..');
for (const extension of ['.tsx', '.ts']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText.replace('"use strict";', extension === '.tsx' ? '"use strict"; const React = require("react");' : '"use strict";'), filename);
};
const { default: Document, quotationRow, quotationRequirementRows } = require('../src/components/QuotationDocument.tsx');
const output = path.resolve(root, '../output/pdf');
const tmp = path.resolve(root, '../tmp/pdfs');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });
const invoice = { reference_no: 'T-2026-6020-AF', invoice_date: '2026-09-12', valid_until: '2026-10-16T09:00:00.000Z', client_matter_ref: '1212', currency: 'USD', grand_total: 2842, total_vat: 72, discount: 50, vatable: true, vat_rate: 10, client: { company_name: 'PDF Layout Test Client', address: 'Example address - layout validation only' }, quotation_items: [{ country_id: 'af', procedure_name: 'Renewal', quantity: 2, class_numbers: [1, 2, 3], official_fee: 2100, attorney_fee: 720, other_fee: 0, vat_rate: 10, requirement_ids: ['r1'], country: { name: 'Afghanistan' } }] };
const row = quotationRow(invoice.quotation_items[0], invoice, 0);
assert.equal(row.total, 2770);
assert.equal(row.vat, 72);
assert.equal(invoice.quotation_items[0].official_fee / row.multiplier, 350);
assert.equal(invoice.quotation_items[0].attorney_fee / row.multiplier, 120);
assert.equal(quotationRow({ ...invoice.quotation_items[0], other_fee: 20, claiming_priority_fee: 30, state_fee_total: 40 }, invoice, 0).total, 2860);
assert.equal(quotationRow(invoice.quotation_items[0], { ...invoice, vatable: false }, 1).vat, 0);
const requirementFixtures = [
  { id: 'selected', country_id: 'af', procedure: 'Renewal', category: 'Trademark', description: 'Selected requirement' },
  { id: 'applicable', country_id: 'af', procedure: 'Renewal', category: 'Trademark', description: 'Applicable requirement' },
  { id: 'other-country', country_id: 'other', procedure: 'Renewal', category: 'Trademark', description: 'Wrong country' },
  { id: 'other-procedure', country_id: 'af', procedure: 'Filing', category: 'Trademark', description: 'Wrong procedure' },
  { id: 'other-service', country_id: 'af', procedure: 'Renewal', category: 'Patent', description: 'Wrong service' },
];
const itemFixture = { ...invoice.quotation_items[0], category: 'Trademark', requirement_ids: [] };
assert.deepEqual(quotationRequirementRows({ ...invoice, quotation_items: [itemFixture] }, requirementFixtures).map(row => row.description), ['Selected requirement', 'Applicable requirement']);
assert.equal(quotationRequirementRows({ ...invoice, quotation_items: [itemFixture, itemFixture] }, requirementFixtures).length, 2);
assert.deepEqual(quotationRequirementRows({ ...invoice, quotation_items: [{ ...itemFixture, requirement_ids: ['selected'] }] }, requirementFixtures).map(row => row.description), ['Selected requirement']);
assert.match(quotationRequirementRows({ ...invoice, quotation_items: [{ ...itemFixture, requirement_ids: ['other-country'] }] }, requirementFixtures)[0].description, /no longer available/);
assert.equal(quotationRequirementRows({ ...invoice, quotation_items: [itemFixture] }, []).length, 0);
const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
const styles = [...layout.matchAll(/import '\.\/(.+\.css)'/g)].map(match => fs.readFileSync(path.join(root, 'app', match[1]), 'utf8')).join('\n') + fs.readFileSync(path.join(root, 'app/invoice/invoice.css'), 'utf8') + fs.readFileSync(path.join(root, 'app/invoice/quotation-document.css'), 'utf8');
async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1170, height: 1500 }, deviceScaleFactor: 1 });
    const qrDataUrl = await QRCode.toDataURL('https://example.invalid/invoice/verify/test-fixture', { width: 250, margin: 2, errorCorrectionLevel: 'H' });
    for (const variant of ['reference', 'compact', 'long']) {
      const data = variant === 'reference' ? invoice : variant === 'compact' ? { ...invoice, quotation_items: Array.from({ length: 4 }, () => ({ ...invoice.quotation_items[0] })), grand_total: 11518, total_vat: 288 } : { ...invoice, quotation_items: Array.from({ length: 12 }, (_, i) => ({ ...invoice.quotation_items[0], requirement_ids: ['r' + i], procedure_name: 'Renewal and registration of international trademarks' })), grand_total: 34654, total_vat: 864 };
      const requirements = variant !== 'long' ? [{ id: 'r1', country_id: 'af', procedure: 'Renewal', description: 'Signed power of attorney.\nCopy of the trademark registration certificate.' }] : data.quotation_items.map((item, i) => ({ id: 'r' + i, country_id: 'af', procedure: item.procedure_name, description: 'Provide a signed power of attorney and the registration certificate.\n' + 'Long requirement text to verify wrapping and printed pagination. '.repeat(5) }));
      let markup = renderToStaticMarkup(React.createElement(Document, { invoice: data, requirements, qrDataUrl }));
      markup = markup.replace(/src="(\/images\/[^"]+)"/g, (_, src) => 'src="data:image/' + (src.endsWith('.svg') ? 'svg+xml' : 'png') + ';base64,' + fs.readFileSync(path.join(root, 'public', src)).toString('base64') + '"');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body><main class="quotation-document">${markup}</main></body></html>`;
      fs.writeFileSync(path.join(tmp, variant + '.html'), html);
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
      assert.equal(await page.locator('.quotation-office').count(), 16);
      for (const section of ['.quotation-requirements', '.quotation-fees']) {
        const colors = await page.locator(section).evaluate(el => [getComputedStyle(el.querySelector('th')).backgroundColor, getComputedStyle(el.querySelector('td')).backgroundColor]);
        assert.equal(colors[0], colors[1], 'Table headers match their body background');
      }
      assert.equal(await page.locator('.quotation-requirements tbody tr').count(), requirements.length);
      const overflows = await page.locator('.quotation-sheet th,.quotation-sheet td,.quotation-meta dd,.quotation-totals,.quotation-due,.quotation-parties,.quotation-sender,.quotation-office p span,.quotation-office h4').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent));
      assert.deepEqual(overflows, [], 'No overflowing table or metadata cells');
      await page.locator('.quotation-document').screenshot({ path: path.join(tmp, variant + '.png') });
      const pdfBytes = await page.pdf({ path: path.join(variant === 'reference' ? output : tmp, `quotation-${variant}-preview.pdf`), printBackground: true, preferCSSPageSize: true });
      const pdf = await require('pdf-lib').PDFDocument.load(pdfBytes);
      if (variant !== 'long') assert.equal(pdf.getPageCount(), 1, 'Standard quotations fit one A4 page');
      console.log(`${variant}: ${pdf.getPageCount()} A4 page(s); no overflowing table cells`);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

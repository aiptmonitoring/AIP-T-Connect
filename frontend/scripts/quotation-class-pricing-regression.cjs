const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../../backend/supabase/functions/_shared/quotation-class-pricing.ts'), 'utf8');
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { calculateClassPricing: calculate, availableClassTypes, ordinal } = sandbox.exports;
const base = { official_fee: 100, attorney_fee: 50, total_fee: 160, currency: 'USD' };
const rates = ['Multi-class', 'Up to 3 classes', 'Up to 5 classes'].flatMap(type => Array.from({ length: 45 }, (_, i) => ({ country_id: 'a', class_type: type, class_number: i + 1, official_fee: i < (type === 'Up to 5 classes' ? 5 : type === 'Up to 3 classes' ? 3 : 1) ? 20 : i + 1, attorney_fee: 10, total_fee: (i < (type === 'Up to 5 classes' ? 5 : type === 'Up to 3 classes' ? 3 : 1) ? 20 : i + 1) + 10, currency: 'USD' })));
let checks = 0;
for (const count of [1, 2, 3, 4, 5, 6, 45]) {
  const perMark = calculate(base, 'a', 'Per mark per class', count, rates);
  assert.equal(perMark.total_fee, 160 * count); assert.equal(perMark.rows.length, count); checks++;
  for (const type of ['Multi-class', 'Up to 3 classes', 'Up to 5 classes']) {
    const bundle = type === 'Multi-class' ? 1 : type === 'Up to 3 classes' ? 3 : 5;
    const result = calculate(base, 'a', type, count, rates);
    const expected = 160 + rates.filter(rate => rate.class_type === type && rate.class_number >= 2 && rate.class_number <= count).reduce((sum, rate) => sum + rate.total_fee, 0);
    assert.equal(result.total_fee, expected, type + ' / ' + count);
    assert.equal(result.rows.length, 1 + (bundle > 1 && count > 1 ? 1 : 0) + Math.max(0, count - bundle));
    assert.equal(result.rows[0].class_to, 1); assert.equal(result.rows[0].source, 'Trademark');
    assert.equal(result.rows.at(-1).class_to, count); checks++;
  }
}
for (const count of [0, -1, 46, 1.5, NaN]) { assert.throws(() => calculate(base, 'a', 'Multi-class', count, rates), /whole-number/); checks++; }
assert.throws(() => calculate(base, 'a', 'invalid', 1, rates), /available type/); checks++;
assert.throws(() => calculate(base, 'b', 'Multi-class', 1, rates), /not available/); checks++;
assert.throws(() => calculate(base, 'a', 'Multi-class', 3, rates.filter(rate => rate.class_number !== 3)), /3rd class.*no published rate/); checks++;
assert.throws(() => calculate(base, 'a', 'Multi-class', 2, [...rates, rates[1]]), /multiple/); checks++;
assert.equal(calculate(base, 'a', 'Up to 3 classes', 3, rates.map(rate => rate.class_type === 'Up to 3 classes' && rate.class_number === 2 ? { ...rate, attorney_fee: 5, total_fee: 25 } : rate)).attorney_fee, 65); checks++;
for (const value of [null, NaN, -1, '10']) { assert.throws(() => calculate({ ...base, official_fee: value }, 'a', 'Per mark per class', 1, rates), /complete/); checks++; }
assert.throws(() => calculate({ ...base, available: false }, 'a', 'Multi-class', 1, rates), /unavailable/); checks++;
assert.equal(calculate({ ...base, official_fee: 0.1, attorney_fee: 0.2, total_fee: 0.3 }, 'a', 'Per mark per class', 3, rates).total_fee, 0.9); checks++;
assert.equal(availableClassTypes([], rates, []).length, 0); checks++;
assert.equal(availableClassTypes(['a'], rates, ['a']).length, 4); checks++;
assert.equal(availableClassTypes(['a', 'b'], rates, ['a', 'b']).join(','), 'Per mark per class'); checks++;
assert.equal([1, 2, 3, 11, 12, 13, 21, 45].map(ordinal).join(','), '1st,2nd,3rd,11th,12th,13th,21st,45th'); checks++;
// Exercise the real server resolver with database doubles: client prices are ignored.
const serverSource = fs.readFileSync(path.resolve(__dirname, '../../backend/supabase/functions/quotations/index.ts'), 'utf8').replace(/^import .*;$/gm, '') + '\nexports.resolveItems = resolveItems;';
const tables = {
  fee_dataset_versions: [{ id: 'v1' }],
  procedures: [{ id: 'proc', description: 'Filing', services: { service: 'Trademark' } }],
  services: [{ id: 'svc', service: 'Trademark' }],
  vat_rates: [{ country_id: 'a', vat: 10 }],
  fee_values: [{ id: 'base', country_id: 'a', ...base, fee_services: { name: 'Filing' }, fee_categories: { name: 'Trademark' } }, ...rates.map((rate, index) => ({ id: 'r' + index, ...rate, fee_services: { name: 'Class ' + rate.class_number }, fee_categories: { name: rate.class_type } }))],
};
const db = { from(table) {
  let filtered = tables[table] || [];
  const value = (row, key) => key.split('.').reduce((o, k) => o?.[k], row);
  const query = { select() { return this; }, order() { return this; }, is() { return this; }, limit() { return this; },
    eq(key, v) { if (!['dataset_version_id', 'status'].includes(key)) filtered = filtered.filter(row => value(row, key) === v); return this; },
    in(key, values) { filtered = filtered.filter(row => values.includes(value(row, key))); return this; },
    async range(from, to) { return { data: filtered.slice(from, to + 1) }; },
    async maybeSingle() { return { data: filtered[0] || null }; },
    then(resolve) { return Promise.resolve({ data: filtered }).then(resolve); },
  }; return query;
} };
const server = { ...sandbox.exports, exports: {}, Deno: { serve() {} }, console };
vm.runInNewContext(ts.transpileModule(serverSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, server);
(async () => {
  const item = { category: 'Trademark', country_id: 'a', procedure_name: 'Filing', quantity: 2, class_type: 'Up to 3 classes', class_count: 4, class_numbers: [], official_fee: 999999, attorney_fee: 999999, class_pricing_rows: [{ total_fee: 999999 }] };
  const [result] = await server.exports.resolveItems(db, [item], 'v1');
  assert.equal(result.official_fee, 288); assert.equal(result.attorney_fee, 160); assert.equal(result.vat, 16); assert.equal(result.class_count, 4); assert.equal(result.class_pricing_rows.length, 3); checks++;
  const [numbered] = await server.exports.resolveItems(db, [{ ...item, class_numbers: [9, 25, 35, 45] }], 'v1');
  assert.equal(numbered.official_fee, result.official_fee); checks++;
  const [legacy] = await server.exports.resolveItems(db, [{ ...item, class_type: 'Multi', class_count: 2, class_numbers: [9, 45] }], 'v1');
  assert.equal(legacy.official_fee, 400); assert.equal(legacy.attorney_fee, 200); checks++;
  await assert.rejects(() => server.exports.resolveItems(db, [{ ...item, class_numbers: [9] }], 'v1'), /must match/); checks++;
  await assert.rejects(() => server.exports.resolveItems(db, [{ ...item, class_numbers: [1, 1, 2, 3] }], 'v1'), /whole numbers/); checks++;
  await assert.rejects(() => server.exports.resolveItems(db, [item], 'stale'), /Published fees changed/); checks++;
  await assert.rejects(() => server.exports.resolveItems(db, [{ ...item, class_count: 0 }], 'v1'), /whole-number/); checks++;
  const documentSource = fs.readFileSync(path.resolve(__dirname, '../src/components/QuotationDocument.tsx'), 'utf8').replace(/^import .*;$/gm, '');
  const printable = { ...sandbox.exports, exports: {}, React: require('react'), toPlainText: value => String(value || '') };
  vm.runInNewContext(ts.transpileModule(documentSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, printable);
  const invoice = { reference_no: 'TEST', invoice_date: '2026-09-21', grand_total: 92, total_vat: 4, discount: 0, currency: 'USD', vatable: true, vat_rate: 10, quotation_items: [result] };
  assert.equal(printable.exports.quotationRow(result, invoice, 0).multiplier, 2); checks++;
  const markup = require('react-dom/server').renderToStaticMarkup(require('react').createElement(printable.exports.default, { invoice, requirements: [], qrDataUrl: '' }));
  assert.ok(markup.includes("Fees: Trademark")); assert.ok(markup.includes("Additional 2nd to 3rd classes")); assert.match(markup, /Up to 3 classes/); checks++;
  const selected = [1, 2, 5, 7, 9, 15, 30];
  const priced = calculate(base, 'a', 'Up to 5 classes', selected.length, rates);
  const details = sandbox.exports.quotationDisplayRows({ quantity: 1, class_numbers: selected, class_count: 7, class_pricing_rows: priced.rows, official_fee: priced.official_fee, attorney_fee: priced.attorney_fee, other_fee: priced.total_fee - priced.official_fee - priced.attorney_fee }, 10);
  assert.equal(JSON.stringify(details.map(line => line.class_numbers)), JSON.stringify([[1], [2, 5, 7, 9], [15], [30]])); checks++;
  assert.equal(details.map(line => line.quantity).join(','), '1,4,1,1'); checks++;
  assert.equal(details.map(line => line.source).join(','), 'Trademark,Up to 5 classes,Up to 5 classes,Up to 5 classes'); checks++;
  assert.equal(details.reduce((sum, line) => sum + line.official_fee, 0), priced.official_fee); checks++;
  assert.equal(details.reduce((sum, line) => sum + line.attorney_fee, 0), priced.attorney_fee); checks++;
  const vatRounded = sandbox.exports.quotationDisplayRows({ quantity: 1, class_numbers: [], class_pricing_rows: [{ class_from: 1, class_to: 1, official_fee: 0, attorney_fee: 0.05, total_fee: 0.05 }, { class_from: 2, class_to: 2, official_fee: 0, attorney_fee: 0.05, total_fee: 0.05 }], official_fee: 0, attorney_fee: 0.1, other_fee: 0 }, 10);
  assert.equal(vatRounded.reduce((sum, line) => sum + line.vat, 0), 0.01); checks++;
  const smallRows = Array.from({ length: 4 }, (_, index) => ({ class_from: index + 1, class_to: index + 1, official_fee: 0, attorney_fee: 0.05, total_fee: 0.05 }));
  const smallVat = sandbox.exports.quotationDisplayRows({ quantity: 1, class_numbers: [], class_pricing_rows: smallRows, official_fee: 0, attorney_fee: 0.2, other_fee: 0 }, 10);
  assert.ok(smallVat.every(row => row.vat >= 0)); assert.equal(smallVat.reduce((sum, row) => sum + row.vat, 0), 0.02); checks++;
  console.log(checks + ' class-pricing, server and invoice regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

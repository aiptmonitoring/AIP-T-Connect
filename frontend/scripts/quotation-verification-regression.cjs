const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../../backend/supabase/functions/quotations/index.ts'), 'utf8');
const helper = source.slice(source.indexOf('async function allRows('), source.indexOf('function feePricing('));
const sandbox = { exports: {}, toPlainText: value => String(value).replace(/<[^>]+>/g, '') };
vm.runInNewContext(ts.transpileModule(helper + '\nexports.load = loadQuotationRequirements;', { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const row = (id, country = 'cy', procedure = 'Registration', category = 'Trademark') => ({ id, country_id: country, description: '<p>' + id + '</p>', procedures: { description: procedure, services: { service: category } } });
const rows = [row('chosen'), row('other'), row('wrong-country', 'af'), row('wrong-procedure', 'cy', 'Renewal'), row('wrong-service', 'cy', 'Registration', 'Patent')];
const calls = [];
const db = { from(table) {
  assert.equal(table, 'requirements');
  return { select() { return this; }, in(column, values) { calls.push([column, Array.from(values)]); return this; }, is(column, value) { assert.equal(column, 'deleted_at'); assert.equal(value, null); return this; }, order() { return this; }, async range() { return { data: rows, error: null }; } };
} };
(async () => {
  const item = { country_id: 'cy', procedure_name: 'Registration', category: 'Trademark', requirement_ids: ['chosen'] };
  const selected = await sandbox.exports.load(db, [item]);
  assert.equal(JSON.stringify(selected), JSON.stringify([{ id: 'chosen', country_id: 'cy', procedure: 'Registration', category: 'Trademark', description: 'chosen' }]));
  const fallback = await sandbox.exports.load(db, [{ ...item, requirement_ids: [] }]);
  assert.equal(fallback.map(r => r.id).join(','), 'chosen,other');
  assert.equal((await sandbox.exports.load(db, [{ ...item, requirement_ids: ['wrong-country', 'wrong-procedure', 'wrong-service'] }])).length, 0);
  assert.equal((await sandbox.exports.load(db, [item, item])).length, 1);
  assert.equal((await sandbox.exports.load(db, [])).length, 0);
  assert.ok(calls.every(([column, countries]) => column === 'country_id' && countries.join(',') === 'cy'));
  assert.ok(source.indexOf("lookup.eq('status', 'Approved').is('deleted_at', null)") < source.indexOf('requirements: await loadQuotationRequirements(db, data.quotation_items'));
  console.log('Passed: QR requirements are scoped by country, procedure, service and selection; fallback and duplicate handling; approved record guard.');
})().catch(error => { console.error(error); process.exitCode = 1; });

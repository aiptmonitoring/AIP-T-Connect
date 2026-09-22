// Uses isolated fixture responses only; never submits a real quotation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const envText = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
const supabaseUrl = envText.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
const ref = new URL(supabaseUrl).hostname.split('.')[0];
const base = { official_fee: 100, attorney_fee: 50, total_fee: 150, currency: 'USD', available: true };
const lookup = {
  role: 'administrator', fee_dataset: { id: 'fixture-v1', version_number: 1, published_at: null },
  clients: [{ id: 'client', assigned_id: 1, company_name: 'Class Pricing Test Client', status: 'Active', country_id: 'a', address: 'Test address' }],
  services: [{ id: 'service', name: 'Trademark', category: '', description: 'Trademark' }], projects: [],
  countries: [{ id: 'a', name: 'Test Country A', abbreviation: 'AA', flag_url: '' }, { id: 'b', name: 'Test Country B', abbreviation: 'BB', flag_url: '' }],
  procedures: [{ id: 'filing', name: 'Filing', category: 'Trademark' }, { id: 'renewal', name: 'Renewal', category: 'Trademark' }], requirements: [],
  fees: ['a', 'b'].flatMap(country_id => ['Filing', 'Renewal'].map(procedure_name => ({ ...base, id: country_id + procedure_name, country_id, category: 'Trademark', procedure_name }))),
  class_rates: ['Multi-class', 'Up to 3 classes', 'Up to 5 classes'].flatMap(class_type => Array.from({ length: 45 }, (_, index) => ({ ...base, official_fee: 20, attorney_fee: 10, total_fee: 30, country_id: 'a', class_type, class_number: index + 1 }))),
  vat_rates: [{ country_id: 'a', vat: 10 }], claiming_priority_fees: [], state_fees: [], aripo_country_ids: [],
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const failures = []; page.on('pageerror', error => failures.push(error.message));
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'fixture-user', exp: expires })).toString('base64url') + '.fixture-signature';
  await page.addInitScript(({ key, token, expires }) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: expires, expires_in: 3600, user: { id: 'fixture-user', email: 'fixture@example.invalid' } })), { key: 'sb-' + ref + '-auth-token', token, expires });
  await page.route(supabaseUrl + '/**', async route => {
    const url = new URL(route.request().url());
    assert.equal(route.request().method() === 'POST' && url.pathname.endsWith('/quotations'), false, 'No live save is allowed in this test');
    const body = url.pathname.endsWith('/quotations') ? (url.searchParams.get('lookup') ? lookup : { data: [], total: 0 }) : { data: [], user: { id: 'fixture-user' } };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(body) });
  });
  try {
    await page.goto((process.env.TEST_BASE_URL || 'http://localhost:3001') + '/quotations');
    await page.getByRole('button', { name: 'Add Quotation', exact: true }).click();
    await page.locator('.invoice-dialog select').first().selectOption('client');
    await page.getByPlaceholder('Search country *', { exact: true }).fill('Test Country A');
    await page.getByRole('checkbox', { name: 'Test Country A', exact: true }).check();
    await page.getByPlaceholder('Search procedure * (multiple allowed)', { exact: true }).fill('Filing');
    await page.getByRole('checkbox', { name: 'Filing', exact: true }).check();
    const type = page.locator('label').filter({ hasText: 'Type of class *' }).locator('select');
    const count = page.locator('label').filter({ hasText: 'Number of classes *' }).locator('select');
    assert.equal(await type.locator('option').count(), 5);
    for (const [mode, number, rowCount, expected] of [['Per mark per class', 45, 46, '6,750'], ['Multi-class', 4, 5, '120'], ['Up to 3 classes', 5, 4, '90'], ['Up to 5 classes', 7, 4, '90']]) {
      await type.selectOption(mode); await count.selectOption(String(number));
      await page.waitForFunction(n => document.querySelectorAll('.fee-preview tbody tr').length === n, rowCount);
      assert.equal(await page.locator('.fee-preview .class-pricing-subtotal td').last().innerText(), expected);
    }
    const output = path.resolve(__dirname, '../../tmp/quotation-class-check'); fs.mkdirSync(output, { recursive: true });
    const picker = page.locator('.trademark-class-selector');
    for (let number = 1; number <= 7; number++) await picker.getByRole('button', { name: 'Class ' + number, exact: true }).click();
    assert.equal(await picker.locator('.tm-class-button[aria-pressed="true"]').count(), 7);
    assert.equal(await count.inputValue(), '7');
    assert.equal(await picker.locator('h5').innerText(), 'Selected Classes: 7');
    assert.deepEqual(await picker.locator('dd').allTextContents(), ['5', '2']);
    await picker.getByRole('button', { name: 'Class 7', exact: true }).press('Space');
    assert.equal(await count.inputValue(), '6');
    await picker.getByRole('button', { name: 'Class 7', exact: true }).press('Space');
    await picker.screenshot({ path: path.join(output, 'trademark-class-selector-desktop.png') });
    await type.selectOption('Up to 3 classes');
    assert.deepEqual(await picker.locator('dd').allTextContents(), ['3', '4']);
    await type.selectOption('Up to 5 classes');
    await picker.getByRole('button', { name: 'View all classes', exact: true }).click();
    assert.match(await picker.locator('.tm-class-selected-list').innerText(), /Class 1, Class 2, Class 3, Class 4, Class 5, Class 6, Class 7/);
    await picker.getByRole('button', { name: 'Hide selected classes', exact: true }).click();
    await picker.getByRole('button', { name: 'Collapse class grid', exact: true }).click();
    assert.equal(await picker.locator('.tm-class-grid').isVisible(), false);
    await picker.getByRole('button', { name: 'Expand class grid', exact: true }).click();
    await picker.getByRole('button', { name: 'Select all 45 classes', exact: true }).click();
    assert.equal(await picker.locator('.tm-class-button[aria-pressed="true"]').count(), 45);
    await picker.getByRole('button', { name: 'Clear selected classes', exact: true }).click();
    assert.equal(await picker.locator('.tm-class-button[aria-pressed="true"]').count(), 0);
    for (let number = 1; number <= 7; number++) await picker.getByRole('button', { name: 'Class ' + number, exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await picker.screenshot({ path: path.join(output, 'trademark-class-selector-mobile.png') });
    assert.equal(await picker.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'Picker must not overflow on mobile');
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.locator('.fee-preview').screenshot({ path: path.join(output, 'bundled-preview.png') });
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    assert.equal(await page.locator('.invoice-cart-table tbody tr').count(), 1);
    assert.match(await page.locator('.invoice-cart-table tbody').innerText(), /Up to 5 classes/);
    await page.locator('.cart-row-actions button[title="Edit"]').click();
    assert.equal(await type.inputValue(), 'Up to 5 classes'); assert.equal(await count.inputValue(), '7');
    await page.locator('.cart-number').fill('2');
    await page.getByRole('button', { name: 'Update cart item', exact: true }).click();
    assert.equal(await page.locator('.invoice-cart-table tbody tr').count(), 1);
    assert.match(await page.locator('.invoice-cart-table tbody').innerText(), /\$120/);
    assert.match(await page.locator('.invoice-cart-table tbody').innerText(), /\$60/);
    // Country change clears the old class mode and excludes unsupported types.
    await page.getByPlaceholder('Search country', { exact: true }).fill('Test Country B');
    await page.getByRole('checkbox', { name: 'Test Country B', exact: true }).check();
    assert.equal(await type.inputValue(), ''); assert.equal(await type.locator('option').count(), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Fee Selection', exact: true }).click();
    await type.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, 'mobile-form.png') });
    assert.equal(failures.length, 0, failures.join('\n'));
    console.log('Browser fixture checks passed: all four modes, 45 classes, bundle totals, cart edit/quantity, country filtering, mobile rendering.');
  } catch (error) { console.log((await page.locator("body").innerText()).slice(0,9000)); throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

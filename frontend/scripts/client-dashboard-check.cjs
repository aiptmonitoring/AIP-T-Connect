/* Browser checks use synthetic account and API fixtures, never real client data. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'));
const origin = process.env.CHECK_ORIGIN || 'http://localhost:3000';
const service = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const out = path.resolve(__dirname, '../../tmp/dashboard-check');
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'info@example.invalid', user_metadata: { full_name: 'Mohammad Alotaishan' }, aud: 'authenticated', role: 'authenticated' };
const jwt = [ { alg: 'HS256', typ: 'JWT' }, { sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' } ].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.fixture';
async function main() {
 fs.mkdirSync(out,{recursive:true});
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const context = await browser.newContext({viewport:{width:1578,height:783}});
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:'sb-'+service.hostname.split('.')[0]+'-auth-token',session:{access_token:jwt,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}});
  await context.route(service.origin+'/**',async route=>{
   const url=new URL(route.request().url()); let body={};
   if(url.pathname.endsWith('/auth/v1/user')) body=user;
   else if(url.pathname.includes('/rest/v1/profiles')) body={role:'client',client_id:'client-fixture',approval_status:'approved',account_status:'active'};
   else if(url.pathname.includes('/rest/v1/clients')) body={email:user.email};
   else if(url.pathname.includes('/functions/v1/customer-service')) body={tickets:[]};
   else if(url.pathname.includes('/functions/v1/quotations') && url.searchParams.has('lookup')) body={countries:[{id:'kw',name:'Kuwait'}],fees:[{id:'fee1',country_id:'kw',category:'Trademark',procedure_name:'Registration',currency:'USD',official_fee:100,attorney_fee:50,total_fee:150,available:true}],services:[],requirements:[]};
   else if(url.pathname.endsWith('/functions/v1/poa')) body={countries:[{id:'kw',name:'Kuwait',abbreviation:'KW',flag_url:null}],data:[{id:'poa',key:'fixture.pdf',document_name:'Signed power of attorney (POA)',last_modified:'2026-01-01',countries:[{id:'kw',name:'Kuwait',abbreviation:'KW',flag_url:null}]}]};
   else if(url.pathname.includes('/functions/v1/requirements')) body={data:[{id:'poa',country_id:'kw',description:'Signed power of attorney (POA)',created_at:'2026-01-01',country:{id:'kw',name:'Kuwait'}},{id:'other',country_id:'kw',description:'Copy of passport',created_at:'2026-01-01'}],total:2};
   else if(/\/functions\/v1\/(statements|notifications)$/.test(url.pathname)) body=[];
   else body={data:[],total:0};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/client-dashboard',{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('.client-home-card').first().waitFor();
  assert.equal(await page.locator('.client-home-card').count(),8);
  assert.match(await page.locator('.client-welcome').innerText(),/Mohammad Alotaishan/);
  assert.equal(await page.locator('.client-sidebar').count(),0);
  for(const width of [1807,1578,1440,1280,1100,1024,768,390,320]){
   await page.setViewportSize({width,height:width<600?1100:783});
   await page.screenshot({path:path.join(out,'dashboard-'+width+'.png'),fullPage:true});
   const overflows=await page.locator('.client-home-card-label,.client-home-header').evaluateAll(els=>els.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.className));
   assert.deepEqual(overflows,[],'No overflow at '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(out,'dashboard-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1578,height:783});
  await page.getByRole('button',{name:/MA Mohammad/}).click();
  assert.equal(await page.getByRole('menuitem',{name:'Portfolio overview'}).isVisible(),true);
  await page.keyboard.press('Escape');
  const links=await page.locator('.client-home-card').evaluateAll(els=>els.map(a=>({text:a.textContent,href:a.getAttribute('href')})));
  for(const link of links){
   const response=await page.goto(origin+link.href,{waitUntil:'networkidle'});
   assert.equal(response.status(),200,link.href);
   assert.equal(await page.locator('.client-app-shell').count(),1,link.href+' keeps client access shell');
   if(link.href.endsWith('/fees')) assert.match(await page.locator('body').innerText(),/150.00/);
   if(link.href.endsWith('/poa')) { assert.match(await page.locator('body').innerText(),/Signed power of attorney/);assert.doesNotMatch(await page.locator('body').innerText(),/Copy of passport/); }
  }

  const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let verifyCalls = 0;
  await anonymous.route(service.origin+'/**', async route => {
    const url = new URL(route.request().url());
    assert.match(url.pathname, /\/functions\/v1\/quotations\/verify\//);
    assert.equal(route.request().headers().authorization, undefined, 'QR destination works without signing in');
    verifyCalls++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      reference_no:'QR-TEST',invoice_date:'2026-10-01',grand_total:150,total_vat:0,discount:0,currency:'USD',vatable:false,vat_rate:0,
      client:{company_name:'Validation fixture',address:'Test address'},quotation_items:[],requirements:[]
    })});
  });
  const verifyPage = await anonymous.newPage();
  await verifyPage.addInitScript(() => { window.print = () => { window.__printCalled = true; }; });
  await verifyPage.goto(origin+'/invoice/verify/'+'0'.repeat(48),{waitUntil:'networkidle'});
  assert.match(await verifyPage.locator('[role=status]').innerText(),/Quotation verified/);
  await verifyPage.getByRole('button',{name:'Download / Print PDF'}).click();
  assert.equal(await verifyPage.evaluate(() => window.__printCalled),true);
  assert.match(await verifyPage.locator('.quotation-qr img').getAttribute('src'),/^data:image\/svg\+xml/);
  assert.ok(verifyCalls>0);
  await anonymous.close();
  console.log('PASS: anonymous phone-sized QR destination and image-ready print action.');

  assert.deepEqual(errors,[]);
  console.log('PASS: desktop/tablet/mobile layouts, account menu, eight destinations, client fees, POA documents; synthetic authenticated fixture.');
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

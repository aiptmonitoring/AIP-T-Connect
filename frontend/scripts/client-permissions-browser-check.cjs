const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require('../../tmp/client-quotation-edit-browser/node_modules/playwright');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'));
const moduleMatrix={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../backend/supabase/functions/_shared/permission-matrix.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleMatrix,exports:moduleMatrix.exports});
const defaults=moduleMatrix.exports.defaultClientPermissions();
const service=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL),origin=process.env.CHECK_ORIGIN||'http://localhost:3000',out=path.resolve(__dirname,'../../tmp/permissions-check');fs.mkdirSync(out,{recursive:true});
const adminId='11111111-1111-4111-8111-111111111111',clientId='22222222-2222-4222-8222-222222222222';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 let saved=structuredClone(defaults),revision=0,puts=0;
 async function contextFor(role){const user={id:role==='administrator'?adminId:clientId,email:'client@example.invalid',user_metadata:{full_name:role==='administrator'?'Test Administrator':'Test Client'},aud:'authenticated',role:'authenticated'};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.fixture';
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({key,user,jwt})=>localStorage.setItem(key,JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{key:'sb-'+service.hostname.split('.')[0]+'-auth-token',user,jwt});
  await context.route(service.origin+'/**',async route=>{const url=new URL(route.request().url());let body={},status=200;
   if(url.pathname.endsWith('/auth/v1/user'))body=user;
   else if(url.pathname.includes('/rest/v1/profiles'))body={role,client_id:'own-company',approval_status:'approved',account_status:'active'};
   else if(url.pathname.includes('/rest/v1/clients'))body={email:user.email};
   else if(url.pathname.endsWith('/functions/v1/client-permissions')){
    if(url.searchParams.get('clients')==='true')body={clients:[{id:clientId,full_name:'Test Client',company_name:'Test Company',approval_status:'approved',account_status:'active',client:{company_name:'Test Company',email:user.email}}]};
    else if(route.request().method()==='PUT'){const value=route.request().postDataJSON();assert.equal(value.revision,revision);saved=value.permissions;revision++;puts++;body={permissions:saved,revision,updated_at:new Date().toISOString()};}
    else if(url.searchParams.has('lookup')){const name=url.searchParams.get('lookup');const data=name==='countries'?[{id:'kw',name:'Kuwait',abbreviation:'KW'}]:name==='services'?[{id:'service',service:'Trademark'}]:name==='procedures'?[{id:'procedure',description:'Registration',service_id:'service'}]:[{id:'own-company',company_name:'Test Company'}];body=name==='countries'?data:{data,total:data.length};}
    else body={permissions:saved,revision,updated_at:null};
   }else if(url.pathname.endsWith('/functions/v1/projects/fields'))body=[];
   else if(url.pathname.endsWith('/functions/v1/statements') || url.pathname.endsWith('/functions/v1/notifications'))body=[];
   else if(url.pathname.endsWith('/functions/v1/poa'))body={data:[],countries:[]};
   else if(url.pathname.endsWith('/functions/v1/schedule-of-fees'))body={data:[]};
   else if(url.pathname.endsWith('/functions/v1/requirements'))body={data:[{id:'req',country_id:'kw',procedure_id:'procedure',description:'Signed document',country:{id:'kw',name:'Kuwait',abbreviation:'KW'},procedure:{id:'procedure',description:'Registration',service_id:'service',service:{id:'service',service:'Trademark'}}}],total:1};
   else if(url.pathname.endsWith('/functions/v1/customer-service'))body={tickets:[]};
   else body={data:[],total:0};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });return context;
 }
 const admin=await contextFor('administrator'),page=await admin.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/roles',{waitUntil:'domcontentloaded',timeout:120000});await page.getByLabel('Client login').selectOption(clientId);await page.getByRole('checkbox',{name:'Requirements: update',exact:true}).waitFor();
 assert.equal(await page.locator('.roles-page tbody tr').count(),12);
 await page.getByRole('checkbox',{name:'Requirements: update',exact:true}).check();assert.equal(await page.getByRole('checkbox',{name:'Requirements: edit',exact:true}).isChecked(),true);
 await page.getByRole('button',{name:'Save permissions',exact:true}).click();await page.getByRole('status').filter({hasText:'Permissions saved'}).waitFor();assert.equal(puts,1);assert.equal(saved.requirements.update,true);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(() => window.scrollTo(0,0));await page.screenshot({path:path.join(out,'roles-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await admin.close();
 saved=structuredClone(defaults);saved.requirements={view:true,add:true,edit:false,update:false,delete:false};
 const client=await contextFor('client'),clientPage=await client.newPage();clientPage.on('pageerror',error=>errors.push(error.message));
 await clientPage.goto(origin+'/client-dashboard/requirements',{waitUntil:'domcontentloaded',timeout:120000});await clientPage.getByRole('button',{name:'Manage records',exact:true}).click();await clientPage.getByRole('button',{name:'Add Requirement',exact:true}).waitFor();
 assert.equal(await clientPage.locator('[data-action="edit"]').first().isVisible(),false);assert.equal(await clientPage.locator('[data-action="delete"]').first().isVisible(),false);
 await clientPage.getByRole('button',{name:'Add Requirement',exact:true}).click();await clientPage.getByRole('button',{name:'Save Requirement',exact:true}).waitFor();assert.equal(await clientPage.getByRole('button',{name:'Save Requirement',exact:true}).isVisible(),true);
 await clientPage.screenshot({path:path.join(out,'client-add-only.png'),fullPage:true});
 saved.requirements.view=false;await clientPage.reload({waitUntil:'domcontentloaded'});await clientPage.getByRole('alert').filter({hasText:'You do not have permission to view this page'}).waitFor();
 assert.equal(await clientPage.getByRole('button',{name:'Manage records',exact:true}).count(),0);
 for(const key of ['projects','statements','poa','fees','notifications']) saved[key]={view:true,add:true,edit:true,update:true,delete:true};
 for(const key of ['projects','statements','poa','fees','notifications']) {
   await clientPage.goto(origin+'/client-dashboard/'+key,{waitUntil:'domcontentloaded',timeout:120000});
   await clientPage.getByRole('button',{name:'Manage records',exact:true}).click();
   const add=key==='projects'?clientPage.getByRole('button',{name:'Add Project',exact:true}):key==='statements'?clientPage.getByRole('button',{name:'Add Statement',exact:true}):key==='poa'?clientPage.getByRole('button',{name:'Upload POA',exact:true}):key==='fees'?clientPage.getByRole('button',{name:'Upload document',exact:true}):clientPage.getByRole('button',{name:'Add Notification',exact:true});
   await add.waitFor({timeout:60000});
   await clientPage.screenshot({path:path.join(out,'manage-'+key+'.png'),fullPage:true});
 }
 await clientPage.goto(origin+'/client-dashboard',{waitUntil:'domcontentloaded',timeout:120000});
 saved.fees=structuredClone(defaults.fees);
 await clientPage.reload({waitUntil:'domcontentloaded'});
 const feesLink=clientPage.locator('a.client-home-card').filter({hasText:'Schedule of Fees'});await feesLink.waitFor();assert.equal(await feesLink.getAttribute('href'),'/client-dashboard/schedule-of-fees');await feesLink.click();
 await clientPage.getByRole('heading',{name:'Schedule of Fees',exact:true}).waitFor();assert.equal(await clientPage.getByRole('button',{name:'Upload document',exact:true}).isVisible(),false);
 await client.close();assert.deepEqual(errors,[]);console.log('PASS: admin permission save, dependencies, desktop/mobile layouts, client add-only management and revoked page access; synthetic fixtures.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
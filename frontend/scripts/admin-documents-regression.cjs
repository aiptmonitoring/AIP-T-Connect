const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function setup(service, role='admin') {
 const state={objects:new Map(),records:[],operations:[],failDelete:false,failSave:false,profileRole:role};
 const commandNames=['DeleteObjectCommand','GetObjectCommand','HeadObjectCommand','ListObjectsV2Command','PutObjectCommand','CopyObjectCommand'];
 const aws=Object.fromEntries(commandNames.map(name=>[name,class {constructor(input){this.input=input;this.name=name;}}]));
 aws.S3Client=class {async send(command){const i=command.input;state.operations.push(command.name);assert.equal(i.Bucket,'test-bucket');if(command.name==='ListObjectsV2Command')return {Contents:[...state.objects].filter(([k])=>k.startsWith(i.Prefix)).map(([Key,obj])=>({Key,Size:obj.bytes.length,LastModified:new Date()}))};
 if(command.name==='HeadObjectCommand'){if(!state.objects.has(i.Key)){const e=Error('missing');e.name='NotFound';throw e;}return {};}
 if(command.name==='PutObjectCommand'){state.objects.set(i.Key,{bytes:i.Body});return {};}
 if(command.name==='CopyObjectCommand'){const key=decodeURIComponent(i.CopySource).replace('test-bucket/','');state.objects.set(i.Key,state.objects.get(key));return {};}
 if(command.name==='DeleteObjectCommand'){if(state.failDelete){const e=Error('denied');e.name='AccessDenied';throw e;}state.objects.delete(i.Key);return {};}
 return {};}};
 const country={id:'11111111-1111-4111-8111-111111111111',name:'Kuwait',abbreviation:'KWT',flag_url:null};
 const db={auth:{getUser:async(token)=>({data:{user:token==='invalid'?null:{id:'user',email:'test@example.com'}},error:null})},from(table){const filters=[];let action='select';const query={select(){return query},eq(k,v){filters.push([k,v]);return query},is(){return query},order(){return query},range(){return query},delete(){action='delete';return query},async maybeSingle(){const r=await query;return {data:r.data[0]??null,error:r.error}},then(resolve,reject){let data=[];
 if(table==='profiles')data=[{role:state.profileRole,client_id:'client',approval_status:'approved',account_status:'active'}];
 if(table==='countries')data=[country];if(table==='clients')data=[{email:'test@example.com'}];if(table==='projects')data=[];
 if(table==='poa_documents'){data=state.records.filter(r=>filters.every(([k,v])=>r[k]===v));if(action==='delete'){state.operations.push('database-delete');state.records=state.records.filter(r=>!data.includes(r));data=[];}}
 return Promise.resolve({data,error:null}).then(resolve,reject);}};return query;},async rpc(_,args){if(state.failSave)return {data:null,error:{message:'save failed'}};const id=args.p_id??'doc-'+state.records.length;let r=state.records.find(r=>r.id===id);if(!r){r={id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};state.records.push(r);}Object.assign(r,{document_name:args.p_document_name,s3_key:args.p_s3_key,poa_document_countries:args.p_country_ids.map(country_id=>({country_id,country}))});return {data:id,error:null};}};
 const env={AWS_S3_BUCKET:'test-bucket',AWS_REGION:'eu-north-1',AWS_ACCESS_KEY_ID:'test',AWS_SECRET_ACCESS_KEY:'test',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'};
 let handler;const cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const context={module,exports:module.exports,require(name){if(name.includes('client-s3'))return aws;if(name.includes('s3-request-presigner'))return {getSignedUrl:async(_,cmd)=>'https://download.test/'+cmd.input.Key};if(name.includes('supabase-js'))return {createClient:()=>db};return load(path.resolve(path.dirname(file),name));},Deno:{env:{get:k=>env[k]},serve(fn){handler=fn;}},Request,Response,File,FormData,Uint8Array,URL,crypto,console};vm.runInNewContext(code,context,{filename:file});return module.exports;}
 load(path.join(root,'backend/supabase/functions',service,'index.ts'));
 return {state,country,call:async(method='GET',query='',form)=>handler(new Request('https://example.test/'+service+query,{method,headers:{Authorization:'Bearer token'},...(form?{body:form}:{})})),form(name='Test',bytes='first',countryIds=['shared']){const f=new FormData();f.set('document_name',name);if(bytes!==null)f.set('file',new File([bytes],'test.pdf',{type:'application/pdf'}));countryIds.forEach(id=>f.append('country_ids',id));return f;}};
}
(async()=>{
 for(const service of ['poa','schedule-of-fees']){
  const t=setup(service);let r=await t.call('POST','',t.form());assert.equal(r.status,201,await r.clone().text());let created=await r.json();const old=created.key;assert.ok(old.startsWith(service==='poa'?'aiptPOA/':'aiptschedule_of_fees/'));const query=service==='poa'?'?id='+created.id:'?key='+encodeURIComponent(old);
  r=await t.call();assert.equal((await r.json()).data.length,1);
  r=await t.call('PUT',query,t.form('Renamed',null));assert.equal(r.status,200,await r.clone().text());let changed=await r.json();let q=service==='poa'?'?id='+changed.id:'?key='+encodeURIComponent(changed.key);
  r=await t.call('GET',q);assert.equal(r.status,200);assert.ok((await r.json()).url);
  r=await t.call('PUT',q,t.form('Replaced','second'));assert.equal(r.status,200,await r.clone().text());changed=await r.json();q=service==='poa'?'?id='+changed.id:'?key='+encodeURIComponent(changed.key);assert.equal(t.state.objects.size,1);assert.equal(Buffer.from(t.state.objects.get(changed.key).bytes).toString(),'second');
  r=await t.call('DELETE',q);assert.equal(r.status,204);assert.equal(t.state.objects.size,0);assert.equal(t.state.records.length,0);
  const denied=setup(service,'client');assert.equal((await denied.call('POST','',denied.form())).status,403);
  const invalid=setup(service);assert.equal((await invalid.call('POST','',invalid.form('Empty',''))).status,400);assert.equal(invalid.state.objects.size,0);
 }
 const t=setup('poa');t.state.failSave=true;assert.equal((await t.call('POST','',t.form())).status,400);assert.equal(t.state.objects.size,0);
 t.state.failSave=false;let r=await t.call('POST','',t.form());let doc=await r.json();t.state.failDelete=true;assert.equal((await t.call('DELETE','?id='+doc.id)).status,502);assert.equal(t.state.records.length,1);assert.equal(t.state.objects.size,1);t.state.failDelete=false;assert.equal((await t.call('DELETE','?id='+doc.id)).status,204);assert.ok(t.state.operations.lastIndexOf('DeleteObjectCommand')<t.state.operations.lastIndexOf('database-delete'));
 const client=setup('poa','client');const key='aiptPOA/Kuwait/test.pdf';client.state.objects.set(key,{bytes:Buffer.from('x')});client.state.records=[{id:'restricted',s3_key:key,document_name:'Restricted',poa_document_countries:[{country_id:client.country.id,country:client.country}]}];assert.equal((await client.call('GET','?key='+encodeURIComponent(key))).status,404);
 const legacy=setup('poa');const legacyKey='aiptPOA/unknown/test.pdf';legacy.state.objects.set(legacyKey,{bytes:Buffer.from('x')});assert.equal((await legacy.call('GET','?key='+encodeURIComponent(legacyKey))).status,200);let edit=await legacy.call('PUT','?key='+encodeURIComponent(legacyKey),legacy.form('Legacy',null));assert.equal(edit.status,200);edit=await legacy.call('PUT','?key='+encodeURIComponent(legacyKey),legacy.form('Legacy again',null));assert.equal(edit.status,200);assert.equal(legacy.state.records.length,1);
 const sched=setup('schedule-of-fees');r=await sched.call('POST','',sched.form());doc=await r.json();sched.state.failDelete=true;assert.equal((await sched.call('PUT','?key='+encodeURIComponent(doc.key),sched.form('New',null))).status,400);assert.ok(sched.state.objects.has(doc.key));
 console.log('PASS: both document CRUD lifecycles, role checks, empty uploads, POA key authorization, legacy edits, upload rollback, and deletion failure recovery.');
})().catch(e=>{console.error(e);process.exitCode=1;});

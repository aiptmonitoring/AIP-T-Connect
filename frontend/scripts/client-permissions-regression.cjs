const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),functions=path.join(root,'backend/supabase/functions');
const adminId='11111111-1111-4111-8111-111111111111',clientId='22222222-2222-4222-8222-222222222222',otherId='33333333-3333-4333-8333-333333333333';
function harness(){
 const state={role:'client',permissions:null,revision:0,fail:false,writes:[],profile:{approval_status:'approved',account_status:'active',client_id:'own-company'}};
 let handler; let endpoint='client-permissions';
 const db={auth:{getUser:async(token)=>({data:{user:token==='invalid'?null:{id:state.role==='administrator'?adminId:clientId,email:'client@example.invalid'}}})},
 from(table){const filters=[];let mutation=null,payload;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},not(){return q},is(){return q},order(){return q},range(){return q},update(value){mutation='update';payload=value;return q},insert(value){mutation='insert';payload=value;return q},
   async maybeSingle(){const result=await q;return {data:result.data?.[0]??null,error:result.error}},async single(){return q.maybeSingle()},
   then(resolve,reject){let data=[],error=null;const id=filters.find(([k])=>k==='id')?.[1];
    if(table==='profiles')data=[{id,role:id===adminId?'administrator':'client',...state.profile}];
    if(table==='client_permission_sets'){data=state.permissions?[{user_id:clientId,permissions:state.permissions,revision:state.revision}]:[];if(state.fail)error={message:'unavailable'};}
    if(table==='clients')data=[{id:'own-company',company_name:'Own Company',email:'client@example.invalid'}];
    if(table==='customer_service_tickets')data=[{id:'ticket-own',client_id:'own-company',status:'Open'},{id:'ticket-other',client_id:'other-company',status:'Open'}].filter(row=>filters.every(([k,v])=>row[k]===v));
    if(table==='projects')data=[{id:'project-own',client_id:'own-company',approval_status:'approved'},{id:'project-other',client_id:'other-company',approval_status:'approved'}].filter(row=>filters.every(([k,v])=>row[k]===v));
    if(table==='statements')data=[{id:'statement-own',client_id:'own-company',approval_status:'approved'},{id:'statement-other',client_id:'other-company',approval_status:'approved'}].filter(row=>filters.every(([k,v])=>row[k]===v));
    if(mutation){state.writes.push({table,mutation,payload,filters});}
    return Promise.resolve({data,error}).then(resolve,reject);
   }};return q;},
 async rpc(name,args){state.writes.push({name,args});if(name==='update_customer_service_ticket_status')return {data:{id:args.p_ticket_id},error:null};if(args.p_revision!==state.revision)return {error:{code:'40001',message:'Permissions changed.'}};state.permissions=args.p_permissions;state.revision++;return {data:state.revision,error:null};}};
 const cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
  const aws=new Proxy({},{get:(_,name)=>class {constructor(input){this.input=input} async send(){return {}}}});
  const context={module,exports:module.exports,require(name){if(name.includes('supabase-js'))return {createClient:()=>db};if(name.includes('client-s3'))return aws;if(name.includes('presigner'))return {getSignedUrl:async()=>''};return load(path.resolve(path.dirname(file),name));},Deno:{env:{get:()=> 'fixture'},serve(fn){handler=fn}},Request,Response,URL,Headers,FormData,File,Uint8Array,crypto,console};
  vm.runInNewContext(result.outputText,context,{filename:file});return module.exports;
 }
 const matrix=load(path.join(functions,'_shared/permission-matrix.ts'));const helper=load(path.join(functions,'_shared/client-permissions.ts'));
 return {state,db,matrix,helper,load,endpoint:name=>{endpoint=name},call:(method='GET',query='',body)=>handler(new Request('https://fixture.invalid/'+endpoint+query,{method,headers:{Authorization:'Bearer token','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))};
}
(async()=>{
 const t=harness();let result;
 assert.equal(t.matrix.permissionPages.length,12);
 assert.equal(t.helper.actionForRequest(new Request('https://fixture.invalid/projects/upload-image?permission_action=update',{method:'POST'})),'update');
 assert.equal(t.helper.actionForRequest(new Request('https://fixture.invalid/projects?permission_action=update',{method:'POST'})),'add');
 const defaults=t.matrix.defaultClientPermissions();assert.equal(defaults.quotations.add,true);assert.equal(defaults.requirements.update,false);
 await t.helper.enforceClientPermission(t.db,clientId,'quotations','add');
 await assert.rejects(t.helper.enforceClientPermission(t.db,clientId,'requirements','delete'),/permission/);
 t.state.permissions=t.matrix.defaultClientPermissions();t.state.permissions.requirements={view:true,add:true,edit:true,update:true,delete:true};
 await t.helper.enforceClientPermission(t.db,clientId,'requirements','delete');
 t.state.permissions.requirements.view=false;await assert.rejects(t.helper.enforceClientPermission(t.db,clientId,'requirements','delete'),/permission/);
 t.state.permissions.requirements.view=true;t.state.permissions.requirements.edit=false;await assert.rejects(t.helper.enforceClientPermission(t.db,clientId,'requirements','update'),/permission/);
 t.state.fail=true;await assert.rejects(t.helper.enforceClientPermission(t.db,clientId,'quotations','add'),/verified/);t.state.fail=false;
 t.state.profile.account_status='inactive';await assert.rejects(t.helper.enforceClientPermission(t.db,clientId,'quotations','add'),/active/);t.state.profile.account_status='active';
 t.load(path.join(functions,'client-permissions/index.ts'));t.state.permissions=null;
 result=await t.call('GET','?user_id='+otherId);assert.equal(result.status,200);assert.equal((await result.json()).revision,0);
 result=await t.call('GET','?clients=true');assert.equal(result.status,403);
 result=await t.call('PUT','?user_id='+clientId,{permissions:defaults,revision:0});assert.equal(result.status,403);assert.equal(t.state.writes.length,0);
 t.state.role='administrator';
 result=await t.call('PUT','?user_id='+clientId,{permissions:{},revision:0});assert.equal(result.status,400);
 const custom=t.matrix.defaultClientPermissions();custom.requirements={view:true,add:true,edit:true,update:true,delete:true};
 result=await t.call('PUT','?user_id='+clientId,{permissions:custom,revision:0});assert.equal(result.status,200,await result.clone().text());assert.equal(t.state.revision,1);assert.equal(t.state.writes[0].args.p_actor_id,adminId);
 result=await t.call('PUT','?user_id='+clientId,{permissions:custom,revision:0});assert.equal(result.status,409);
 custom.requirements.edit=false;result=await t.call('PUT','?user_id='+clientId,{permissions:custom,revision:1});assert.equal(result.status,400);
 custom.requirements.edit=true;custom.invoices.delete=true;result=await t.call('PUT','?user_id='+clientId,{permissions:custom,revision:1});assert.equal(result.status,400);
 const owned=harness();owned.state.permissions=owned.matrix.defaultClientPermissions();
 for(const page of ['projects','statements','customer-service','requirements']) owned.state.permissions[page]={view:true,add:true,edit:true,update:true,delete:true};
 for(const [service,foreign,own] of [['projects','project-other','project-own'],['statements','statement-other','statement-own'],['customer-service','ticket-other','ticket-own']]) {
   owned.endpoint(service);owned.load(path.join(functions,service,'index.ts'));owned.state.writes=[];
   result=await owned.call('DELETE','/'+foreign);assert.equal(result.status,404,service+': foreign delete denied '+await result.clone().text());assert.equal(owned.state.writes.length,0);
   result=await owned.call('DELETE','/'+own);assert.equal(result.status,204,service+': own delete allowed '+await result.clone().text());assert.ok(owned.state.writes.some(write=>write.table===({projects:'projects',statements:'statements','customer-service':'customer_service_tickets'}[service])));
 }
 owned.endpoint('requirements');owned.load(path.join(functions,'requirements/index.ts'));owned.state.writes=[];
 result=await owned.call('DELETE','/shared-record');assert.equal(result.status,204);assert.equal(owned.state.writes[0].table,'requirements');
 owned.state.permissions.requirements.delete=false;owned.state.writes=[];result=await owned.call('DELETE','/shared-record');assert.equal(result.status,403);assert.equal(owned.state.writes.length,0);
 owned.endpoint('quotations');owned.load(path.join(functions,'quotations/index.ts'));owned.state.permissions.quotations.edit=false;owned.state.permissions.quotations.update=false;
 result=await owned.call('POST','/quote-own/cancel?bypass=1');assert.equal(result.status,403,'Cancellation requires Update even with query parameters');
 console.log('PASS: client-owned project/statement/ticket deletes, cross-client denial, shared catalog writes and revocation.');
 console.log('PASS: defaults, grants/revocations, view/edit dependencies, inactive clients, fail-closed checks, self-read, admin-only assignment, validation and stale saves.');
})();
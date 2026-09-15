const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('../../frontend/node_modules/typescript');
const source = fs.readFileSync('backend/supabase/functions/users/index.ts','utf8').replace(/^\uFEFF/, '').replace(/^import .*;$/gm, '');
const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
async function run(options = {}) {
 let handler; const calls = [];
 const db = { auth: { getUser: async()=>({data:{user:{id:actor}}}), admin:{ getUserById:async()=>({data:{user:{email:'target@example.com'}}}), deleteUser:async()=>{calls.push('auth-delete');return {error: options.authFailure ? Error('linked') : null}} } }, from(table){return {select(){return this},eq(){return this},single:async()=>({data:{role:options.nonAdmin?'client':'administrator'}}),maybeSingle:async()=>({data:{id:target,client_id:options.linked?'client':null,role:options.targetAdmin?'administrator':'client'}}),then(resolve){resolve({count:options.linked?1:0,error:null})},insert:async()=>{calls.push('audit');return {error:null}},delete(){throw Error('Profile must never be deleted first')}}} };
 vm.runInNewContext(js,{Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},createClient:()=>db,S3Client:class {},Response,Request,URL,console});
 const response = await handler(new Request('https://test/users/'+(options.self?actor:target), {method:'DELETE',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({force:!!options.force,confirm_email:options.badEmail?'wrong':'target@example.com'})}));
 return {status:response.status,calls,body:await response.json()};
}
(async()=>{
 for(const [options,status] of [[{targetAdmin:true},403],[{targetAdmin:true,force:true},403],[{nonAdmin:true},403],[{self:true},409],[{badEmail:true},400],[{linked:true},409],[{linked:true,force:true,authFailure:true},409]]) {const r=await run(options);assert.equal(r.status,status);assert.equal(r.calls.includes('audit'),false);if(!options.authFailure)assert.equal(r.calls.includes('auth-delete'),false);}
 for(const options of [{},{linked:true,force:true}]){const r=await run(options);assert.equal(r.status,200);assert.equal(r.body.deleted,true);assert.deepEqual(r.calls,['auth-delete','audit']);}
 console.log('9 deletion regression scenarios passed');
})().catch(e=>{console.error(e);process.exitCode=1});

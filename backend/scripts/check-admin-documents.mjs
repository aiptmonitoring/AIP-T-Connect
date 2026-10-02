import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const env={};for(const line of readFileSync(new URL('../.env',import.meta.url),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');}
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=await db.auth.admin.listUsers({page:1,perPage:1000});if(users.error)throw Error(users.error.message);
const user=users.data.users.find(u=>u.email?.toLowerCase()===env.DEMO_ADMIN_EMAIL?.toLowerCase());if(!user)throw Error('Configured test administrator not found.');
const profile=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(profile.error||!['admin','administrator'].includes(profile.data?.role))throw Error('Configured test account is not an administrator.');
// Generate a test session for the existing configured test admin. No email is sent and no password is changed.
const link=await db.auth.admin.generateLink({type:'magiclink',email:user.email});if(link.error)throw Error(link.error.message);
const login=await db.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});if(login.error)throw Error(login.error.message);
const headers={Authorization:'Bearer '+login.data.session.access_token};
const marker='AIPT-document-check-'+crypto.randomUUID();
let selectedCountryIds=['shared'];
const form=(name,bytes)=>{const f=new FormData();f.set('document_name',name);selectedCountryIds.forEach(id=>f.append('country_ids',id));if(bytes!==null)f.set('file',new File([bytes],marker+'.pdf',{type:'application/pdf'}));return f;};
const query=(service,item)=>service==='poa'?'?id='+encodeURIComponent(item.id):'?key='+encodeURIComponent(item.key);
async function call(service,method='GET',q='',body){const r=await fetch(env.SUPABASE_URL+'/functions/v1/'+service+q,{method,headers,...(body?{body}:{})});const b=r.status===204?null:await r.json().catch(()=>null);if(!r.ok)throw Error(service+' '+method+' HTTP '+r.status+': '+(b?.error||'request failed'));return b;}
try {
 for(const service of (process.argv.includes('--poa-only') ? ['poa'] : process.argv.includes('--fees-only') ? ['schedule-of-fees'] : ['poa','schedule-of-fees'])) {
  let current=null;
  try {
   const listed=await call(service);console.log(service+' listing passed ('+listed.data.length+' documents).');
   if(service==='poa' && process.argv.includes('--multi-country')){assert.ok(listed.countries.length>=3);selectedCountryIds=listed.countries.slice(0,2).map(country=>country.id);}
   current=await call(service,'POST','',form(marker,'%PDF-1.4\n% initial test document\n%%EOF'));
   assert.ok(current.key.startsWith(service==='poa'?'aiptPOA/':'aiptschedule_of_fees/'));
   if(service==='poa' && process.argv.includes('--multi-country')){let saved=(await call(service)).data.find(doc=>doc.id===current.id);assert.deepEqual(saved.countries.map(country=>country.id).sort(),[...selectedCountryIds].sort());selectedCountryIds=listed.countries.slice(1,3).map(country=>country.id);}
   current=await call(service,'PUT',query(service,current),form(marker+'-renamed',null));
   if(service==='poa' && process.argv.includes('--multi-country')){const saved=(await call(service)).data.find(doc=>doc.id===current.id);assert.deepEqual(saved.countries.map(country=>country.id).sort(),[...selectedCountryIds].sort());console.log('POA multiple-country creation and metadata-only country update persisted.');}
   current=await call(service,'PUT',query(service,current),form(marker+'-replaced','%PDF-1.4\n% replacement test document\n%%EOF'));
   const download=await call(service,'GET',query(service,current));assert.equal(new URL(download.url).hostname, env.AWS_S3_BUCKET+'.s3.'+env.AWS_REGION+'.amazonaws.com', 'Signed download must use the configured AWS bucket and region');const response=await fetch(download.url);assert.equal(response.status,200);assert.match(await response.text(),/replacement test document/);
   await call(service,'DELETE',query(service,current));const deleted=current;current=null;
   const after=await call(service);assert.ok(!after.data.some(d=>d.key===deleted.key));
   console.log(service+' LIVE PASS: upload, rename, replacement, signed S3 download, delete, and listing reconciliation.');
  } finally {if(current){await call(service,'DELETE',query(service,current));console.log(service+' test document cleaned up.');}}
 }
} finally {await db.auth.signOut({scope:'local'});}

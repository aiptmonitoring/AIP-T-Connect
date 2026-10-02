import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
const env={};for(const l of readFileSync(new URL('../.env',import.meta.url),'utf8').split(/\r?\n/)){const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^['"]|['"]$/g,'');}
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),hmac=(key,v)=>crypto.createHmac('sha256',key).update(v).digest();
async function iam(action,args={},service='iam',region='us-east-1',version='2010-05-08') {
 const host=service==='iam'?'iam.amazonaws.com':'sts.'+region+'.amazonaws.com';
 const body=new URLSearchParams({Action:action,Version:version,...args}).toString(),date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),scope=day+'/'+region+'/'+service+'/aws4_request';
 const headers={'content-type':'application/x-www-form-urlencoded; charset=utf-8',host,'x-amz-date':date};if(env.AWS_SESSION_TOKEN)headers['x-amz-security-token']=env.AWS_SESSION_TOKEN;
 const signed=Object.keys(headers).sort().join(';'),canonical=Object.keys(headers).sort().map(k=>k+':'+headers[k]+'\n').join(''),request='POST\n/\n\n'+canonical+'\n'+signed+'\n'+hash(body);
 const key=hmac(hmac(hmac(hmac('AWS4'+env.AWS_SECRET_ACCESS_KEY,day),region),service),'aws4_request'),signature=crypto.createHmac('sha256',key).update('AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+hash(request)).digest('hex');
 headers.Authorization='AWS4-HMAC-SHA256 Credential='+env.AWS_ACCESS_KEY_ID+'/'+scope+', SignedHeaders='+signed+', Signature='+signature;
 const r=await fetch('https://'+host+'/',{method:'POST',headers,body});const text=await r.text();if(!r.ok)throw Error(action+' HTTP '+r.status+' '+(text.match(/<Code>([^<]+)/)?.[1]||'failed'));return text;
}
const policy=JSON.parse(readFileSync(new URL('../aws/admin-documents-policy.json',import.meta.url),'utf8'));
if(policy.Version !== '2012-10-17' || !Array.isArray(policy.Statement))throw Error('Invalid document IAM policy.');
try {
 const identity=await iam('GetCallerIdentity',{},'sts',env.AWS_REGION,'2011-06-15');
 const arn=identity.match(/<Arn>([^<]+)/)?.[1];
 if(!arn?.includes(':user/'))throw Error('The configured AWS identity is not an IAM user; an AWS administrator must apply the prepared policy to the role.');
 const name=arn.split('/').pop();console.log('Configured AWS user identity verified through STS.');
 if(process.argv.includes('--apply')){await iam('PutUserPolicy',{UserName:name,PolicyName:'AIPTAdminDocumentAccess',PolicyDocument:JSON.stringify(policy)});console.log('Applied AIPTAdminDocumentAccess, limited to the configured bucket document folders.');}
 else {await iam('ListUserPolicies',{UserName:name});console.log('Inline IAM policies readable.');}
} catch(e){console.error(e.message);process.exitCode=1;}

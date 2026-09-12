import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const valid = (body: unknown) => {
  const input = body as Record<string, unknown>;
  const rawService = input.service ?? input.name;
  const rawColor = input.color ?? input.display_color;
  const service = typeof rawService === 'string' ? rawService.trim() : '';
  const color =
    typeof rawColor === 'string' && /^#[0-9a-f]{6}$/i.test(rawColor)
      ? rawColor
      : '#633edb';

  if (!service) throw Error('Service is required.');
  return { service, color };
};
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,''),db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),{data:{user}}=token?await db.auth.getUser(token):{data:{user:null}};if(!user)return reply({error:'Authentication is required.'},401);const{data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();if(profile?.role!=='administrator')return reply({error:'Administrator access is required.'},403);const url=new URL(req.url),last=url.pathname.split('/').filter(Boolean).at(-1),id=last==='services'?null:last;try{if(req.method==='GET'&&id){const{data,error}=await db.from('services').select('*').eq('id',id).is('deleted_at',null).maybeSingle();if(error)throw error;return data?reply(data):reply({error:'Service not found.'},404)}if(req.method==='GET'){const page=Math.max(Number(url.searchParams.get('page')??1),1),size=Math.min(Math.max(Number(url.searchParams.get('page_size')??10),1),100),search=url.searchParams.get('search')??'';let q=db.from('services').select('*',{count:'exact'}).is('deleted_at',null).order('service',{ascending:url.searchParams.get('dir')!=='desc'}).range((page-1)*size,page*size-1);if(search)q=q.ilike('service',`%${search}%`);const{data,error,count}=await q;if(error)throw error;return reply({data,total:count??0,page,page_size:size})}if(req.method==='POST'){const{data,error}=await db.from('services').insert(valid(await req.json())).select().single();if(error)throw error;await db.from('audit_logs').insert({actor_id:user.id,entity_type:'service',entity_id:data.id,action:'create',after_data:data});return reply(data,201)}if(!id)return reply({error:'Service id is required.'},400);const{data:before,error:beforeError}=await db.from('services').select('*').eq('id',id).is('deleted_at',null).maybeSingle();if(beforeError)throw beforeError;if(!before)return reply({error:'Service not found.'},404);if(req.method==='PUT'){const{data,error}=await db.from('services').update(valid(await req.json())).eq('id',id).is('deleted_at',null).select().single();if(error)throw error;await db.from('audit_logs').insert({actor_id:user.id,entity_type:'service',entity_id:id,action:'update',before_data:before,after_data:data});return reply(data)}if(req.method==='DELETE'){const{count,error:linkedError}=await db.from('procedures').select('id',{count:'exact',head:true}).eq('service_id',id).is('deleted_at',null);if(linkedError)throw linkedError;if(count)return reply({error:'This service has linked procedures and cannot be deleted.'},409);const{error}=await db.from('services').update({deleted_at:new Date().toISOString()}).eq('id',id).is('deleted_at',null);if(error)throw error;await db.from('audit_logs').insert({actor_id:user.id,entity_type:'service',entity_id:id,action:'delete',before_data:before});return new Response(null,{status:204,headers:cors})}return reply({error:'Method not allowed.'},405)}catch(e){return reply({error:e instanceof Error?e.message:'Request failed.'},/duplicate/i.test(String(e))?409:400)}});

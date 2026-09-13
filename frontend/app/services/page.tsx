'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';


import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../src/lib/supabase/browser';
import '../services.css';

type Service = { id: string; service: string; color: string; created_at: string };
type Modal = 'add' | 'edit' | 'delete' | null;
type ApiRow = Partial<Service> & { name?: string; display_color?: string; color?: string; service?: string };
const colors = ['#633edb','#147be5','#21b443','#fb8c0b','#f44346','#2db4b5','#98a1b5'];

const adapt = (row: ApiRow): Service => ({
  id: row.id ?? '',
  service: (row.service ?? row.name ?? '').trim(),
  color: row.color ?? row.display_color ?? colors[0],
  created_at: row.created_at ?? '',
});

export default function ServicesPage() {
  const router = useRouter();
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[total,setTotal]=useState(0),[ascending,setAscending]=useState(true);
  const [search,setSearch]=useState('');
  const [items,setItems]=useState<Service[]>([]),[selected,setSelected]=useState<Service|null>(null);
  const [modal,setModal]=useState<Modal>(null),[service,setService]=useState(''),[color,setColor]=useState(colors[0]);
  const [query,setQuery]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);

  useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(query);setPage(1)},300);return ()=>window.clearTimeout(timer)},[query]);
  const request=useCallback(async(path='',options:RequestInit={})=>{
    const supabase=getSupabaseBrowserClient();
    if(!supabase) throw Error('Supabase is not configured for this environment.');
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){
      router.replace('/login');
      return null;
    }
    const response=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/services${path}`,{
      ...options,
      headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',...options.headers},
    });
    if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error??'Unable to complete the request.');}
    if(response.status===204) return null;
    return response.json();
  },[router]);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const body=await request('?' + new URLSearchParams({page:String(page),page_size:String(pageSize),search,dir:ascending?'asc':'desc'}));
      const rows=Array.isArray(body)?body:(body?.data ?? []);
      setItems((rows as ApiRow[]).map(adapt));
      setTotal(body?.total ?? rows.length);
      if(page>Math.max(1,Math.ceil((body?.total ?? rows.length)/pageSize)))setPage(Math.max(1,Math.ceil((body?.total ?? rows.length)/pageSize)));
    }
    catch(cause){
      setError(cause instanceof Error?cause.message:'Unable to load services.');
    }
    finally{setLoading(false);}
  },[request,page,pageSize,search,ascending]);

  useEffect(()=>{void load();},[load]);

  const open=(kind:Exclude<Modal,null>,item?:Service)=>{setSelected(item??null);setService(item?.service??'');setColor(item?.color??colors[0]);setError('');setModal(kind);};
  const close=()=>{if(!saving){setModal(null);setError('');}};

  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const value=service.trim();if(!value){setError('Service is required.');return;}
    setSaving(true);setError('');
    try{
      const payload={service:value,color,name:value,display_color:color,category:'General',description:value,status:'active',display_order:0};
      const body=await request(modal==='edit'?`/${selected?.id}`:'',{method:modal==='edit'?'PUT':'POST',body:JSON.stringify(payload)});
      const saved=adapt((body ?? payload) as ApiRow);
      setItems(current=>modal==='edit'?current.map(item=>item.id===saved.id?saved:item):[saved,...current]);
      setNotice(modal==='edit'?'Service updated successfully.':'Service added successfully.');
      setModal(null);
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save service.');}
    finally{setSaving(false);}
  };

  const remove=async()=>{if(!selected)return;setSaving(true);setError('');try{await request(`/${selected.id}`,{method:'DELETE'});setItems(current=>current.filter(item=>item.id!==selected.id));setNotice('Service deleted successfully.');setModal(null);await load();}catch(cause){setError(cause instanceof Error?cause.message:'Unable to delete service.');}finally{setSaving(false);}};

  const visible=items;
  const resultStart=visible.length ? 1 : 0;
  const resultEnd=visible.length;

  return <main className="services-page">
    <section className="services-content"><header className="services-topbar"><p>Home <i>/</i> <b>Services</b></p><div><button aria-label="Notifications">♧</button><span>MS</span><p><b>Mohammad Saleh</b><small>Administrator</small></p></div></header>
      <div className="services-heading"><div><h1>Services</h1><p>View and manage all available intellectual property services.</p></div><div className="services-tools"><label>⌕<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search Services..."/></label><button className="filter">▽ Filter</button><button className="add" onClick={()=>open('add')} data-action="add" title="Add Service"><ActionIcon name="add" /><span className="aipt-action-label">Add Service</span></button></div></div>
      {notice&&<div className="services-toast">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
      <section className="services-card">{error&&!modal&&<p className="services-error">{error}</p>}<div className="services-table-wrap"><table><thead><tr><th><button className="aipt-sort" onClick={()=>{setAscending(!ascending);setPage(1)}}>Service {ascending?"?":"?"}</button></th><th>Color</th><th>Actions <span>⌃</span></th></tr></thead><tbody>{loading?<tr><td colSpan={3} className="services-state">Loading services…</td></tr>:visible.length?visible.map(item=><tr key={item.id}><td><i className="service-dot" style={{background:item.color}}/><b>{item.service}</b></td><td><span className="service-color" style={{color:item.color,background:`${item.color}18`}}><i style={{background:item.color}}/>{item.color}</span></td><td><button className="edit" aria-label={`Edit ${item.service}`} onClick={()=>open('edit',item)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button className="delete" aria-label={`Delete ${item.service}`} onClick={()=>open('delete',item)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></td></tr>):<tr><td colSpan={3} className="services-state">No services found.</td></tr>}</tbody></table></div><TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} /></section>
    </section>
    {modal&&<div className="services-backdrop" onMouseDown={close}><section className={`services-modal ${modal==='delete'?'delete-modal':''}`} onMouseDown={event=>event.stopPropagation()}>{modal==='delete'&&selected?<><header><div className="modal-title"><i className="trash">♲</i><div><h2>Delete Service</h2><p>Are you sure you want to delete this service?</p></div></div><button onClick={close}>×</button></header><p className="delete-note">This action cannot be undone. Related data may prevent deletion.</p><div className="delete-summary"><span><small>Service</small><b>{selected.service}</b></span><span><small>Color</small><b><i style={{background:selected.color}}/>{selected.color}</b></span></div>{error&&<p className="services-form-error">{error}</p>}<footer><button onClick={close}>× &nbsp; Cancel</button><button className="danger" disabled={saving} onClick={remove} data-action="delete" title="Delete Service"><ActionIcon name="delete" /><span className="aipt-action-label">♲ &nbsp; {saving?'Deleting…':'Delete Service'}</span></button></footer></>:<><header><div className="modal-title"><i>{modal==='add'?'▣':'✎'}</i><div><h2>{modal==='add'?'Add New Service':'Edit Service'}</h2><p>{modal==='add'?'Fill in the details below to create a new service.':'Update the details of the service.'}</p></div></div><button onClick={close}>×</button></header><form onSubmit={save}><label>Service <em>*</em><input autoFocus value={service} onChange={event=>setService(event.target.value)} placeholder="Enter service" maxLength={120}/></label><label>Color <em>*</em><div className="color-picker">{colors.map(option=><button type="button" key={option} aria-label={`Choose ${option}`} className={color===option?'chosen':''} style={{background:option}} onClick={()=>setColor(option)}>{color===option?'✓':''}</button>)}</div><small>Choose a color to represent this service</small></label>{error&&<p className="services-form-error">{error}</p>}<footer><button type="button" onClick={close}>× &nbsp; Cancel</button><button className="primary" disabled={saving} data-action="update" title="Save Service"><ActionIcon name="update" /><span className="aipt-action-label">▣ &nbsp; {saving?'Saving…':modal==='add'?'Save Service':'Update Service'}</span></button></footer></form></>}</section></div>}
  </main>;
}

'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';


import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../src/lib/supabase/browser';

type ColorName = 'purple'|'blue'|'green'|'orange'|'red'|'teal'|'yellow'|'gray'|'pink'|'indigo';
type Classification = { id:string; description:string; color_indication:ColorName };
type Modal = 'add'|'view'|'edit'|'delete'|null;
const colors: Array<[ColorName,string]> = [['purple','#633edb'],['blue','#147be5'],['green','#21b443'],['orange','#ef6506'],['red','#ed2028'],['teal','#25b8bd'],['yellow','#ffb516'],['gray','#969aaa'],['pink','#f46e9d'],['indigo','#6246df']];
const hex = (name:ColorName) => colors.find(([value]) => value === name)?.[1] ?? '#633edb';

export default function ClassificationOfFeesPage() {
  const [pageSize, setPageSize] = useState(10);
  const [ascending,setAscending]=useState(true);
  const [items,setItems] = useState<Classification[]>([]);
  const [selected,setSelected] = useState<Classification|null>(null);
  const [modal,setModal] = useState<Modal>(null);
  const [description,setDescription] = useState('');
  const [color,setColor] = useState<ColorName>('purple');
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  

  const request = useCallback(async(path='', options:RequestInit={}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured for this environment.');
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session) throw Error('Please sign in to manage fee classifications.');
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fee-classifications${path}`, {
      ...options,
      headers: { Authorization:`Bearer ${session.access_token}`, 'Content-Type':'application/json', ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(body.error ?? 'Unable to complete the request.');
    }
    return response.status === 204 ? null : response.json();
  },[]);

  const load = useCallback(async() => {
    setLoading(true);
    try { setItems(await request() as Classification[]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load classifications.'); }
    finally { setLoading(false); }
  },[request]);
  useEffect(() => { void load(); },[load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (term ? items.filter((item) => `${item.description} ${item.color_indication}`.toLowerCase().includes(term)) : items).slice().sort((a,b)=>a.description.localeCompare(b.description)*(ascending?1:-1));
  },[items,query,ascending]);
  const pages = Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage = Math.min(page,pages);
  const visible = filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);

  const open = (kind:Exclude<Modal,null>, item?:Classification) => {
    setSelected(item ?? null); setDescription(item?.description ?? ''); setColor(item?.color_indication ?? 'purple'); setError(''); setModal(kind);
  };
  const close = () => { if (!saving) { setModal(null); setError(''); } };
  const save = async(event:FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 3) return setError('Description must be at least 3 characters.');
    setSaving(true); setError('');
    try {
      const saved = await request(modal === 'edit' ? `/${selected?.id}` : '', { method:modal === 'edit' ? 'PUT' : 'POST', body:JSON.stringify({ description:description.trim(), color_indication:color }) }) as Classification;
      setItems((current) => modal === 'edit' ? current.map((item) => item.id === saved.id ? saved : item) : [saved,...current]);
      setNotice(modal === 'edit' ? 'Classification updated successfully.' : 'Classification added successfully.'); setModal(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save classification.'); }
    finally { setSaving(false); }
  };
  const remove = async() => {
    if (!selected) return;
    setSaving(true); setError('');
    try { await request(`/${selected.id}`,{method:'DELETE'}); setItems((current) => current.filter((item) => item.id !== selected.id)); setNotice('Classification deleted successfully.'); setModal(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete classification.'); }
    finally { setSaving(false); }
  };
  return <main className="procedure-page classification-page">
    <section><header className="countries-topbar"><p>Home <i>/</i> <b>Classification of Fees</b></p><div className="top-profile"><button>♧</button><span>MS</span><b>Mohammad Saleh<small>Administrator</small></b></div></header>
      <div className="countries-heading"><div><h1>Classification of Fees</h1><p>View and manage all fee classifications.</p></div><div className="procedure-controls"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="⌕  Search..."/><button className="country-add" onClick={() => open('add')} data-action="add" title="Add Classification"><ActionIcon name="add" /><span className="aipt-action-label">Add Classification</span></button></div></div>
      {notice && <div className="country-toast">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      <section className="country-table-card">{error && !modal && <p className="country-page-error">{error}</p>}<div className="country-table-wrap"><table><thead><tr><th><button className="aipt-sort" onClick={()=>{setAscending(!ascending);setPage(1)}}>Description {ascending?"?":"?"}</button></th><th>Color indicator</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={3} className="country-state">Loading classifications…</td></tr> : visible.length ? visible.map((item) => <tr key={item.id}><td><i className="procedure-dot" style={{background:hex(item.color_indication)}}/><b>{item.description}</b></td><td><span className="procedure-pill" style={{color:hex(item.color_indication),background:`${hex(item.color_indication)}16`}}><i style={{background:hex(item.color_indication)}}/>{item.color_indication}</span></td><td><button className="country-icon" onClick={() => open('view',item)}>⊙</button><button className="country-icon" onClick={() => open('edit',item)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button className="country-icon delete" onClick={() => open('delete',item)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></td></tr>) : <tr><td colSpan={3} className="country-state">No classifications found.</td></tr>}</tbody></table></div>
        <TablePagination page={currentPage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} />
      </section>
    </section>
    {modal && <div className="country-modal-backdrop" onMouseDown={close}><section className="country-modal" onMouseDown={(event) => event.stopPropagation()}>{modal === 'delete' && selected ? <><header className="country-panel-heading delete-title"><i>♲</i><div><h2>Delete Classification</h2><small>This action cannot be undone.</small></div><button onClick={close}>×</button></header><div className="country-delete-summary"><span>Description</span><b>: {selected.description}</b><span>Color indicator</span><b>: <i className="summary-dot" style={{background:hex(selected.color_indication)}}/> {selected.color_indication}</b></div>{error&&<p className="country-form-error">{error}</p>}<footer className="country-panel-footer"><button onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="delete-primary" disabled={saving} onClick={remove} data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">{saving?'Deleting…':'Delete'}</span></button></footer></> : modal === 'view' && selected ? <><header className="country-panel-heading"><h2>Classification Details</h2><button onClick={close}>×</button></header><div className="country-delete-summary"><span>Description</span><b>: {selected.description}</b><span>Color indicator</span><b>: <i className="summary-dot" style={{background:hex(selected.color_indication)}}/> {selected.color_indication}</b></div><footer className="country-panel-footer"><button onClick={close} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button></footer></> : <><header className="country-panel-heading"><h2>{modal==='add'?'Add Classification':'Edit Classification'}</h2><button onClick={close}>×</button></header><form onSubmit={save}><label className="country-label">Description <em>*</em><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter description"/></label><label className="country-label">Color indicator <em>*</em><span className="procedure-colors">{colors.map(([name,value]) => <button type="button" key={name} className={color===name?'chosen':''} style={{background:value}} onClick={() => setColor(name)}>{color===name?'✓':''}</button>)}</span></label>{error&&<p className="country-form-error">{error}</p>}<footer className="country-panel-footer"><button type="button" onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button disabled={saving} data-action="update" title="Save"><ActionIcon name="update" /><span className="aipt-action-label">{saving?'Saving…':modal==='add'?'Save':'Update'}</span></button></footer></form></>}</section></div>}
  </main>;
}

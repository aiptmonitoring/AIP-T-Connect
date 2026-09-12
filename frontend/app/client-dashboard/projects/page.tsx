'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import { Fragment, useCallback, useEffect, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

type Project = {
  id: string; aipt_ref_no: string; client_ref_no: string; project_name: string; matter_type: string; matter_date: string | null;
  status: string; filing_number: string | null; register_number: string | null; class_number: number | null; applicant: string | null;
  filing_date: string | null; registered_date: string | null; renewal_date: string | null; image_path: string | null;
  country?: { name: string; abbreviation?: string }; service?: { service: string; color?: string };
  procedure?: { description: string } | null;
};
type TimelineDocument = { id: string; document_name: string; document_size: number; document_type: string; created_at: string };
type TimelineEntry = { id: string; timeline_date: string; description: string; procedure?: { description: string; color_indication?: string } | null; documents: TimelineDocument[] };
type ProjectResponse = { data: Project[]; total: number; page: number; page_size: number };
const pageSize = 10;
const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Not set';
const statusClass = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const colorClass = (value?: string) => ['purple','blue','green','orange','red','teal','yellow','gray','pink','indigo'].includes(value ?? '') ? value : 'purple';

async function authenticatedRequest<T>(path: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw Error('Supabase is not configured.');
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw Error('Please sign in.');
  const response = await fetchSupabaseFunction(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.error || 'Unable to load project data.');
  return body as T;
}

function ProjectImage({ path, name }: { path: string | null; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    if (!path) return;
    void authenticatedRequest<{ url?: string }>(`projects/image-url?path=${encodeURIComponent(path)}`).then((body) => { if (active && body.url) setUrl(body.url); }).catch(() => undefined);
    return () => { active = false; };
  }, [path]);
  return url ? <img className='client-project-image' src={url} alt={`${name} project`}/> : <span className='client-project-image-placeholder'>{name.slice(0, 2).toUpperCase()}</span>;
}

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timelineProject, setTimelineProject] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineError, setTimelineError] = useState('');
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  const loadProjects = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (type !== 'all') params.set('matter_type', type);
      const body = await authenticatedRequest<ProjectResponse>(`projects?${params}`);
      setProjects(body.data); setTotal(body.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load projects.'); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, type]);
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase.channel('client-project-refresh').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => void loadProjects()).subscribe();
    window.addEventListener('focus', loadProjects);
    return () => { window.removeEventListener('focus', loadProjects); void supabase.removeChannel(channel); };
  }, [loadProjects]);

  const openTimeline = async (projectId: string) => {
    if (timelineProject === projectId) { setTimelineProject(null); return; }
    setTimelineProject(projectId); setTimelineEntries([]); setTimelineError(''); setLoadingTimeline(true);
    try { setTimelineEntries(await authenticatedRequest<TimelineEntry[]>(`timelines?project_id=${encodeURIComponent(projectId)}`)); }
    catch (cause) { setTimelineError(cause instanceof Error ? cause.message : 'Unable to load timeline.'); }
    finally { setLoadingTimeline(false); }
  };
  const downloadDocument = async (entry: TimelineEntry, document: TimelineDocument) => {
    setDocumentId(document.id);
    try { const body = await authenticatedRequest<{ url: string }>(`timelines/${entry.id}/documents/${document.id}/download-url?disposition=attachment`); window.open(body.url, '_blank', 'noopener,noreferrer'); }
    catch (cause) { setTimelineError(cause instanceof Error ? cause.message : 'Unable to download document.'); }
    finally { setDocumentId(null); }
  };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstResult = total ? (page - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(page * pageSize, total);

  return <section className='client-page client-projects-page'>
    <div className='client-projects-hero'><div><p className='client-kicker'>INTELLECTUAL PROPERTY PORTFOLIO</p><h1>My Projects</h1><p>Track every application, deadline, registration, and procedure milestone in one place.</p></div><div className='client-project-summary'><span><small>Total matters</small><b>{total}</b></span><span><small>Showing</small><b>{firstResult}–{lastResult}</b></span></div></div>
    {error && <p className='client-error'>{error}</p>}
    <div className='client-project-toolbar'><label><svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search by project, reference, filing number, or applicant...'/></label><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value='all'>All project types</option>{['trademark','patent','design','copyright','other'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></div>
    <section className='client-project-card'><header><div><h2>Project portfolio</h2><p>Client-scoped applications and live procedure history</p></div><span>{total} {total === 1 ? 'project' : 'projects'}</span></header>
      <div className='client-project-table-wrap'><table className='client-project-table'><thead><tr><th>Project</th><th>References</th><th>Type & procedure</th><th>Country</th><th>Status</th><th>Key dates</th><th>Timeline</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className='client-project-state'>Loading your portfolio...</td></tr> : projects.length ? projects.map((project) => <Fragment key={project.id}><tr className={timelineProject === project.id ? 'is-expanded' : ''}><td><div className='project-identity'><ProjectImage path={project.image_path} name={project.project_name}/><span><strong>{project.project_name}</strong><small>{project.applicant || 'Applicant not set'}</small></span></div></td><td><b>{project.client_ref_no}</b><small>AIP&amp;T {project.aipt_ref_no}</small>{project.filing_number && <small>Filing {project.filing_number}</small>}</td><td><span className='project-type-badge'>{project.matter_type}</span><small>{project.procedure?.description || project.service?.service || 'Procedure not assigned'}</small>{project.class_number && <small>Class {project.class_number}</small>}</td><td><b>{project.country?.name || 'Not set'}</b><small>{project.country?.abbreviation || ''}</small></td><td><span className={`status-tag ${statusClass(project.status)}`}>{project.status}</span></td><td><span className='project-date'><small>Filed</small><b>{date(project.filing_date)}</b></span><span className='project-date'><small>Renewal</small><b>{date(project.renewal_date)}</b></span></td><td><button type='button' className={`timeline-toggle${timelineProject === project.id ? ' active' : ''}`} onClick={() => void openTimeline(project.id)} data-action="view" data-icon-only="true" title="View timeline"><ActionIcon name="view" /><span className="aipt-action-label"><span>{timelineProject === project.id ? 'Hide timeline' : 'View timeline'}</span><i>⌄</i></span></button></td></tr>
          {timelineProject === project.id && <tr className='timeline-detail-row'><td colSpan={7}><div className='professional-timeline'><header><div><h3>Application timeline</h3><p>{project.project_name} · {project.aipt_ref_no}</p></div><span>{timelineEntries.length} milestones</span></header>{loadingTimeline ? <p className='timeline-state'>Loading timeline...</p> : timelineError ? <p className='timeline-state error'>{timelineError}</p> : timelineEntries.length ? <div className='timeline-track'>{timelineEntries.map((entry, index) => <article className={`timeline-milestone ${colorClass(entry.procedure?.color_indication)}`} key={entry.id}><div className='timeline-marker'><span>{index + 1}</span></div><div className='timeline-content'><header><div><strong>{entry.procedure?.description || 'Procedure update'}</strong><time>{date(entry.timeline_date)}</time></div><span className={`timeline-color-label ${colorClass(entry.procedure?.color_indication)}`}>{entry.procedure?.color_indication || 'Milestone'}</span></header><p>{entry.description}</p>{entry.documents.length > 0 && <div className='timeline-documents'>{entry.documents.map((document) => <button type='button' key={document.id} onClick={() => void downloadDocument(entry, document)} disabled={documentId === document.id}><span>↓</span><b>{documentId === document.id ? 'Opening...' : document.document_name}</b><small>{Math.ceil(document.document_size / 1024)} KB</small></button>)}</div>}</div></article>)}</div> : <p className='timeline-state'>No timeline entries have been published for this project.</p>}</div></td></tr>}
        </Fragment>) : <tr><td colSpan={7} className='client-project-state'>No projects match your search and filters.</td></tr>}
      </tbody></table></div>
      <footer className='client-project-pagination'><p>Showing <b>{firstResult}</b> to <b>{lastResult}</b> of <b>{total}</b> projects</p><nav aria-label='Project pagination'><button type='button' onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button>{Array.from({ length: pageCount }, (_, index) => index + 1).filter((value) => value === 1 || value === pageCount || Math.abs(value - page) <= 1).map((value, index, values) => <Fragment key={value}>{index > 0 && value - values[index - 1] > 1 && <span>…</span>}<button type='button' className={value === page ? 'active' : ''} aria-current={value === page ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button></Fragment>)}<button type='button' onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>Next</button></nav></footer>
    </section>
  </section>;
}

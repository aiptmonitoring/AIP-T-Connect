'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from '../../src/lib/supabase/browser';

type Country = { id: string; name: string; abbreviation: string };
type Service = { id: string; service: string };
type Procedure = { id: string; description: string; detail_text: string; color_indication: string; service_id: string; service?: { id: string; service: string } };
type Requirement = {
  id: string;
  country_id: string;
  service_id?: string | null;
  procedure_id: string | null;
  description: string;
  created_at: string;
  country?: Country;
  procedure?: Procedure;
  service?: { id: string; service: string } | null;
};
type Response = { data: Requirement[]; total: number };


function normalizeService(value: { id?: string; service?: string; name?: string }): Service {
  return { id: value.id ?? '', service: (value.service ?? value.name ?? '').trim() };
}

function enrichRequirement(item: Requirement, serviceRows: Service[], procedureRows: Procedure[]): Requirement {
  const procedure = item.procedure ?? procedureRows.find((value) => value.id === item.procedure_id);
  const serviceId = item.service_id ?? procedure?.service_id ?? null;
  const service = item.service ?? serviceRows.find((value) => value.id === serviceId);
  return {
    ...item,
    service_id: serviceId,
    service: service ?? null,
    procedure: procedure ? { ...procedure, service: procedure.service ?? service ?? undefined } : undefined,
  };
}

function plainText(value: string) {
  if (typeof window === 'undefined') return value.replace(/<[^>]*>/g, '');
  const node = document.createElement('div');
  node.innerHTML = value;
  return node.textContent ?? '';
}

function safeHtml(value: string) {
  if (typeof window === 'undefined') return value;
  const node = document.createElement('div');
  node.innerHTML = value;
  node.querySelectorAll('script,style,iframe,object,embed').forEach((item) => item.remove());
  node.querySelectorAll('*').forEach((item) => {
    [...item.attributes].forEach((attribute) => {
      if (attribute.name.startsWith('on') || attribute.name === 'style' || attribute.name === 'href' && !attribute.value.startsWith('#')) item.removeAttribute(attribute.name);
    });
  });
  return node.innerHTML;
}

function RequirementEditor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = value;
  }, [value]);
  const format = (command: string) => {
    editor.current?.focus();
    document.execCommand(command);
    onChange(editor.current?.innerHTML ?? '');
  };
  return <div className="requirement-editor-shell">
    {!disabled && <div className="requirement-editor-toolbar" role="toolbar" aria-label="Description formatting">
      <button type="button" aria-label="Bold" onClick={() => format('bold')}><b>B</b></button>
      <button type="button" aria-label="Italic" onClick={() => format('italic')}><i>I</i></button>
      <button type="button" aria-label="Underline" onClick={() => format('underline')}><u>U</u></button>
      <button type="button" aria-label="Bulleted list" onClick={() => format('insertUnorderedList')}>• List</button>
      <button type="button" aria-label="Numbered list" onClick={() => format('insertOrderedList')}>1. List</button>
    </div>}
    <div ref={editor} className="requirement-editor" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={() => onChange(editor.current?.innerHTML ?? '')} />
  </div>;
}

export default function RequirementsPage() {
  const pathname = usePathname();
  const readOnly = pathname.startsWith('/client-dashboard/');
  const [PAGE_SIZE, setPageSize] = useState(10);
  const [rows, setRows] = useState<Requirement[]>([]),
    [countries, setCountries] = useState<Country[]>([]),
    [services, setServices] = useState<Service[]>([]),
    [procedures, setProcedures] = useState<Procedure[]>([]);
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState('');
  const [sort, setSort] = useState('created'),
    [direction, setDirection] = useState('desc');
  const [modal, setModal] = useState<'add' | 'edit' | 'view' | 'delete' | null>(
      null,
    ),
    [selected, setSelected] = useState<Requirement | null>(null);
  const [countryId, setCountryId] = useState(''),
    [serviceId, setServiceId] = useState(''),
    [procedureId, setProcedureId] = useState(''),
    [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured.');
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw Error('Please sign in.');
    const response = await fetchSupabaseFunction(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const body =
      response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body?.error || 'Request failed.');
    return body;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        search,
        sort,
        direction,
      });
      const [requirements, countryRows, serviceRows, procedureRows] = await Promise.all([
        request(`requirements?${params}`),
        readOnly ? Promise.resolve([]) : request('countries'),
        readOnly ? Promise.resolve([]) : request('services?page=1&page_size=100&dir=asc'),
        readOnly ? Promise.resolve({ data: [] }) : request('procedures?page=1&perPage=100&sort=description'),
      ]);
      setCountries(countryRows as Country[]);
      const serviceData = Array.isArray(serviceRows)
        ? serviceRows
        : (serviceRows as { data?: Service[] }).data ?? [];
      const liveServices = (serviceData as Array<{ id?: string; service?: string; name?: string }>).map(normalizeService).filter((item) => item.id && item.service);
      const liveProcedures = ((procedureRows as { data?: Procedure[] }).data ?? []).filter((item) => item.id && item.description && item.service_id);
      setRows((requirements as Response).data.map((item) => enrichRequirement(item, liveServices, liveProcedures)));
      setTotal((requirements as Response).total);
      setServices(liveServices);
      setProcedures(liveProcedures);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load requirements.',
      );
    } finally {
      setLoading(false);
    }
  }, [request, page, search, sort, direction, readOnly, PAGE_SIZE]);
  useEffect(() => {
    void load();
  }, [load]);
  const open = (mode: typeof modal, item: Requirement | null = null) => {
    setSelected(item);
    setCountryId(item?.country_id ?? '');
    setServiceId(item?.service_id ?? item?.procedure?.service_id ?? '');
    setProcedureId(item?.procedure_id ?? '');
    setDescription(item?.description ?? '');
    setError('');
    setModal(mode);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!serviceId || !procedureId || !countryId) {
      setError('Service, country, and procedure are required.');
      return;
    }
    if (plainText(description).trim().length < 3) {
      setError('Description must be at least 3 characters.');
      return;
    }
    const procedure = procedures.find((item) => item.id === procedureId);
    if (!procedure || procedure.service_id !== serviceId) {
      setError('The selected procedure does not belong to the selected service.');
      return;
    }
    setSaving(true);
    try {
      const saved = await request(selected ? `requirements/${selected.id}` : 'requirements', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({ country_id: countryId, service_id: serviceId, procedure_id: procedureId, description: safeHtml(description) }),
      }) as Requirement;
      const enrichedSaved = enrichRequirement(saved, services, procedures);
      setNotice(selected ? 'Requirement updated.' : 'Requirement added.');
      setModal(null);
      if (selected) {
        setRows((current) => current.map((item) => item.id === enrichedSaved.id ? enrichedSaved : item));
      } else if (page === 1 && !search && sort === 'created' && direction === 'desc') {
        setRows((current) => [enrichedSaved, ...current].slice(0, PAGE_SIZE));
        setTotal((current) => current + 1);
      }
      void load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save requirement.',
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await request(`requirements/${selected.id}`, { method: 'DELETE' });
      setNotice('Requirement deleted.');
      setModal(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to delete requirement.',
      );
    } finally {
      setSaving(false);
    }
  };
  const sortBy = (value: string) => {
    if (sort === value) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSort(value);
      setDirection('asc');
    }
    setPage(1);
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const firstResult = total ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <main className="procedure-page requirement-page" style={readOnly ? { display: 'block', gridTemplateColumns: 'minmax(0, 1fr)', minHeight: 'auto' } : undefined}>
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Requirements</b>
          </p>
        </header>
        <div className="countries-heading">
          <div>
            <h1>Requirements</h1>
            <p>View country, procedure, and filing requirement descriptions.</p>
          </div>
          {!readOnly && <button className="country-add" onClick={() => open('add')} data-action="add" title="Add Requirement"><ActionIcon name="add" /><span className="aipt-action-label">Add Requirement</span></button>}
        </div>
        {notice && (
          <div className="country-toast">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}
        {error && !modal && <p className="country-page-error">{error}</p>}
        <section className="country-table-card">
          <div className="requirement-toolbar">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search countries or procedures..."
            />
            <span>{total} requirements</span>
          </div>
          <div className="country-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>
                    <button
                      className="statement-sort"
                      onClick={() => sortBy('country')}
                    >
                      Country ↕
                    </button>
                  </th>
                  <th>
                    <button
                      className="statement-sort"
                      onClick={() => sortBy('procedure')}
                    >
                      Procedure ↕
                    </button>
                  </th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="country-state">
                      Loading requirements...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.service?.service ?? item.procedure?.service?.service ?? services.find((service) => service.id === (item.service_id ?? item.procedure?.service_id))?.service ?? 'Not linked'}</td>
                      <td>
                        <b>{item.country?.name ?? '-'}</b>
                        <small>{item.country?.abbreviation}</small>
                      </td>
                      <td className="requirement-description">
                        <b style={{ display: 'block' }}>{item.procedure?.description ?? 'Not linked'}</b>
                        {item.procedure?.detail_text && <small style={{ display: 'block' }}>{item.procedure.detail_text}</small>}
                      </td>
                      <td className="requirement-description">{plainText(item.description)}</td>
                      <td>
                        <div className="user-actions">
                          <button onClick={() => open('view', item)} data-action="view" data-icon-only="true" title="View"><ActionIcon name="view" /><span className="aipt-action-label">View</span></button>
                          {!readOnly && <>
                          <button onClick={() => open('edit', item)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button>
                          <button onClick={() => open('delete', item)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="country-state">
                      No requirements found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={currentPage} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} />
        </section>
      </section>
      {modal && (
        <div
          className="country-modal-backdrop"
          onMouseDown={() => !saving && setModal(null)}
        >
          <section
            className="country-modal requirement-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="country-panel-heading">
              <h2>
                {modal === 'add'
                  ? 'Add Requirement'
                  : modal === 'edit'
                    ? 'Edit Requirement'
                    : modal === 'view'
                      ? 'Requirement Details'
                      : 'Delete Requirement'}
              </h2>
              <button onClick={() => setModal(null)}>×</button>
            </header>
            {readOnly && selected ? <dl className="requirement-view-details"><dt>Service</dt><dd>{selected.service?.service ?? selected.procedure?.service?.service ?? 'Not linked'}</dd><dt>Country</dt><dd>{selected.country?.name ?? '—'}</dd><dt>Procedure</dt><dd>{selected.procedure?.description ?? 'Not linked'}</dd><dt>Description</dt><dd>{plainText(selected.description)}</dd></dl> : modal === 'delete' ? (
              <>
                <p>Delete this requirement permanently?</p>
                {error && <p className="country-form-error">{error}</p>}
                <footer className="country-panel-footer">
                  <button onClick={() => setModal(null)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                  <button
                    className="delete-primary"
                    onClick={remove}
                    disabled={saving}
                   data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                </footer>
              </>
            ) : (
              <form onSubmit={save}>
                <label className="country-label">
                  Service <em>*</em>
                  <select
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      setProcedureId('');
                    }}
                    disabled={modal === 'view'}
                    required
                  >
                    <option value="">Select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.service}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="country-label">
                  Country <em>*</em>
                  <select
                    value={countryId}
                    onChange={(e) => setCountryId(e.target.value)}
                    disabled={modal === 'view'}
                    required
                  >
                    <option value="">Select country</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="country-label">
                  Procedure <em>*</em>
                  <select
                    value={procedureId}
                    onChange={(e) => setProcedureId(e.target.value)}
                    disabled={modal === 'view'}
                    required
                  >
                    <option value="">Select procedure</option>
                    {procedures
                      .filter((procedure) => !serviceId || procedure.service_id === serviceId)
                      .map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>
                        {procedure.description}
                      </option>
                      ))}
                  </select>
                </label>
                <label className="country-label">
                  Description <em>*</em>
                  <RequirementEditor value={description} onChange={setDescription} disabled={modal === 'view'} />
                </label>
                {error && <p className="country-form-error">{error}</p>}
                {modal !== 'view' && (
                  <footer className="country-panel-footer">
                    <button type="button" onClick={() => setModal(null)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                    <button disabled={saving} data-action="update" title="Save Requirement"><ActionIcon name="update" /><span className="aipt-action-label">
                      {saving ? 'Saving...' : 'Save Requirement'}
                    </span></button>
                  </footer>
                )}
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
const categories = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others'] as const;
type Category = typeof categories[number];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const money = (value: unknown) => Math.round(Math.max(0, Number(value ?? 0) || 0) * 100) / 100;
const categoryOf = (value: unknown): Category => categories.includes(value as Category) ? value as Category : (() => { throw Error('A valid fee category is required.'); })();

async function context(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) throw Object.assign(new Error('Authentication is required.'), { status: 401 });
  const { data: profile } = await db.from('profiles').select('role,client_id,approval_status,account_status').eq('id', user.id).single();
  if (!profile || !['administrator', 'client'].includes(profile.role)) throw Object.assign(new Error('Quotation access is not configured for this account.'), { status: 403 });
  if (profile.role === 'client') {
    if (profile.approval_status !== 'approved' || profile.account_status !== 'active' || !profile.client_id || !user.email) throw Object.assign(new Error('This client account is not approved and linked.'), { status: 403 });
    const { data: client } = await db.from('clients').select('email').eq('id', profile.client_id).is('deleted_at', null).maybeSingle();
    if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) throw Object.assign(new Error('The registered client email does not match this account.'), { status: 403 });
  }
  return { db, user, profile };
}

const listSelect = `id,reference_no,invoice_verification_token,status,vat_rate,vatable,discount,currency,client_matter_ref,invoice_date,subject,total_official_fee,total_attorney_fee,total_other_fee,total_vat,grand_total,created_at,updated_at,client:clients(id,company_name,email,address,country_id),project:projects(id,project_name,aipt_ref_no),primary_country:countries(id,name,abbreviation,flag_url),quotation_items(id,country_id,category,procedure_name,quantity,class_numbers,class_type,class_count,additional_fee_per_class,official_fee,attorney_fee,other_fee,claiming_priority,claiming_priority_fee,state_country_ids,state_fee_total,vat_rate,requirement_ids,country:countries(id,name,abbreviation,flag_url))`;
const publicSelect = `id,reference_no,invoice_verification_token,status,vat_rate,vatable,discount,currency,client_matter_ref,invoice_date,subject,total_official_fee,total_attorney_fee,total_other_fee,total_vat,grand_total,client:clients(company_name,address),quotation_items(id,country_id,category,procedure_name,quantity,class_numbers,class_type,class_count,additional_fee_per_class,official_fee,attorney_fee,other_fee,claiming_priority,claiming_priority_fee,state_country_ids,state_fee_total,vat_rate,requirement_ids,country:countries(name,abbreviation))`;

const aripoCountries = new Set(['botswana', 'cape verde', 'eswatini', 'gambia', 'lesotho', 'liberia', 'malawi', 'mozambique', 'namibia', 'sao tome and principe', 'sao tome & principe', 'uganda', 'zimbabwe']);

async function loadLookups(db: any, profile: { role: string; client_id?: string | null }) {
  const [{ data: clients, error: clientsError }, { data: projects, error: projectsError }, { data: countries, error: countriesError }, { data: feeCategories, error: categoriesError }, { data: feeServices, error: feeServicesError }, { data: procedures, error: proceduresError }, { data: requirements, error: requirementsError }, { data: services, error: servicesError }, { data: vatRates, error: vatError }] = await Promise.all([
    db.from('clients').select('id,assigned_id,company_name,email,address,country_id,status').is('deleted_at', null).order('company_name'),
    db.from('projects').select('id,client_id,project_name,aipt_ref_no,country_id,service_id,procedure_id,matter_type').is('deleted_at', null).order('project_name'),
    db.from('countries').select('id,name,abbreviation,flag_url').is('deleted_at', null).order('name'),
    db.from('fee_categories').select('id,name').in('name', categories as unknown as string[]).is('deleted_at', null).order('display_order'),
    db.from('fee_services').select('id,name,category_id').is('deleted_at', null).order('name'),
    db.from('procedures').select('id,description,service_id,services!inner(service)').is('deleted_at', null).order('description'),
    db.from('requirements').select('id,country_id,procedure_id,description').is('deleted_at', null).order('description'),
    db.from('services').select('id,service,color').is('deleted_at', null).order('service'),
    db.from('vat_rates').select('country_id,vat').is('deleted_at', null),
  ]);
  const error = [clientsError, projectsError, countriesError, categoriesError, feeServicesError, proceduresError, requirementsError, servicesError, vatError].find(Boolean);
  if (error) throw error;
  const categoryById = new Map((feeCategories ?? []).map((item: any) => [item.id, item.name]));
  const procedureById = new Map((procedures ?? []).map((item: any) => [item.id, item]));
  const { data: latest } = await db.from('fee_dataset_versions').select('id').eq('status', 'published').order('version_number', { ascending: false }).limit(1).maybeSingle();
  const { data: feeRows, error: feesError } = latest
    ? await db.from('fee_values').select('id,country_id,official_fee,attorney_fee,total_fee,fee_services!inner(name),fee_categories!inner(name)').eq('dataset_version_id', latest.id).eq('status', 'active')
    : { data: [], error: null };
  if (feesError) throw feesError;
  const { data: claimingPriorityRows, error: claimingPriorityError } = latest
    ? await db.from('fee_claiming_priority_values').select('country_id,official_fee,attorney_fee,total_fee,currency').eq('dataset_version_id', latest.id)
    : { data: [], error: null };
  if (claimingPriorityError) throw claimingPriorityError;
  const stateFeeRows = latest
    ? (feeRows ?? []).filter((item: any) => item.fee_categories?.name === 'Trademark' && /state/i.test(item.fee_services?.name ?? ''))
    : [];
  const visibleClients = profile.role === 'client'
    ? (clients ?? []).filter((item: any) => item.id === profile.client_id)
    : clients ?? [];
  const visibleProjects = profile.role === 'client'
    ? (projects ?? []).filter((item: any) => item.client_id === profile.client_id)
    : projects ?? [];
  return {
    role: profile.role,
    current_client_id: profile.client_id ?? null,
    clients: visibleClients,
    services: (services ?? []).map((item: any) => ({ id: item.id, name: item.service, category: '', description: item.service, display_color: item.color })),
    projects: visibleProjects,
    countries: countries ?? [],
    categories: (feeCategories ?? []).filter((item: any) => categories.includes(item.name)),
    procedures: (procedures ?? []).map((item: any) => ({ id: item.id, name: item.description, category: item.services?.service ?? '' })).filter((item: any) => categories.includes(item.category)),
    requirements: (requirements ?? []).map((item: any) => ({ ...item, procedure_id: item.procedure_id ?? null, procedure: procedureById.get(item.procedure_id)?.description ?? null, service_id: procedureById.get(item.procedure_id)?.service_id ?? null })),
    fees: (feeRows ?? []).map((item: any) => ({ id: item.id, country_id: item.country_id, category: item.fee_categories?.name, procedure_name: item.fee_services?.name, official_fee: item.official_fee ?? 0, attorney_fee: item.attorney_fee ?? 0, total_fee: item.total_fee ?? 0 })),
    claiming_priority_fees: (claimingPriorityRows ?? []).map((item: any) => ({ country_id: item.country_id, official_fee: item.official_fee ?? 0, attorney_fee: item.attorney_fee ?? 0, total_fee: item.total_fee ?? 0, currency: item.currency ?? 'USD' })),
    state_fees: stateFeeRows.map((item: any) => ({ id: item.id, country_id: item.country_id, procedure_name: item.fee_services?.name, official_fee: item.official_fee ?? 0, attorney_fee: item.attorney_fee ?? 0, total_fee: item.total_fee ?? 0 })),
    aripo_country_ids: (countries ?? []).filter((item: any) => aripoCountries.has(String(item.name).trim().toLowerCase())).map((item: any) => item.id),
    vat_rates: vatRates ?? [],
  };
}

async function resolveItems(db: any, items: any[]) {
  if (!Array.isArray(items) || items.length === 0) throw Error('Add at least one service to the quotation.');
  const { data: latest } = await db.from('fee_dataset_versions').select('id').eq('status', 'published').order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (!latest) throw Error('No published fee data is available. Synchronize the Fees page first.');
  const { data: procedureRows, error: procedureError } = await db.from('procedures').select('id,description,services!inner(service)').is('deleted_at', null);
  if (procedureError) throw procedureError;
  const procedureByKey = new Map((procedureRows ?? []).map((item: any) => [`${item.services?.service}|${item.description}`, item.id]));
  const requestedCategories = [...new Set(items.map((item: any) => categoryOf(item.category)))];
  const { data: serviceRows, error: serviceError } = await db.from('services').select('id,service').in('service', requestedCategories).is('deleted_at', null);
  if (serviceError) throw serviceError;
  if ((serviceRows ?? []).length !== requestedCategories.length) throw Error('The selected service is no longer available.');
  const { data: vatRates, error: vatError } = await db.from('vat_rates').select('country_id,vat').is('deleted_at', null);
  if (vatError) throw vatError;
  const vatByCountry = new Map((vatRates ?? []).map((row: any) => [row.country_id, money(row.vat)]));
  const resolved: any[] = [];
  for (const item of items) {
    const category = categoryOf(item.category);
    const countryId = typeof item.country_id === 'string' ? item.country_id : '';
    const procedureName = typeof item.procedure_name === 'string' ? item.procedure_name.trim() : '';
    if (!countryId || !procedureName) throw Error('Each service needs a country and procedure.');
    const { data: fee, error } = await db.from('fee_values').select('id,official_fee,attorney_fee,total_fee,currency,category_id,country_id,fee_services!inner(id,name),fee_categories!inner(name),countries!inner(name)').eq('dataset_version_id', latest.id).eq('status', 'active').eq('country_id', countryId).eq('fee_categories.name', category).eq('fee_services.name', procedureName).maybeSingle();
    if (error) throw error;
    if (!fee) throw Error(`No matching fee found for ${category}, ${procedureName}, and the selected country.`);
    const quantity = Math.min(1000, Math.max(1, Math.floor(Number(item.quantity) || 1)));
    const classNumbers = category === 'Trademark' && Array.isArray(item.class_numbers)
      ? [...new Set(item.class_numbers.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value >= 1 && value <= 45))]
      : [];
    if (category === 'Trademark' && Array.isArray(item.class_numbers) && classNumbers.length !== item.class_numbers.length) throw Error('Trademark classes must be whole numbers from 1 to 45.');
    const classMultiplier = Math.max(1, classNumbers.length);
    const classType = classNumbers.length === 1 ? 'Single' : classNumbers.length > 1 ? 'Multi' : null;
    const classCount = classNumbers.length;
    const total = money(fee.total_fee);
    const claimingPriority = category === 'Trademark' && item.claiming_priority === true;
    let claimingPriorityFee = 0;
    if (claimingPriority) {
      const { data: priority } = await db.from('fee_claiming_priority_values').select('official_fee,attorney_fee,total_fee').eq('dataset_version_id', latest.id).eq('country_id', countryId).maybeSingle();
      if (!priority) throw Error('Claiming Priority is not available for the selected country.');
      claimingPriorityFee = money(priority.total_fee ?? Number(priority.official_fee ?? 0) + Number(priority.attorney_fee ?? 0));
    }
    const stateCountryIds = category === 'Trademark' && Array.isArray(item.state_country_ids)
      ? [...new Set(item.state_country_ids.filter((value: unknown): value is string => typeof value === 'string'))]
      : [];
    let stateFeeTotal = 0;
    if (stateCountryIds.length) {
      const { data: stateCountries } = await db.from('countries').select('id,name').in('id', stateCountryIds).is('deleted_at', null);
      if ((stateCountries ?? []).length !== stateCountryIds.length || (stateCountries ?? []).some((state: any) => !aripoCountries.has(String(state.name).trim().toLowerCase()))) throw Error('States can only be selected from ARIPO countries.');
      const { data: stateFees } = await db.from('fee_values').select('country_id,total_fee,official_fee,attorney_fee,fee_services!inner(name),fee_categories!inner(name)').eq('dataset_version_id', latest.id).eq('status', 'active').in('country_id', stateCountryIds).eq('fee_categories.name', 'Trademark').ilike('fee_services.name', '%state%');
      if ((stateFees ?? []).length !== stateCountryIds.length) throw Error('A States fee is not available for every selected ARIPO country.');
      stateFeeTotal = money((stateFees ?? []).reduce((sum: number, row: any) => sum + Number(row.total_fee ?? Number(row.official_fee ?? 0) + Number(row.attorney_fee ?? 0)), 0));
    }
    const additional = 0;
    const requirementIds = Array.isArray(item.requirement_ids) ? item.requirement_ids.filter((id: unknown) => typeof id === 'string') : [];
    if (requirementIds.length) {
      const procedureId = procedureByKey.get(`${category}|${procedureName}`);
      const { data: requirements } = procedureId
        ? await db.from('requirements').select('id,procedure_id').in('id', requirementIds).eq('country_id', countryId).eq('procedure_id', procedureId).is('deleted_at', null)
        : { data: [] };
      if ((requirements ?? []).length !== requirementIds.length) throw Error('A selected requirement does not match the selected procedure and country.');
    }
    const vatRate = vatByCountry.get(countryId) ?? 0;
    const official = money(fee.official_fee * quantity * classMultiplier);
    const attorney = money(fee.attorney_fee * quantity * classMultiplier);
    const other = money(Math.max(0, total * quantity * classMultiplier - official - attorney));
    resolved.push({ country_id: countryId, category, procedure_name: procedureName, fee_value_id: fee.id, quantity, class_numbers: classNumbers, class_type: classType, class_count: classCount, additional_fee_per_class: 0, official_fee: official, attorney_fee: attorney, other_fee: other, vat_rate: vatRate, requirement_ids: requirementIds, claiming_priority: claimingPriority, claiming_priority_fee: money(claimingPriorityFee * quantity * classMultiplier), state_country_ids: stateCountryIds, state_fee_total: money(stateFeeTotal * quantity * classMultiplier), vat: attorney * vatRate / 100 });
  }
  return resolved;
}

function totals(items: any[], discount: number, vatRate: number) {
  const official = money(items.reduce((sum, item) => sum + item.official_fee, 0));
  const attorney = money(items.reduce((sum, item) => sum + item.attorney_fee, 0));
  const other = money(items.reduce((sum, item) => sum + item.other_fee + item.claiming_priority_fee + item.state_fee_total, 0));
  const vat = money(items.reduce((sum, item) => sum + item.attorney_fee * item.vat_rate / 100, 0));
  return { official, attorney, other, vat, grand: money(Math.max(0, official + attorney + other + vat - discount)) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  try {
    const publicUrl = new URL(request.url);
    const publicParts = publicUrl.pathname.split('/').filter(Boolean);
    const verificationIndex = publicParts.indexOf('verify');
    if (request.method === 'GET' && verificationIndex >= 0 && publicParts[verificationIndex + 1]) {
      const token = publicParts[verificationIndex + 1];
      if (!/^(?:[a-f0-9]{48}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(token)) return json({ error: 'Invoice verification record not found.' }, 404);
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const lookup = token.includes('-') ? db.from('quotations').select(publicSelect).eq('id', token) : db.from('quotations').select(publicSelect).eq('invoice_verification_token', token);
      const { data, error } = await lookup.eq('status', 'Approved').is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'Invoice verification record not found.' }, 404);
      return json(data);
    }
    const { db, user, profile } = await context(request);
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1);
    const isApproval = last === 'approve';
    const isCancellation = last === 'cancel';
    const resourcePart = isApproval || isCancellation ? parts.at(-2) : last;
    const id = resourcePart === 'quotations' ? null : resourcePart;
    if (request.method === 'GET' && url.searchParams.get('lookup') === 'true') return json(await loadLookups(db, profile));
    if (request.method === 'GET' && url.searchParams.get('next_reference') === 'true') {
      const category = categoryOf(url.searchParams.get('category'));
      const countryIds = (url.searchParams.get('country_ids') ?? '').split(',').filter(Boolean);
      if (!countryIds.length) return json({ reference: null });
      const prefix = category === 'Trademark' ? 'T' : category === 'Patent' ? 'P' : category === 'Design' ? 'D' : category === 'Copyright' ? 'C' : 'O';
      const { data: countries, error: countriesError } = await db.from('countries').select('id,abbreviation').in('id', countryIds).is('deleted_at', null);
      if (countriesError) throw countriesError;
      if (!countries?.length || countries.length !== countryIds.length) throw Error('One or more selected countries are invalid.');
      const referenceYear = new Date().getUTCFullYear();
      const { data: counter, error: counterError } = await db.from('quotation_reference_counters').select('next_sequence').eq('reference_year', referenceYear).eq('category_prefix', prefix).maybeSingle();
      if (counterError) throw counterError;
      const sequence = counter?.next_sequence ?? 6001;
      const abbreviation = countries.length > 1 ? 'INT' : String(countries[0].abbreviation).toUpperCase();
      return json({ reference: `${prefix}-${referenceYear}-${sequence}-${abbreviation}` });
    }
    if (request.method === 'GET') {
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? 10)));
      const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
      const status = url.searchParams.get('status');
      let query = db.from('quotations').select(listSelect).is('deleted_at', null).order('created_at', { ascending: false });
      if (profile.role === 'client') query = query.eq('client_id', profile.client_id).eq('status', 'Approved');
      const { data, error } = await query;
      if (error) throw error;
      const filtered = (data ?? []).filter((item: any) => (!status || item.status === status) && (!search || JSON.stringify(item).toLowerCase().includes(search)));
      return json({ data: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, page_size: pageSize });
    }
    if (profile.role !== 'administrator' && !(profile.role === 'client' && request.method === 'POST')) return json({ error: 'Only administrators can manage quotations.' }, 403);
    if (request.method === 'POST' && isApproval) {
      if (profile.role !== 'administrator') return json({ error: 'Only administrators can approve quotations.' }, 403);
      if (!id) throw Error('Quotation id is required.');
      const { data: existing } = await db.from('quotations').select('id,status').eq('id', id).is('deleted_at', null).maybeSingle();
      if (!existing) return json({ error: 'Quotation not found.' }, 404);
      if (existing.status !== 'Pending Approval') throw Error('Only pending quotations can be approved.');
      const result = await db.from('quotations').update({ status: 'Approved', approved_by: user.id, approved_at: new Date().toISOString() }).eq('id', id).select(listSelect).single();
      if (result.error) throw result.error;
      return json(result.data);
    }
    if (request.method === 'POST' && last === 'cancel') {
      if (!id) throw Error('Quotation id is required.');
      let cancelQuery = db.from('quotations').select('id,status,client_id').eq('id', id).is('deleted_at', null);
      if (profile.role === 'client') cancelQuery = cancelQuery.eq('client_id', profile.client_id);
      const { data: existing, error: existingError } = await cancelQuery.maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return json({ error: 'Quotation not found.' }, 404);
      if (['Approved', 'Posted', 'Cancelled'].includes(existing.status)) throw Error('This quotation cannot be cancelled.');
      const result = await db.from('quotations').update({ status: 'Cancelled' }).eq('id', id).select(listSelect).single();
      if (result.error) throw result.error;
      return json(result.data);
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      const vatable = body.vatable !== false;
      const discount = money(body.discount);
      const items = await resolveItems(db, body.items);
      if (!vatable) items.forEach((item) => { item.vat_rate = 0; });
      const vatRate = items.length ? items[0].vat_rate : 0;
      const summary = totals(items, discount, vatRate);
      const first = items[0];
      const clientId = profile.role === 'client'
        ? profile.client_id || ''
        : typeof body.client_id === 'string' ? body.client_id : '';
      if (!clientId) throw Error('A client is required.');
      const { data: client } = await db.from('clients').select('id').eq('id', clientId).is('deleted_at', null).maybeSingle();
      if (!client) throw Error('The selected client no longer exists.');
      if (body.project_id) {
        const { data: project } = await db.from('projects').select('id,client_id').eq('id', body.project_id).eq('client_id', clientId).is('deleted_at', null).maybeSingle();
        if (!project) throw Error('The inquiry project does not belong to the selected client.');
      }
      const payload = { client_id: clientId, project_id: body.project_id || null, primary_category: first.category, primary_country_id: first.country_id, client_matter_ref: typeof body.client_matter_ref === 'string' ? body.client_matter_ref.trim() : null, invoice_date: typeof body.invoice_date === 'string' && body.invoice_date ? body.invoice_date : new Date().toISOString().slice(0, 10), subject: typeof body.subject === 'string' ? body.subject.trim() : '', currency: 'USD', vatable, vat_rate: vatRate, discount, total_official_fee: summary.official, total_attorney_fee: summary.attorney, total_other_fee: summary.other, total_vat: summary.vat, grand_total: summary.grand };
      let quotation: any;
      if (request.method === 'POST') {
        const result = await db.from('quotations').insert({ ...payload, created_by: user.id, status: 'Pending Approval' }).select('id,reference_no,invoice_verification_token').single();
        if (result.error) throw result.error;
        quotation = result.data;
      } else {
        if (!id) throw Error('Quotation id is required.');
        const { data: existing } = await db.from('quotations').select('id,reference_no,status').eq('id', id).is('deleted_at', null).maybeSingle();
        if (!existing) throw Error('Quotation not found.');
        if (existing.status === 'Approved' || existing.status === 'Posted') throw Error('Approved or posted quotations cannot be edited.');
        const result = await db.from('quotations').update(payload).eq('id', id).select('id,reference_no,invoice_verification_token').single();
        if (result.error) throw result.error;
        quotation = result.data;
        await db.from('quotation_items').delete().eq('quotation_id', id);
      }
      const itemRows = items.map(({ vat, ...item }) => ({ ...item, quotation_id: quotation.id }));
      const inserted = await db.from('quotation_items').insert(itemRows);
      if (inserted.error) {
        if (request.method === 'POST') await db.from('quotations').delete().eq('id', quotation.id);
        throw inserted.error;
      }
      return json({ ...quotation, ...payload, items: itemRows }, request.method === 'POST' ? 201 : 200);
    }
    if (!id) throw Error('Quotation id is required.');
    const { data: existing } = await db.from('quotations').select('id,status').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!existing) return json({ error: 'Quotation not found.' }, 404);
    if (request.method === 'DELETE') {
      const result = await db.from('quotations').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (result.error) throw result.error;
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const error = cause as Error & { status?: number };
    return json({ error: error.message || 'Quotation request failed.' }, error.status ?? 400);
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GetObjectCommand, PutObjectCommand, S3Client } from 'https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle';

const cors = {
  'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const matterTypes = new Set(['trademark', 'patent', 'design', 'copyright', 'other']);
const awsRegion = Deno.env.get('AWS_REGION')!;
const awsBucket = Deno.env.get('AWS_S3_BUCKET')!;
const s3 = new S3Client({ region: awsRegion, credentials: { accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')! } });
const projectSelect = 'id,client_id,service_id,procedure_id,country_id,matter_type,matter_date,aipt_ref_no,client_ref_no,project_name,class_number,filing_number,filing_date,acceptance_number,acceptance_date,opposition_date,register_number,registered_date,deadline_date,renewal_date,annuity_years,annuity_date,applicant,status,approval_status,approved_at,approved_by,image_path,created_at,updated_at,deleted_at,client:clients(id,assigned_id,company_name,email,phone,client_type,address,country_id,notes,status),service:services(id,service,color),procedure:procedures!projects_procedure_id_fkey(id,description,service_id),procedures:project_procedures(sort_order,procedure:procedures!project_procedures_procedure_id_fkey(id,description,service_id)),country:countries(id,name,abbreviation,flag_url),custom_fields:project_field_values(field_definition_id,value)';
const fieldSelect = 'id,name,label,field_type,required,display_order,active,created_by,created_at,updated_at';

const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const requiredUuid = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw Error(`Select a valid ${name}.`);
  return value;
};
const optionalDate = (value: unknown, name: string) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error(`Provide a valid ${name}.`);
  return value;
};
const optionalText = (value: unknown, limit: number) => {
  const result = text(value, limit);
  return result || null;
};
const customFields = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const typeForServiceName = (service: string) => {
  const normalized = service.toLowerCase();
  if (normalized.includes('trademark')) return 'trademark';
  if (normalized.includes('patent')) return 'patent';
  if (normalized.includes('design')) return 'design';
  if (normalized.includes('copyright')) return 'copyright';
  return 'other';
};

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'project-image';

function ensureImageStorageConfigured() {
  if (!awsRegion || !awsBucket || !Deno.env.get('AWS_ACCESS_KEY_ID') || !Deno.env.get('AWS_SECRET_ACCESS_KEY')) {
    throw Error('AWS S3 is not configured for the Projects function. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.');
  }
}

function validate(body: unknown) {
  const value = body as Record<string, unknown>;
  const matter_date = optionalDate(value.matter_date, 'date');
  const aipt_ref_no = text(value.aipt_ref_no, 120);
  const client_ref_no = text(value.client_ref_no, 120);
  const project_name = text(value.project_name, 255);
  const applicant = optionalText(value.applicant, 255);
  const matter_type = text(value.matter_type, 20);
  const opposition_date = optionalDate(value.opposition_date, 'opposition date');
  const rawClass = value.class_number;
  const class_number = rawClass === null || rawClass === undefined || rawClass === '' ? null : Number(rawClass);
  const rawAnnuityYears = value.annuity_years;
  const annuity_years = rawAnnuityYears === null || rawAnnuityYears === undefined || rawAnnuityYears === '' ? null : Number(rawAnnuityYears);
  const annuity_date = optionalDate(value.annuity_date, 'annuity date');

  if (!matter_date) throw Error('Date is required.');
  if (!aipt_ref_no) throw Error('AIP&T reference number is required.');
  if (!client_ref_no) throw Error('Client reference number is required.');
  if (project_name.length < 2) throw Error('Project name must contain at least 2 characters.');
  if (applicant === null) throw Error('Applicant is required.');
  if (!matterTypes.has(matter_type)) throw Error('Choose a valid application type.');
  if (class_number !== null && (!Number.isInteger(class_number) || class_number < 1 || class_number > 50)) throw Error('Class must be a whole number from 1 to 50.');
  if (annuity_years !== null && (!Number.isInteger(annuity_years) || annuity_years < 1 || annuity_years > 50)) throw Error('Annuity years must be a whole number from 1 to 50.');
  if (matter_type !== 'patent' && (annuity_years !== null || annuity_date !== null)) throw Error('Annuity applies only to Patent matters.');

  const rawProcedureIds = value.procedure_ids;
  const procedure_ids = Array.isArray(rawProcedureIds)
    ? rawProcedureIds.filter((item): item is string => typeof item === 'string' && uuidPattern.test(item))
    : [];
  const primaryProcedureId = procedure_ids[0] ?? requiredUuid(value.procedure_id, 'procedure');
  if (!procedure_ids.length) procedure_ids.push(primaryProcedureId);

  return {
    client_id: requiredUuid(value.client_id, 'client'),
    service_id: requiredUuid(value.service_id, 'service'),
    procedure_id: primaryProcedureId,
    procedure_ids,
    country_id: requiredUuid(value.country_id, 'country'),
    matter_type,
    matter_date,
    aipt_ref_no,
    client_ref_no,
    project_name,
    class_number,
    filing_number: optionalText(value.filing_number, 120),
    filing_date: optionalDate(value.filing_date, 'filing date'),
    acceptance_number: optionalText(value.acceptance_number, 120),
    acceptance_date: optionalDate(value.acceptance_date, 'acceptance date'),
    opposition_date,
    register_number: optionalText(value.register_number, 120),
    registered_date: optionalDate(value.registered_date, 'registered date'),
    deadline_date: optionalDate(value.deadline_date, 'deadline'),
    renewal_date: optionalDate(value.renewal_date, 'renewal date'),
    annuity_years,
    annuity_date,
    applicant,
    image_path: optionalText(value.image_path, 500),
    custom_fields: customFields(value.custom_fields),
  };
}

async function ensureReferences(db: ReturnType<typeof createClient>, payload: ReturnType<typeof validate>) {
  const [clientResult, serviceResult, procedureResult, countryResult, proceduresResult] = await Promise.all([
    db.from('clients').select('id').eq('id', payload.client_id).is('deleted_at', null).maybeSingle(),
    db.from('services').select('id,service').eq('id', payload.service_id).is('deleted_at', null).maybeSingle(),
    db.from('procedures').select('id,service_id').eq('id', payload.procedure_id).is('deleted_at', null).maybeSingle(),
    db.from('countries').select('id').eq('id', payload.country_id).is('deleted_at', null).maybeSingle(),
    db.from('procedures').select('id,service_id').in('id', payload.procedure_ids).is('deleted_at', null),
  ]);
  if (clientResult.error) throw clientResult.error;
  if (serviceResult.error) throw serviceResult.error;
  if (procedureResult.error) throw procedureResult.error;
  if (countryResult.error) throw countryResult.error;
  if (proceduresResult.error) throw proceduresResult.error;
  if (!clientResult.data) throw Error('The selected client no longer exists.');
  if (!serviceResult.data) throw Error('The selected service no longer exists.');
  if (!procedureResult.data) throw Error('The selected procedure no longer exists.');
  if (!countryResult.data) throw Error('The selected country no longer exists.');
  if ((proceduresResult.data ?? []).length !== payload.procedure_ids.length) throw Error('One or more selected procedures no longer exists.');
  if ((proceduresResult.data ?? []).some((procedure) => procedure.service_id !== payload.service_id)) throw Error('All selected procedures must belong to the selected service.');
  if (procedureResult.data.service_id !== payload.service_id) throw Error('Choose a procedure that belongs to the selected service.');

  const inferredType = typeForServiceName(serviceResult.data.service);
  if (inferredType !== 'other' && inferredType !== payload.matter_type) throw Error('Choose a service that belongs to the selected application type.');
  if (payload.matter_type === 'other' && inferredType !== 'other') throw Error('Use the matching application type for this service.');
  if (payload.matter_type === 'trademark' && payload.class_number === null) throw Error('Class is required for Trademark matters.');
  if (!['trademark', 'copyright'].includes(payload.matter_type) && payload.class_number !== null) throw Error('Class applies only to Trademark or Copyright matters.');
}

async function syncProjectProcedures(db: ReturnType<typeof createClient>, projectId: string, procedureIds: string[]) {
  const { error: deleteError } = await db.from('project_procedures').delete().eq('project_id', projectId);
  if (deleteError) throw deleteError;
  const { error: insertError } = await db.from('project_procedures').insert(procedureIds.map((procedure_id, sort_order) => ({ project_id: projectId, procedure_id, sort_order })));
  if (insertError) throw insertError;
}

async function syncCustomFields(db: ReturnType<typeof createClient>, projectId: string, values: Record<string, unknown>) {
  const ids = Object.keys(values).filter((id) => uuidPattern.test(id));
  if (!ids.length) return;
  const { data: definitions, error: definitionError } = await db.from('project_field_definitions').select('id,field_type,required').is('deleted_at', null).eq('active', true);
  if (definitionError) throw definitionError;
  if (ids.some((id) => !(definitions ?? []).some((definition) => definition.id === id))) throw Error('One or more custom project fields are no longer available.');
  for (const definition of definitions ?? []) {
    const value = values[definition.id];
    if (definition.required && (value === '' || value === null || value === undefined)) throw Error('Required custom project fields must contain a value.');
  }
  const emptyIds: string[] = [];
  const rows = (definitions ?? []).filter((definition) => {
    const value = values[definition.id];
    if (value === '' || value === null || value === undefined) {
      emptyIds.push(definition.id);
      return false;
    }
    return true;
  }).map((definition) => {
    const value = values[definition.id];
    if (definition.field_type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw Error('Custom number fields must contain valid numbers.');
    if (definition.field_type === 'boolean' && typeof value !== 'boolean') throw Error('Custom yes/no fields must contain true or false.');
    if (definition.field_type === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))) throw Error('Custom date fields must contain valid dates.');
    return { project_id: projectId, field_definition_id: definition.id, value };
  });
  if (emptyIds.length) {
    const { error: deleteError } = await db.from('project_field_values').delete().eq('project_id', projectId).in('field_definition_id', emptyIds);
    if (deleteError) throw deleteError;
  }
  if (!rows.length) return;
  const { error } = await db.from('project_field_values').upsert(rows, { onConflict: 'project_id,field_definition_id' });
  if (error) throw error;
}

async function audit(db: ReturnType<typeof createClient>, actorId: string, action: 'create' | 'update' | 'delete', project: Record<string, unknown>, beforeData: Record<string, unknown> | null = null) {
  const { error } = await db.from('audit_logs').insert({ actor_id: actorId, entity_type: 'project', entity_id: project.id, action, before_data: beforeData, after_data: action === 'delete' ? null : project });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const { data: profile } = await db.from('profiles').select('role,client_id,approval_status,account_status').eq('id', user.id).single();
  if (!profile || !['administrator', 'client'].includes(profile.role)) return json({ error: 'Project access is not configured for this account.' }, 403);
  let clientId = profile.role === 'client' ? profile.client_id : null;
  if (profile.role === 'client' && !clientId && user.email) {
    const { data: client } = await db.from('clients').select('id').ilike('email', user.email).is('deleted_at', null).maybeSingle();
    if (client) {
      clientId = client.id;
      await db.from('profiles').update({ client_id: client.id }).eq('id', user.id);
    }
  }
  if (profile.role === 'client' && !clientId) return json({ error: 'This client account is not linked to a client record.' }, 403);
  if (profile.role === 'client') {
    if (profile.approval_status !== 'approved' || profile.account_status !== 'active' || !user.email) return json({ error: 'This client account is not approved and active.' }, 403);
    const { data: linkedClient } = await db.from('clients').select('email').eq('id', clientId).is('deleted_at', null).maybeSingle();
    if (!linkedClient || linkedClient.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return json({ error: 'The registered client email does not match this account.' }, 403);
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments.at(-1);
  const isRestore = last === 'restore';
  const id = (isRestore || last === 'approve') ? segments.at(-2) ?? null : (last === 'projects' ? null : last);
  const fieldId = segments.at(-2) === 'fields' ? last : null;
  try {
    if (profile.role !== 'administrator' && request.method !== 'GET') return json({ error: 'Only administrators can change projects.' }, 403);
    if (request.method === 'GET' && last === 'fields' && !fieldId) {
      const { data, error } = await db.from('project_field_definitions').select(fieldSelect).is('deleted_at', null).eq('active', true).order('display_order').order('created_at');
      if (error) throw error;
      return json(data ?? []);
    }
    if (request.method === 'POST' && last === 'fields' && !fieldId) {
      const value = await request.json() as Record<string, unknown>;
      const name = text(value.name, 80).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
      const label = text(value.label, 120);
      const fieldType = text(value.field_type, 20) || 'text';
      const displayOrder = Number(value.display_order ?? 0);
      if (!name || !label || !['text', 'number', 'date', 'boolean'].includes(fieldType) || !Number.isInteger(displayOrder) || displayOrder < 0) {
        return json({ error: 'Provide a valid field name, label, type, and display order.' }, 400);
      }
      const { data, error } = await db.from('project_field_definitions').insert({ name, label, field_type: fieldType, required: value.required === true, display_order: displayOrder, created_by: user.id }).select(fieldSelect).single();
      if (error) throw error;
      return json(data, 201);
    }
    if (fieldId && request.method === 'DELETE') {
      const { error } = await db.from('project_field_definitions').update({ deleted_at: new Date().toISOString(), active: false }).eq('id', fieldId).is('deleted_at', null);
      if (error) throw error;
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method === 'POST' && last === 'upload-image') {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Select a project image.' }, 400);
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type) || file.size < 1 || file.size > 2 * 1024 * 1024) {
        return json({ error: 'Project image must be JPG, PNG, WEBP, or SVG and no larger than 2MB.' }, 400);
      }
      ensureImageStorageConfigured();
      const imagePath = `projects/images/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      await s3.send(new PutObjectCommand({ Bucket: awsBucket, Key: imagePath, Body: new Uint8Array(await file.arrayBuffer()), ContentType: file.type }));
      return json({ image_path: imagePath }, 201);
    }
    if (request.method === 'GET' && last === 'image-url') {
      const imagePath = url.searchParams.get('path');
      if (!imagePath || !imagePath.startsWith('projects/images/')) return json({ error: 'A valid project image path is required.' }, 400);
      ensureImageStorageConfigured();
      const projectQuery = db.from('projects').select('id,client_id').eq('image_path', imagePath).is('deleted_at', null);
      if (profile.role === 'client') projectQuery.eq('client_id', clientId).eq('approval_status', 'approved');
      const { data: project, error: projectError } = await projectQuery.maybeSingle();
      if (projectError) throw projectError;
      if (!project) return json({ error: 'Project image not found.' }, 404);
      return json({ url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: awsBucket, Key: imagePath }), { expiresIn: 300 }) });
    }
    if (request.method === 'GET' && id) {
      let detailQuery = db.from('projects').select(projectSelect).eq('id', id).is('deleted_at', null);
      if (profile.role === 'client') detailQuery = detailQuery.eq('client_id', clientId).eq('approval_status', 'approved');
      const { data, error } = await detailQuery.maybeSingle();
      if (error) throw error;
      return data ? json(data) : json({ error: 'Matter not found.' }, 404);
    }
    if (request.method === 'GET') {
      const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1);
      const pageSize = Math.min(Math.max(Number(url.searchParams.get('page_size') ?? 20), 1), 100);
      const requestedClientId = url.searchParams.get('client_id');
      const serviceId = url.searchParams.get('service_id');
      const matterType = url.searchParams.get('matter_type');
      const approvalStatus = url.searchParams.get('approval_status');
      const search = (url.searchParams.get('search') ?? '').trim();
      if (matterType && !matterTypes.has(matterType)) return json({ error: 'Choose a valid application type.' }, 400);
      if (approvalStatus && !['draft', 'pending', 'approved', 'rejected'].includes(approvalStatus)) return json({ error: 'Choose a valid approval status.' }, 400);
      const restore = url.searchParams.get('restore') === 'true';
      const sortable = ['matter_date', 'aipt_ref_no', 'client_ref_no', 'project_name', 'filing_number', 'register_number', 'applicant', 'status', 'approval_status', 'deadline_date', 'renewal_date', 'filing_date', 'registered_date'];
      const sort = url.searchParams.get('sort') || 'matter_date';
      if (!sortable.includes(sort)) return json({ error: 'Invalid sort field.' }, 400);
      let query = db.from('projects').select(projectSelect, { count: 'exact' }).order(sort, { ascending: url.searchParams.get('direction') === 'asc', nullsFirst: false }).order('id');
      query = restore ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
      if (profile.role === 'client') query = query.eq('client_id', clientId).eq('approval_status', 'approved');
      else if (requestedClientId) query = query.eq('client_id', requestedClientId);
      if (serviceId) query = query.eq('service_id', serviceId);
      if (profile.role === 'administrator' && approvalStatus) query = query.eq('approval_status', approvalStatus);
      if (matterType) query = query.eq('matter_type', matterType);
      if (search) query = query.or(`aipt_ref_no.ilike.%${search}%,client_ref_no.ilike.%${search}%,project_name.ilike.%${search}%,filing_number.ilike.%${search}%,applicant.ilike.%${search}%`);
      const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;
      return json({ data: data ?? [], total: count ?? 0, page, page_size: pageSize });
    }
    if (request.method === 'POST' && !id) {
      const payload = validate(await request.json());
      await ensureReferences(db, payload);
      const { procedure_ids: _procedureIds, custom_fields: customFieldValues, ...projectPayload } = payload;
      const { data, error } = await db.from('projects').insert({ ...projectPayload, approval_status: 'pending' }).select(projectSelect).single();
      if (error) throw error;
      await syncProjectProcedures(db, data.id, payload.procedure_ids);
      const { data: complete, error: completeError } = await db.from('projects').select(projectSelect).eq('id', data.id).single();
      if (completeError) throw completeError;
      await syncCustomFields(db, data.id, customFieldValues);
      await audit(db, user.id, 'create', complete);
      return json(complete, 201);
    }
    if (!id) return json({ error: 'Matter id is required.' }, 400);
    const beforeQuery = db.from('projects').select(projectSelect).eq('id', id);
    const { data: before, error: beforeError } = isRestore
      ? await beforeQuery.not('deleted_at', 'is', null).maybeSingle()
      : await beforeQuery.is('deleted_at', null).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return json({ error: 'Matter not found.' }, 404);
    if (request.method === 'POST' && isRestore) {
      const { data, error } = await db.from('projects').update({ deleted_at: null }).eq('id', id).not('deleted_at', 'is', null).select(projectSelect).single();
      if (error) throw error;
      await audit(db, user.id, 'update', data, before);
      return json(data);
    }
    if (request.method === 'POST' && last === 'approve') {
      const { data, error } = await db.from('projects')
        .update({ approval_status: 'approved', approved_at: new Date().toISOString(), approved_by: user.id })
        .eq('id', id)
        .is('deleted_at', null)
        .select(projectSelect)
        .single();
      if (error) throw error;
      await audit(db, user.id, 'update', data, before);
      return json(data);
    }    if (request.method === 'PUT') {
      const payload = validate(await request.json());
      await ensureReferences(db, payload);
      const { procedure_ids: _procedureIds, custom_fields: customFieldValues, ...projectPayload } = payload;
      const { data, error } = await db.from('projects').update(projectPayload).eq('id', id).is('deleted_at', null).select(projectSelect).single();
      if (error) throw error;
      await syncProjectProcedures(db, id, payload.procedure_ids);
      const { data: complete, error: completeError } = await db.from('projects').select(projectSelect).eq('id', id).single();
      if (completeError) throw completeError;
      await syncCustomFields(db, id, customFieldValues);
      await audit(db, user.id, 'update', complete, before);
      return json(complete);
    }
    if (request.method === 'DELETE') {
      const { error } = await db.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
      if (error) throw error;
      await audit(db, user.id, 'delete', before, before);
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const error = cause as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    if (error.name === 'NoSuchBucket' || /specified bucket does not exist/i.test(error.message ?? '')) {
      return json({ error: 'The configured AWS S3 bucket could not be found. Verify AWS_S3_BUCKET and AWS_REGION in the Projects function secrets.' }, 502);
    }
    if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403 || /access denied/i.test(error.message ?? '')) {
      return json({ error: 'AWS denied access to the project image bucket. Verify the bucket exists in AWS_REGION and grant the Projects function s3:PutObject and s3:GetObject on projects/images/*.' }, 502);
    }
    if (error.name === 'PermanentRedirect' || error.name === 'AuthorizationHeaderMalformed' || /region/i.test(error.message ?? '')) {
      return json({ error: 'AWS rejected the project image bucket region. Set AWS_REGION to the bucket region and redeploy the Projects function.' }, 502);
    }
    return json({ error: error.message ?? 'Request failed.' }, 400);
  }
});



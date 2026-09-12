import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxDocumentSize = 10 * 1024 * 1024;
const maxDocumentCount = 10;
const maxDocumentTotalSize = 50 * 1024 * 1024;
const documentTypes: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  svg: "image/svg+xml",
};
const allowedDocumentTypes = new Set(Object.values(documentTypes));
const region = Deno.env.get("AWS_REGION")!;
const bucket = Deno.env.get("AWS_S3_BUCKET")!;
const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  },
});

const timelineSelect = "id,project_id,procedure_id,timeline_date,description,created_by,created_at,updated_at,procedure:procedures(id,description,service_id,color_indication),documents:project_timeline_documents(id,document_name,document_size,document_type,created_at,deleted_at)";

type TimelineDocument = {
  id: string;
  document_name: string;
  document_size: number;
  document_type: string;
  created_at: string;
  deleted_at?: string | null;
};
type TimelineRecord = Record<string, unknown> & { documents?: TimelineDocument[] };

function requiredUuid(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw Error(`Select a valid ${label}.`);
  return value;
}

function requiredDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw Error("Select a valid timeline date.");
  }
  return value;
}

function requiredDescription(value: FormDataEntryValue | null) {
  const description = typeof value === "string" ? value.trim() : "";
  if (description.length < 3 || description.length > 5000) throw Error("Description must contain between 3 and 5,000 characters.");
  return description;
}

function extractFiles(form: FormData) {
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length > maxDocumentCount) throw Error(`Upload up to ${maxDocumentCount} documents at a time.`);
  if (files.reduce((total, file) => total + file.size, 0) > maxDocumentTotalSize) throw Error("The combined document size must not exceed 50MB.");
  return files.map((file) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const documentType = allowedDocumentTypes.has(file.type) ? file.type : documentTypes[extension];
    if (!documentType || file.size < 1 || file.size > maxDocumentSize) {
      throw Error("Each document must be a PDF, PNG, JPG, DOC, DOCX, XLS, or XLSX file up to 10MB.");
    }
    return { file, documentType };
  });
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "document";
}

function sanitizeTimeline(timeline: TimelineRecord) {
  const documents = Array.isArray(timeline.documents) ? timeline.documents : [];
  return {
    ...timeline,
    documents: documents
      .filter((document) => !document.deleted_at)
      .map(({ deleted_at: _deletedAt, ...document }) => document)
      .sort((first, second) => first.created_at.localeCompare(second.created_at)),
  };
}


async function authenticate(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return { db, user: null, error: json({ error: "Authentication is required." }, 401) };
  const { data: profile } = await db.from("profiles").select("role,client_id").eq("id", user.id).single();
  if (!profile || !["administrator", "client"].includes(profile.role)) return { db, user: null, profile: null, error: json({ error: "Timeline access is not configured for this account." }, 403) };
  return { db, user, profile, error: null };
}

async function ensureProjectProcedure(db: ReturnType<typeof createClient>, projectId: string, procedureId: string) {
  const [projectResult, procedureResult] = await Promise.all([
    db.from("projects").select("id,service_id").eq("id", projectId).is("deleted_at", null).maybeSingle(),
    db.from("procedures").select("id,service_id").eq("id", procedureId).is("deleted_at", null).maybeSingle(),
  ]);
  if (projectResult.error) throw projectResult.error;
  if (procedureResult.error) throw procedureResult.error;
  if (!projectResult.data) throw Error("The selected application no longer exists.");
  if (!procedureResult.data || procedureResult.data.service_id !== projectResult.data.service_id) {
    throw Error("Choose a procedure that belongs to this application service.");
  }
}

async function uploadDocuments(files: Array<{ file: File; documentType: string }>, projectId: string, timelineId: string) {
  if (!files.length) return [];
  const uploaded: Array<{ object_key: string; document_name: string; document_size: number; document_type: string }> = [];
  try {
    for (const { file, documentType } of files) {
      const object_key = `notifications/timelines/${projectId}/${timelineId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: object_key,
        Body: new Uint8Array(await file.arrayBuffer()),
        ContentType: documentType,
      }));
      uploaded.push({ object_key, document_name: file.name, document_size: file.size, document_type: documentType });
    }
    return uploaded;
  } catch (cause) {
    await Promise.allSettled(uploaded.map((document) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: document.object_key }))));
    throw cause;
  }
}

async function removeDocumentsFromStorage(keys: string[]) {
  if (!keys.length) return;
  await Promise.all(keys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
}

async function getTimeline(db: ReturnType<typeof createClient>, timelineId: string) {
  const { data, error } = await db.from("project_timelines").select(timelineSelect).eq("id", timelineId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data ? sanitizeTimeline(data as TimelineRecord) : null;
}

async function audit(db: ReturnType<typeof createClient>, actorId: string, action: "create" | "update" | "delete", timeline: Record<string, unknown>, beforeData: Record<string, unknown> | null = null) {
  const { error } = await db.from("audit_logs").insert({
    actor_id: actorId,
    entity_type: "project_timeline",
    entity_id: timeline.id,
    action,
    before_data: beforeData,
    after_data: action === "delete" ? null : timeline,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const auth = await authenticate(request);
  if (auth.error || !auth.user) return auth.error ?? json({ error: "Authentication is required." }, 401);
  const { db, user, profile } = auth;
  if (!profile) return json({ error: "Timeline access is not configured for this account." }, 403);
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const rootIndex = segments.lastIndexOf("timelines");
  const route = rootIndex === -1 ? [] : segments.slice(rootIndex + 1);

  try {
    if (request.method === "GET" && route.length === 0) {
      const projectId = new URL(request.url).searchParams.get("project_id");
      if (!projectId || !uuidPattern.test(projectId)) return json({ error: "A valid application id is required." }, 400);
      let projectQuery = db.from("projects").select("id,client_id").eq("id", projectId).is("deleted_at", null);
      if (profile.role === "client") projectQuery = projectQuery.eq("client_id", profile.client_id).eq("approval_status", "approved");
      const { data: project, error: projectError } = await projectQuery.maybeSingle();
      if (projectError) throw projectError;
      if (!project) return json({ error: "Application not found." }, 404);
      const { data, error } = await db
        .from("project_timelines")
        .select(timelineSelect)
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("timeline_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json((data ?? []).map((timeline) => sanitizeTimeline(timeline as TimelineRecord)));
    }

    if (request.method === "GET" && route.length === 4 && route[1] === "documents" && route[3] === "download-url") {
      const [timelineId, , documentId] = route;
      if (!uuidPattern.test(timelineId) || !uuidPattern.test(documentId)) return json({ error: "A valid timeline document id is required." }, 400);
      const { data: document, error: documentError } = await db
        .from("project_timeline_documents")
        .select("id,timeline_id,object_key,document_name,document_type")
        .eq("id", documentId)
        .eq("timeline_id", timelineId)
        .is("deleted_at", null)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document) return json({ error: "Timeline document not found." }, 404);
      const { data: timelineRecord, error: timelineRecordError } = await db.from("project_timelines").select("id,project_id").eq("id", timelineId).is("deleted_at", null).maybeSingle();
      if (timelineRecordError) throw timelineRecordError;
      if (!timelineRecord) return json({ error: "Timeline entry not found." }, 404);
      let projectQuery = db.from("projects").select("id").eq("id", timelineRecord.project_id).is("deleted_at", null);
      if (profile.role === "client") {
        if (!profile.client_id) return json({ error: "This client account is not linked to a client record." }, 403);
        projectQuery = projectQuery.eq("client_id", profile.client_id).eq("approval_status", "approved");
      }
      const { data: project, error: projectError } = await projectQuery.maybeSingle();
      if (projectError) throw projectError;
      if (!project) return json({ error: "Timeline entry not found." }, 404);
      const requestedDisposition = new URL(request.url).searchParams.get("disposition");
      const disposition = requestedDisposition === "attachment" ? "attachment" : "inline";
      const documentName = safeFileName(document.document_name);
      return json({
        url: await getSignedUrl(s3, new GetObjectCommand({
          Bucket: bucket,
          Key: document.object_key,
          ResponseContentDisposition: `${disposition}; filename="${documentName}"`,
          ResponseContentType: document.document_type,
        }), { expiresIn: 300 }),
      });
    }

    if (profile.role !== "administrator" && request.method !== "GET") return json({ error: "Only administrators can change timeline entries." }, 403);
    if (request.method === "POST" && route.length === 0) {
      const form = await request.formData();
      const project_id = requiredUuid(form.get("project_id"), "application");
      const procedure_id = requiredUuid(form.get("procedure_id"), "procedure");
      const timeline_date = requiredDate(form.get("timeline_date"));
      const description = requiredDescription(form.get("description"));
      const files = extractFiles(form);
      await ensureProjectProcedure(db, project_id, procedure_id);
      const timelineId = crypto.randomUUID();
      const documents = await uploadDocuments(files, project_id, timelineId);
      try {
        const { error: timelineError } = await db.from("project_timelines").insert({ id: timelineId, project_id, procedure_id, timeline_date, description, created_by: user.id });
        if (timelineError) throw timelineError;
        if (documents.length) {
          const { error: documentError } = await db.from("project_timeline_documents").insert(documents.map((document) => ({ timeline_id: timelineId, ...document })));
          if (documentError) throw documentError;
        }
        const created = await getTimeline(db, timelineId);
        if (!created) throw Error("Timeline entry could not be loaded after creation.");
        await audit(db, user.id, "create", created);
        return json(created, 201);
      } catch (cause) {
        await Promise.allSettled(documents.map((document) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: document.object_key }))));
        throw cause;
      }
    }

    if (!route[0] || !uuidPattern.test(route[0])) return json({ error: "A valid timeline id is required." }, 400);
    const timelineId = route[0];
    const before = await getTimeline(db, timelineId);
    if (!before) return json({ error: "Timeline entry not found." }, 404);

    if (request.method === "PUT" && route.length === 1) {
      const form = await request.formData();
      const project_id = requiredUuid(form.get("project_id"), "application");
      if (project_id !== before.project_id) return json({ error: "A timeline entry cannot be moved to another application." }, 400);
      const procedure_id = requiredUuid(form.get("procedure_id"), "procedure");
      const timeline_date = requiredDate(form.get("timeline_date"));
      const description = requiredDescription(form.get("description"));
      const files = extractFiles(form);
      await ensureProjectProcedure(db, project_id, procedure_id);
      const documents = await uploadDocuments(files, project_id, timelineId);
      try {
        const { error: updateError } = await db.from("project_timelines").update({ procedure_id, timeline_date, description }).eq("id", timelineId).is("deleted_at", null);
        if (updateError) throw updateError;
        if (documents.length) {
          const { error: documentError } = await db.from("project_timeline_documents").insert(documents.map((document) => ({ timeline_id: timelineId, ...document })));
          if (documentError) throw documentError;
        }
        const updated = await getTimeline(db, timelineId);
        if (!updated) throw Error("Timeline entry could not be loaded after update.");
        await audit(db, user.id, "update", updated, before);
        return json(updated);
      } catch (cause) {
        await Promise.allSettled(documents.map((document) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: document.object_key }))));
        throw cause;
      }
    }

    if (request.method === "DELETE" && route.length === 3 && route[1] === "documents") {
      const documentId = route[2];
      if (!uuidPattern.test(documentId)) return json({ error: "A valid timeline document id is required." }, 400);
      const { data: document, error } = await db
        .from("project_timeline_documents")
        .select("id,object_key")
        .eq("id", documentId)
        .eq("timeline_id", timelineId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!document) return json({ error: "Timeline document not found." }, 404);
      const { error: updateError } = await db.from("project_timeline_documents").update({ deleted_at: new Date().toISOString() }).eq("id", documentId).is("deleted_at", null);
      if (updateError) throw updateError;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: document.object_key }));
      const updated = await getTimeline(db, timelineId);
      if (updated) await audit(db, user.id, "update", updated, before);
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "DELETE" && route.length === 1) {
      const { data: documents, error: documentError } = await db
        .from("project_timeline_documents")
        .select("id,object_key")
        .eq("timeline_id", timelineId)
        .is("deleted_at", null);
      if (documentError) throw documentError;
      const timestamp = new Date().toISOString();
      const { error: timelineError } = await db.from("project_timelines").update({ deleted_at: timestamp }).eq("id", timelineId).is("deleted_at", null);
      if (timelineError) throw timelineError;
      if (documents?.length) {
        const { error: markDocumentsError } = await db.from("project_timeline_documents").update({ deleted_at: timestamp }).eq("timeline_id", timelineId).is("deleted_at", null);
        if (markDocumentsError) throw markDocumentsError;
      }
      await removeDocumentsFromStorage((documents ?? []).map((document) => document.object_key));
      await audit(db, user.id, "delete", before, before);
      return new Response(null, { status: 204, headers: cors });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    const error = cause as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    if (error.name === "NoSuchBucket" || /specified bucket does not exist/i.test(error.message ?? "")) {
      return json({ error: "The configured AWS S3 bucket could not be found. Verify AWS_S3_BUCKET and AWS_REGION in the Timeline function secrets." }, 502);
    }
    if (error.name === "AccessDenied" || error.$metadata?.httpStatusCode === 403 || /access denied/i.test(error.message ?? "")) {
      return json({ error: "AWS denied access to the timeline document bucket. Grant the configured IAM user bucket setup access and s3:PutObject, s3:GetObject, and s3:DeleteObject for notifications/timelines/*." }, 502);
    }
    return json({ error: error.message ?? "Request failed." }, error.$metadata?.httpStatusCode && error.$metadata.httpStatusCode >= 500 ? 502 : 400);
  }
});


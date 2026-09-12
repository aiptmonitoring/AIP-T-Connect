import { createClient } from "npm:@supabase/supabase-js@2";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const allowed = new Set(["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "gif", "webp"]);
const bucket = Deno.env.get("AWS_S3_BUCKET");
const region = Deno.env.get("AWS_REGION");
const s3 = new S3Client({ region: region!, credentials: { accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")! } });
const select = "id,statement_date,client_id,description,document_key,document_name,document_size,document_type,approval_status,approved_at,payment_status,paid_at,paid_by,created_at,updated_at,client:clients(id,assigned_id,company_name,email)";

async function auth(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return { db, user: null, profile: null, error: json({ error: "Authentication is required." }, 401) };
  const { data: profile } = await db.from("profiles").select("role,client_id,approval_status,account_status").eq("id", user.id).single();
  if (!profile || !["administrator", "client"].includes(profile.role)) return { db, user: null, profile: null, error: json({ error: "Statement access is not configured for this account." }, 403) };
  if (profile.role === "client") {
    if (profile.approval_status !== "approved" || profile.account_status !== "active" || !profile.client_id || !user.email) return { db, user: null, profile: null, error: json({ error: "This client account is not approved and linked." }, 403) };
    const { data: client } = await db.from("clients").select("email").eq("id", profile.client_id).is("deleted_at", null).maybeSingle();
    if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return { db, user: null, profile: null, error: json({ error: "The registered client email does not match this account." }, 403) };
  }
  return { db, user, profile, error: null };
}
function fileInfo(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.has(extension) || file.size < 1 || file.size > 10 * 1024 * 1024) throw Error("Upload a PDF, Word, Excel, JPG, PNG, GIF, or WEBP file up to 10MB.");
  return extension;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const { db, user, profile, error } = await auth(request);
  if (error || !user || !profile) return error ?? json({ error: "Authentication is required." }, 401);
  try {
    const url = new URL(request.url);
    const id = url.pathname.split("/").filter(Boolean).at(-1);
    if (request.method === "GET" && (!id || id === "statements")) {
      let query = db.from("statements").select(select).is("deleted_at", null).order("statement_date", { ascending: false });
      if (profile.role === "client") query = query.eq("client_id", profile.client_id ?? "");
      if (profile.role === "client") query = query.eq("approval_status", "approved");
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      return json(data ?? []);
    }
    if (request.method === "GET" && id && id !== "statements" && id !== "download-url") {
      const { data, error: detailError } = await db.from("statements").select(select).eq("id", id).is("deleted_at", null).maybeSingle();
      if (detailError) throw detailError;
      if (!data || (profile.role === "client" && (data.client_id !== profile.client_id || data.approval_status !== "approved"))) return json({ error: "Statement not found." }, 404);
      return json(data);
    }
    if (request.method === "GET" && id === "download-url") {
      const statementId = url.pathname.split("/").filter(Boolean).at(-2);
      const { data: statement } = await db.from("statements").select("client_id,approval_status,document_key,document_name,document_type").eq("id", statementId ?? "").is("deleted_at", null).maybeSingle();
      if (!statement || !statement.document_key || (profile.role === "client" && (statement.client_id !== profile.client_id || statement.approval_status !== "approved"))) return json({ error: "Document not found." }, 404);
      if (!bucket || !region) throw Error("Statement document storage is not configured.");
      return json({ url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: statement.document_key, ResponseContentDisposition: `attachment; filename="${statement.document_name ?? "statement"}"`, ResponseContentType: statement.document_type ?? undefined }), { expiresIn: 300 }) });
    }
    if (profile.role !== "administrator") return json({ error: "Only administrators can manage statements." }, 403);
    if (request.method === "POST") {
      const form = await request.formData();
      const statementDate = form.get("date");
      const clientId = form.get("client_id");
      const description = typeof form.get("description") === "string" ? String(form.get("description")).trim() : "";
      if (typeof statementDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) throw Error("Choose a valid statement date.");
      if (typeof clientId !== "string" || !clientId) throw Error("Select a client.");
      if (description.length < 3 || description.length > 1000) throw Error("Description must contain between 3 and 1,000 characters.");
      const file = form.get("file");
      let document: Record<string, unknown> = {};
      if (file instanceof File) {
        const extension = fileInfo(file);
        if (!bucket || !region || !Deno.env.get("AWS_ACCESS_KEY_ID") || !Deno.env.get("AWS_SECRET_ACCESS_KEY")) throw Error("Statement document storage is not configured.");
        const key = `statements/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: new Uint8Array(await file.arrayBuffer()), ContentType: file.type || `application/${extension}` }));
        document = { document_key: key, document_name: file.name, document_size: file.size, document_type: file.type || extension };
      }
      const { data, error: insertError } = await db.from("statements").insert({ statement_date: statementDate, client_id: clientId, description, approval_status: "pending", ...document }).select(select).single();
      if (insertError) throw insertError;
      return json(data, 201);
    }
    if (request.method === "PUT" && id && id !== "statements") {
      const body = await request.json();
      const updates: Record<string, unknown> = {};
      if (typeof body.approval_status === "string") { if (body.approval_status !== "approved" && body.approval_status !== "pending") throw Error("Invalid approval status."); updates.approval_status = body.approval_status; updates.approved_at = body.approval_status === "approved" ? new Date().toISOString() : null; updates.approved_by = body.approval_status === "approved" ? user.id : null; }
      if (typeof body.payment_status === "string") { if (body.payment_status !== "paid" && body.payment_status !== "unpaid") throw Error("Invalid payment status."); updates.payment_status = body.payment_status; updates.paid_at = body.payment_status === "paid" ? new Date().toISOString() : null; updates.paid_by = body.payment_status === "paid" ? user.id : null; }
      if (typeof body.date === "string") updates.statement_date = body.date;
      if (typeof body.client_id === "string") updates.client_id = body.client_id;
      if (typeof body.description === "string" && body.description.trim().length >= 3) updates.description = body.description.trim();
      const { data, error: updateError } = await db.from("statements").update(updates).eq("id", id).is("deleted_at", null).select(select).single();
      if (updateError) throw updateError;
      return json(data);
    }
    if (request.method === "DELETE" && id && id !== "statements") {
      const { data: statement } = await db.from("statements").select("document_key").eq("id", id).is("deleted_at", null).maybeSingle();
      const { error: deleteError } = await db.from("statements").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
      if (deleteError) throw deleteError;
      if (statement?.document_key && bucket) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: statement.document_key }));
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (cause) { return json({ error: cause instanceof Error ? cause.message : "Request failed." }, 400); }
});

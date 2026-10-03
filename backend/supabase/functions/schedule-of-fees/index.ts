import { clientPermissionResponse, actionForRequest } from '../_shared/client-permissions.ts';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";
import { bucket, getS3, extension, validateDocumentKey, verifyDocumentFile, documentStorageError } from "../_shared/document-storage.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const prefix = "aiptschedule_of_fees/";
const maxDocumentSize = 25 * 1024 * 1024;
const mimeTypes: Record<string, string> = {
  pdf: "application/pdf",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const extension = (key: string) => key.split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
const allowed = new Set(Object.keys(mimeTypes));

function safeFileName(name: string) {
  return name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "").slice(0, 180) || "schedule-of-fees";
}

function requestedName(value: FormDataEntryValue | null, fallback: string, ext: string) {
  const raw = typeof value === "string" ? value.trim() : fallback;
  const cleaned = raw.replace(/[/\\]/g, "").replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 200) throw Error("Document name must contain 1 to 200 characters.");
  const withoutExtension = cleaned.replace(new RegExp(`\\.${ext}$`, "i"), "");
  return `${safeFileName(withoutExtension)}.${ext}`;
}

function newKey(name: string) {
  return `${prefix}${crypto.randomUUID()}/${name}`;
}

const validateKey = (key: string | null) => validateDocumentKey(key, prefix, allowed);

const verifyFile = (value: FormDataEntryValue | null) => verifyDocumentFile(value, mimeTypes, maxDocumentSize);

async function authorizeAdmin(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error: authError } = token ? await db.auth.getUser(token) : { data: { user: null }, error: null };
  if (authError || !user) return json({ error: "Authentication is required." }, 401);
  const { data: profile, error } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) throw error;
  const denied = await clientPermissionResponse(db, user.id, 'fees', actionForRequest(request), cors); if (denied) return denied;
  return null;
}

async function removeIfPresent(key: string) {
  try { await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
  catch (cause) { throw Error(`The previous document could not be removed: ${cause instanceof Error ? cause.message : "storage cleanup failed"}`); }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const denied = await authorizeAdmin(request);
    if (denied) return denied;
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (request.method === "GET" && key) {
      const safeKey = validateKey(key);
      await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: safeKey }));
      const name = safeKey.split("/").at(-1) ?? "schedule-of-fees";
      const signedUrl = await getSignedUrl(getS3(), new GetObjectCommand({
        Bucket: bucket,
        Key: safeKey,
        ResponseContentDisposition: `attachment; filename="${name.replace(/["\\]/g, "")}"`,
      }), { expiresIn: 300 });
      return json({ url: signedUrl });
    }

    if (request.method === "GET") {
      const documents: Array<{ key: string; document_name: string; last_modified: string | null; size: number }> = [];
      let token: string | undefined;
      do {
        const result = await getS3().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
        for (const object of result.Contents ?? []) {
          if (!object.Key || object.Key.endsWith("/") || !allowed.has(extension(object.Key))) continue;
          documents.push({
            key: object.Key,
            document_name: object.Key.split("/").at(-1)?.replace(/^[0-9a-f-]{36}\//i, "") ?? object.Key,
            last_modified: object.LastModified?.toISOString() ?? null,
            size: object.Size ?? 0,
          });
        }
        token = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (token);
      documents.sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""));
      return json({ data: documents });
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const { file, ext, contentType } = verifyFile(form.get("file"));
      const name = requestedName(form.get("document_name"), file.name, ext);
      const target = newKey(name);
      await getS3().send(new PutObjectCommand({ Bucket: bucket, Key: target, Body: new Uint8Array(await file.arrayBuffer()), ContentType: contentType }));
      return json({ key: target }, 201);
    }

    if (request.method === "PUT") {
      const oldKey = validateKey(key);
      const form = await request.formData();
      const optionalFile = form.get("file");
      const replacement = optionalFile !== null ? verifyFile(optionalFile) : null;
      const ext = replacement?.ext ?? extension(oldKey);
      const oldName = oldKey.split("/").at(-1) ?? "schedule-of-fees";
      const name = requestedName(form.get("document_name"), oldName.replace(/\.[^.]+$/, ""), ext);
      const changedName = oldName !== name;
      await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: oldKey }));
      if (!replacement && !changedName) return json({ key: oldKey });
      const target = newKey(name);
      if (replacement) {
        await getS3().send(new PutObjectCommand({ Bucket: bucket, Key: target, Body: new Uint8Array(await replacement.file.arrayBuffer()), ContentType: replacement.contentType }));
      } else {
        await getS3().send(new CopyObjectCommand({ Bucket: bucket, Key: target, CopySource: encodeURIComponent(`${bucket}/${oldKey}`).replace(/%2F/g, "/") }));
      }
      try {
        await removeIfPresent(oldKey);
      } catch (cause) {
        try { await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: target })); }
        catch (cleanupError) { throw Error(`${cause instanceof Error ? cause.message : "Unable to replace document."} The replacement file also could not be removed: ${cleanupError instanceof Error ? cleanupError.message : "storage cleanup failed"}`); }
        throw cause;
      }
      return json({ key: target });
    }

    if (request.method === "DELETE") {
      const safeKey = validateKey(key);
      await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: safeKey }));
      await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey }));
      return new Response(null, { status: 204, headers: cors });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    const error = documentStorageError(cause, prefix);
    return json({ error: error.message }, error.status);
  }
});

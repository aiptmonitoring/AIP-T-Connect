import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";
import { bucket, getS3, extension, validateDocumentKey, verifyDocumentFile, documentStorageError } from "../_shared/document-storage.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const prefix = "aiptPOA/";
const allowed = new Set(["pdf", "doc", "docx"]);
const maxDocumentSize = 10 * 1024 * 1024;
const mimeTypes: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const documentName = (key: string) => (key.split("/").at(-1) || "POA document").replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i, "").replace(/[_-]+/g, " ").replace(/\.[^.]+$/, "").trim();
const extension = (key: string) => key.split(".").at(-1)?.toLowerCase() || "";
const countryWords = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

type Country = { id: string; name: string; abbreviation: string; flag_url: string | null };
type DocumentCountryLink = { country: Country | Country[] | null };
type StoredDocument = { id: string; document_name: string; s3_key: string; created_at: string; updated_at: string; poa_document_countries?: DocumentCountryLink[] };
type DownloadDocument = { id: string; document_name: string; s3_key: string; poa_document_countries: Array<{ country_id: string }> };
type ListedDocument = { id: string; key: string; document_name: string; countries: Country[]; last_modified: string | null };
const sharedCountry: Country = { id: "shared-all", name: "All Countries", abbreviation: "ALL", flag_url: null };

function matchCountry(key: string, countries: Country[]) {
  const folder = key.slice(prefix.length).split("/")[0] ?? "";
  const countryId = folder.split("--").at(-1);
  const exactCountry = countries.find(country => country.id === countryId);
  if (exactCountry) return exactCountry;
  const keyWords = countryWords(key);
  const containsPhrase = (phrase: string) => {
    const words = countryWords(phrase);
    return words.length > 0 && keyWords.some((_, start) => words.every((word, offset) => keyWords[start + offset] === word));
  };
  return countries.find(country => containsPhrase(country.name)) ??
    countries.find(country => country.abbreviation.trim().length >= 3 && containsPhrase(country.abbreviation));
}

function safeFileName(name: string) {
  return name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "").slice(0, 150) || "poa-document";
}

function displayFileName(name: string, fileExtension: string) {
  const cleaned = name.trim().replace(/[/\\]/g, "").replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 160) throw Error("Document name must contain 1 to 160 characters.");
  return `${safeFileName(cleaned.replace(new RegExp(`\\.${fileExtension}$`, "i"), ""))}.${fileExtension}`;
}

function targetKey(fileName: string) {
  return `${prefix}${crypto.randomUUID()}/${fileName}`;
}

function countryIdsForUpload(form: FormData) {
  const submitted = form.getAll("country_ids");
  const values = submitted.length ? submitted : [form.get("country_id")];
  if (!values.length || values.some(value => typeof value !== "string" || !value)) throw Error("Select one or more countries, or All Countries.");
  const ids = values as string[];
  if (new Set(ids).size !== ids.length) throw Error("Remove duplicate country selections.");
  if (ids.includes("shared")) {
    if (ids.length !== 1) throw Error("All Countries must be selected by itself.");
    return [];
  }
  if (ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw Error("Select one or more valid countries, or All Countries.");
  }
  return ids;
}

const verifyFile = (value: FormDataEntryValue | null) => verifyDocumentFile(value, mimeTypes, maxDocumentSize);

async function authorize(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error: authError } = token ? await db.auth.getUser(token) : { data: { user: null }, error: null };
  if (authError || !user) return { error: json({ error: "Authentication is required." }, 401), db, role: null, countries: [] as Country[], allCountries: [] as Country[] };
  const { data: profile, error: profileError } = await db.from("profiles").select("role,client_id,approval_status,account_status").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  const isAdministrator = ["admin", "administrator"].includes(String(profile?.role ?? "").trim().toLowerCase());
  const { data: allCountries, error: countryError } = await db.from("countries").select("id,name,abbreviation,flag_url").is("deleted_at", null).order("name");
  if (countryError) throw countryError;
  if (isAdministrator) return { error: null, db, user, role: "administrator", countries: allCountries ?? [], allCountries: allCountries ?? [] };
  if (profile?.role !== "client" || profile.approval_status !== "approved" || profile.account_status !== "active" || !profile.client_id || !user.email) {
    return { error: json({ error: "An approved client account is required." }, 403), db, role: null, countries: [] as Country[], allCountries: allCountries ?? [] };
  }
  const { data: client, error: clientError } = await db.from("clients").select("email").eq("id", profile.client_id).is("deleted_at", null).maybeSingle();
  if (clientError) throw clientError;
  if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { error: json({ error: "The registered client email does not match this account." }, 403), db, role: null, countries: [] as Country[], allCountries: allCountries ?? [] };
  }
  const { data: projects, error: projectsError } = await db.from("projects").select("country_id").eq("client_id", profile.client_id).is("deleted_at", null);
  if (projectsError) throw projectsError;
  const countryIds = [...new Set((projects ?? []).map(project => project.country_id).filter((id): id is string => typeof id === "string"))];
  const countries = (allCountries ?? []).filter(country => countryIds.includes(country.id));
  return { error: null, db, user, role: "client", countries, allCountries: allCountries ?? [] };
}

function countriesFromLinks(links: DocumentCountryLink[] | undefined) {
  return (links ?? []).flatMap(({ country }) => {
    if (Array.isArray(country)) return country;
    return country ? [country] : [];
  });
}

async function listStoredDocuments(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.from("poa_documents")
    .select("id,document_name,s3_key,created_at,updated_at,poa_document_countries(country:countries!poa_document_countries_country_id_fkey(id,name,abbreviation,flag_url))")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredDocument[];
}

async function listLegacyDocuments(countries: Country[], isAdmin: boolean) {
  const storage = getS3();
  const legacy: ListedDocument[] = [];
  let token: string | undefined;
  do {
    const result = await storage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
    for (const object of result.Contents ?? []) {
      if (!object.Key || object.Key.endsWith("/") || !allowed.has(extension(object.Key))) continue;
      const country = object.Key.startsWith(`${prefix}shared/`) || object.Key === `${prefix}Client Design Proposal.docx`
        ? sharedCountry
        : matchCountry(object.Key, countries);
      if (!country && !isAdmin) continue;
      legacy.push({
        id: `legacy:${object.Key}`,
        key: object.Key,
        document_name: documentName(object.Key),
        countries: country ? [country] : [{ id: "unassigned", name: "Unassigned", abbreviation: "", flag_url: null }],
        last_modified: object.LastModified?.toISOString() ?? null,
      });
    }
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token);
  return legacy;
}

async function signDocument(key: string, name: string) {
  validateDocumentKey(key, prefix, allowed);
  await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const extensionName = extension(key);
  const downloadName = `${safeFileName(name.replace(new RegExp(`\\.${extensionName}$`, "i"), ""))}.${extensionName}`;
  return getSignedUrl(getS3(), new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${downloadName.replace(/["\\]/g, "")}"`,
  }), { expiresIn: 300 });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;
    const isAdmin = auth.role === "administrator";
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("id");
    const requestedKey = url.searchParams.get("key");

    if (request.method === "GET" && (requestedId || requestedKey)) {
      if (!isAdmin && requestedKey && requestedId) return json({ error: "Document not found." }, 404);
      const { data: stored, error: lookupError } = requestedId
        ? await auth.db.from("poa_documents").select("id,document_name,s3_key,poa_document_countries(country_id)").eq("id", requestedId).maybeSingle()
        : await auth.db.from("poa_documents").select("id,document_name,s3_key,poa_document_countries(country_id)").eq("s3_key", requestedKey!).maybeSingle();
      if (lookupError) throw lookupError;
      if (requestedId && !stored) return json({ error: "Document not found." }, 404);
      const key = stored?.s3_key ?? requestedKey;
      if (!key || !key.startsWith(prefix) || !allowed.has(extension(key))) return json({ error: "Document not found." }, 404);
      if (stored) {
        const links = (stored as DownloadDocument).poa_document_countries ?? [];
        if (!isAdmin && links.length && !links.some(link => auth.countries.some(country => country.id === link.country_id))) {
          return json({ error: "Document not found for this client." }, 404);
        }
        return json({ url: await signDocument(key, stored.document_name) });
      }
      const legacyCountry = key.startsWith(`${prefix}shared/`) || key === `${prefix}Client Design Proposal.docx` ? sharedCountry : matchCountry(key, auth.countries);
      if (!legacyCountry && !isAdmin) return json({ error: "Document not found for this client." }, 404);
      return json({ url: await signDocument(key, `${documentName(key)}.${extension(key)}`) });
    }

    if (request.method === "GET") {
      const [storedDocuments, legacy] = await Promise.all([
        listStoredDocuments(auth.db),
        listLegacyDocuments(auth.allCountries, isAdmin),
      ]);
      const storedKeys = new Set(storedDocuments.map(item => item.s3_key));
      const documents: ListedDocument[] = storedDocuments.map(item => {
        const countries = countriesFromLinks(item.poa_document_countries);
        return { id: item.id, key: item.s3_key, document_name: item.document_name, countries: countries.length ? countries : [sharedCountry], last_modified: item.updated_at ?? item.created_at };
      }).filter(item => isAdmin || item.countries[0]?.id === sharedCountry.id || item.countries.some(country => auth.countries.some(allowedCountry => allowedCountry.id === country.id)));
      const visibleLegacy = legacy.filter(item => !storedKeys.has(item.key) &&
        (isAdmin || item.countries.some(country => country.id === sharedCountry.id || auth.countries.some(allowedCountry => allowedCountry.id === country.id))));
      const allDocuments = [...documents, ...visibleLegacy].sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? "") || a.document_name.localeCompare(b.document_name));
      return json({ data: allDocuments, countries: auth.allCountries });
    }

    if (!isAdmin) return json({ error: "Only administrators can manage POA documents." }, 403);

    if (request.method === "POST") {
      const form = await request.formData();
      const { file, ext, contentType } = verifyFile(form.get("file"));
      const countryIds = countryIdsForUpload(form);
      const name = String(form.get("document_name") ?? file.name.replace(/\.[^.]+$/, "")).trim();
      if (!name || name.length > 160) throw Error("Document name must contain 1 to 160 characters.");
      const key = targetKey(displayFileName(name, ext));
      await getS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: new Uint8Array(await file.arrayBuffer()), ContentType: contentType }));
      const { data: id, error } = await auth.db.rpc("save_poa_document", { p_id: null, p_document_name: name, p_s3_key: key, p_country_ids: countryIds });
      if (error) {
        try { await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
        catch (cleanupError) { throw Error(`POA record creation failed and the uploaded file could not be removed (${cleanupError instanceof Error ? cleanupError.message : "storage cleanup failed"}). Database error: ${error.message}`); }
        throw error;
      }
      return json({ id, key }, 201);
    }

    if (request.method === "PUT") {
      const form = await request.formData();
      const id = url.searchParams.get("id");
      const legacyKey = url.searchParams.get("key") ?? String(form.get("key") ?? "");
      if (!id && (!legacyKey.startsWith(prefix) || !allowed.has(extension(legacyKey)))) return json({ error: "Select a valid POA document." }, 400);
      const stored = (await listStoredDocuments(auth.db)).find(item => id ? item.id === id : item.s3_key === legacyKey);
      if (id && !stored) return json({ error: "POA document not found." }, 404);
      const oldKey = validateDocumentKey(stored?.s3_key ?? legacyKey, prefix, allowed);
      await getS3().send(new HeadObjectCommand({ Bucket: bucket, Key: oldKey }));
      const optionalFile = form.get("file");
      const replacement = optionalFile !== null ? verifyFile(optionalFile) : null;
      const ext = replacement?.ext ?? extension(oldKey);
      const name = String(form.get("document_name") ?? stored?.document_name ?? documentName(oldKey)).trim();
      if (!name || name.length > 160) throw Error("Document name must contain 1 to 160 characters.");
      const countryIds = countryIdsForUpload(form);
      const key = replacement ? targetKey(displayFileName(name, ext)) : oldKey;
      if (replacement) await getS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: new Uint8Array(await replacement.file.arrayBuffer()), ContentType: replacement.contentType }));
      const { data: savedId, error } = await auth.db.rpc("save_poa_document", { p_id: stored?.id ?? null, p_document_name: name, p_s3_key: key, p_country_ids: countryIds });
      if (error) {
        if (replacement) {
          try { await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
          catch (cleanupError) { throw Error(`POA update failed and the replacement file could not be removed (${cleanupError instanceof Error ? cleanupError.message : "storage cleanup failed"}). Database error: ${error.message}`); }
        }
        throw error;
      }
      let warning: string | undefined;
      if (replacement && oldKey !== key) {
        try { await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey })); }
        catch (cleanupError) { warning = `POA was updated, but the previous S3 file could not be removed: ${cleanupError instanceof Error ? cleanupError.message : "storage cleanup failed"}`; }
      }
      return json({ id: savedId, key, ...(warning ? { warning } : {}) });
    }

    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      let targetKeyValue = key;
      if (id) {
        const { data: stored, error: lookupError } = await auth.db.from("poa_documents").select("id,s3_key").eq("id", id).maybeSingle();
        if (lookupError) throw lookupError;
        if (!stored) return json({ error: "POA document not found." }, 404);
        targetKeyValue = stored.s3_key;

      }
      targetKeyValue = validateDocumentKey(targetKeyValue, prefix, allowed);
      // Keep metadata if S3 deletion fails so administrators can retry.
      await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: targetKeyValue }));
      const { error: deleteError } = await auth.db.from("poa_documents").delete().eq("s3_key", targetKeyValue);
      if (deleteError) throw deleteError;
      return new Response(null, { status: 204, headers: cors });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    const error = documentStorageError(cause, prefix);
    return json({ error: error.message }, error.status);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const bucket = Deno.env.get("AWS_S3_BUCKET") ?? "aiptuploaddocument";
const region = Deno.env.get("AWS_REGION") ?? "eu-north-1";
const s3 = new S3Client({ region, credentials: { accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")! } });

async function uploadLogo(value: unknown, userId: string, oldKey: string | null) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return oldKey;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw Error("Logo must be PNG, JPG, or WEBP.");
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  if (bytes.length > 64 * 1024) throw Error("Logo must be no larger than 64KB.");
  const key = `logo_company/${userId}-${crypto.randomUUID()}.${extension}`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: match[1] }));

  return key;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: "Authentication is required." }, 401);
  try {
    if (request.method === "POST") {
      const body = await request.json();
      if (body.action !== 'logo-upload' || !['image/png','image/jpeg','image/webp'].includes(body.content_type) || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > 500 * 1024 * 1024) return json({ error: 'Choose a PNG, JPG, or WEBP logo up to 500 MB.' }, 400);
      const extension = body.content_type === 'image/jpeg' ? 'jpg' : body.content_type.split('/')[1];
      const key = 'logo_company/' + user.id + '/' + crypto.randomUUID() + '.' + extension;
      const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: body.content_type, ContentLength: body.size }), { expiresIn: 3600 });
      return json({ key, url });
    }
    if (request.method === "GET") { const { data, error } = await db.from("profiles").select("full_name,company_name,address,logo_url").eq("id", user.id).single(); if (error) throw error; return json({ email: user.email ?? "", ...data, logo_url: data.logo_url?.startsWith("logo_company/") ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: data.logo_url }), { expiresIn: 3600 }) : data.logo_url }); }
    if (request.method === "PUT") { const body = await request.json(); const { data: current, error: profileError } = await db.from("profiles").select("logo_url").eq("id", user.id).single(); if (profileError) throw profileError; let logo_url = current?.logo_url ?? null;
      const fullName = String(body.full_name ?? '').trim();
      const companyName = String(body.company_name ?? '').trim();
      const address = String(body.address ?? '').trim();
      if (fullName.length < 2 || companyName.length < 2 || address.length < 3) return json({ error: 'Full name, company, and address are required.' }, 400);
      if (body.logo_key !== undefined) {
        if (typeof body.logo_key !== 'string' || !body.logo_key.startsWith('logo_company/' + user.id + '/') || !/^logo_company\/[^/]+\/[a-f0-9-]+\.(png|jpg|webp)$/.test(body.logo_key)) return json({ error: 'Invalid logo ownership.' }, 403);
        const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: body.logo_key }));
        if (!object.ContentLength || object.ContentLength > 500 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(object.ContentType ?? '')) return json({ error: 'Invalid logo type or size (500 MB maximum).' }, 400);
        logo_url = body.logo_key;
      } else { logo_url = await uploadLogo(body.logo_url, user.id, logo_url); }
 const updates = { full_name: String(body.full_name ?? "").trim().slice(0, 120), company_name: String(body.company_name ?? "").trim().slice(0, 255), address: String(body.address ?? "").trim().slice(0, 2000), logo_url }; if (updates.full_name.length < 2 || updates.company_name.length < 2 || updates.address.length < 3) return json({ error: "Full name, company, and address are required." }, 400); const { data, error } = await db.from("profiles").update(updates).eq("id", user.id).select("full_name,company_name,address,logo_url").single(); if (error) throw error; await db.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, full_name: updates.full_name, company_name: updates.company_name } }); return json({ email: user.email ?? "", ...data, logo_url: data.logo_url?.startsWith('logo_company/') ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: data.logo_url }), { expiresIn: 3600 }) : data.logo_url }); }
    return json({ error: "Method not allowed." }, 405);
  } catch (cause) { return json({ error: cause instanceof Error ? cause.message : "Unable to update account." }, 400); }
});
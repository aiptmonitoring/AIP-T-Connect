import { createClient } from "npm:@supabase/supabase-js@2";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, PUT, OPTIONS" };
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
  if (oldKey?.startsWith("logo_company/")) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
  return key;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: "Authentication is required." }, 401);
  try {
    if (request.method === "GET") { const { data, error } = await db.from("profiles").select("full_name,company_name,address,logo_url").eq("id", user.id).single(); if (error) throw error; return json({ email: user.email ?? "", ...data }); }
    if (request.method === "PUT") { const body = await request.json(); const { data: current } = await db.from("profiles").select("logo_url").eq("id", user.id).single(); const logo_url = await uploadLogo(body.logo_url, user.id, current?.logo_url ?? null); const updates = { full_name: String(body.full_name ?? "").trim().slice(0, 120), company_name: String(body.company_name ?? "").trim().slice(0, 255), address: String(body.address ?? "").trim().slice(0, 2000), logo_url }; if (updates.full_name.length < 2 || updates.company_name.length < 2 || updates.address.length < 3) return json({ error: "Full name, company, and address are required." }, 400); const { data, error } = await db.from("profiles").update(updates).eq("id", user.id).select("full_name,company_name,address,logo_url").single(); if (error) throw error; await db.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, full_name: updates.full_name, company_name: updates.company_name } }); return json({ email: user.email ?? "", ...data }); }
    return json({ error: "Method not allowed." }, 405);
  } catch (cause) { return json({ error: cause instanceof Error ? cause.message : "Unable to update account." }, 400); }
});
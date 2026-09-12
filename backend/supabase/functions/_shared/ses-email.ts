const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => crypto.subtle.digest("SHA-256", encoder.encode(value));
const hmac = async (key: ArrayBuffer | Uint8Array, value: string) => crypto.subtle.sign(
  "HMAC",
  await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
  encoder.encode(value),
);

export async function sendSesEmail(options: { to: string; subject: string; html: string }) {
  const region = Deno.env.get("AWS_SES_REGION") || Deno.env.get("AWS_REGION") || "eu-north-1";
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const sessionToken = Deno.env.get("AWS_SES_SESSION_TOKEN") || Deno.env.get("AWS_SESSION_TOKEN");
  const from = Deno.env.get("SES_FROM_EMAIL");
  if (!accessKeyId || !secretAccessKey || !from) throw new Error("Login OTP email is not configured.");

  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payload = JSON.stringify({ FromEmailAddress: from, Destination: { ToAddresses: [options.to] }, Content: { Simple: { Subject: { Data: options.subject, Charset: "UTF-8" }, Body: { Html: { Data: options.html, Charset: "UTF-8" } } } } });
  const payloadHash = hex(await sha256(payload));
  const canonicalHeaderEntries = [["content-type", "application/json"], ["host", host], ["x-amz-content-sha256", payloadHash], ["x-amz-date", amzDate], ...(sessionToken ? [["x-amz-security-token", sessionToken]] : [])];
  const canonicalHeaders = canonicalHeaderEntries.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(";");
  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hex(await sha256(canonicalRequest))].join("\n");
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, "ses");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  const headers = new Headers();
  for (const [name, value] of canonicalHeaderEntries) headers.set(name, value);
  headers.set("Authorization", `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
  const response = await fetch(`https://${host}${path}`, { method: "POST", headers, body: payload });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const code = typeof error?.__type === "string" ? error.__type.split("#").at(-1) : "SesRequestFailed";
    throw new Error(`SES email request failed (${response.status}, ${code}).`);
  }
}

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSesEmail } from "../_shared/ses-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const encoder = new TextEncoder();

async function hashOtp(challengeId: string, code: string) {
  const pepper = Deno.env.get("LOGIN_OTP_PEPPER");
  if (!pepper) throw new Error("Login OTP is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${challengeId}:${code}:${pepper}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeOtp() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

async function sendOtp(email: string, code: string) {
  await sendSesEmail({ to: email, subject: "Your AIP&T login verification code", html: `<h2>Verify your AIP&amp;T login</h2><p>Your new verification code is:</p><h1>${code}</h1><p>This code expires in 5 minutes.</p>` });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return json({ error: "Request body is too large." }, 413);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sessionVerifier = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const body = await request.json();
    const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) return json({ error: "Login verification has expired. Please log in again." }, 400);
    const challenge = await admin.from("login_otp_challenges").select("id,user_id,attempts,resend_count,expires_at,last_sent_at,consumed_at").eq("id", challengeId).maybeSingle();
    if (!challenge.data || challenge.data.consumed_at || new Date(challenge.data.expires_at) <= new Date()) return json({ error: "Login verification has expired. Please log in again." }, 410);
    const userResult = await admin.auth.admin.getUserById(challenge.data.user_id);
    const email = userResult.data.user?.email;
    if (userResult.error || !email) return json({ error: "Unable to verify this account." }, 400);

    if (body.action === "resend") {
      if (challenge.data.resend_count >= 3) return json({ error: "The resend limit has been reached. Please log in again." }, 429);
      const elapsed = Date.now() - new Date(challenge.data.last_sent_at).getTime();
      if (elapsed < 60_000) return json({ error: "Please wait before requesting another code.", retry_after: Math.ceil((60_000 - elapsed) / 1000) }, 429);
      const code = makeOtp();
      try {
        await sendOtp(email, code);
      } catch (cause) {
        console.error("Login OTP resend failed", cause instanceof Error ? cause.name : "Unknown error");
        return json({
          code: "otp_delivery_failed",
          error: "The new verification email could not be sent. Please contact support or try again later.",
        }, 502);
      }
      const saved = await admin.from("login_otp_challenges").update({ code_hash: await hashOtp(challengeId, code), attempts: 0, resend_count: challenge.data.resend_count + 1, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), last_sent_at: new Date().toISOString() }).eq("id", challengeId).is("consumed_at", null);
      if (saved.error) throw saved.error;
      return json({ sent: true, expires_in: 300 });
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return json({ error: "Enter the six-digit verification code." }, 400);
    const consumed = await admin.rpc("consume_login_otp_challenge", { p_challenge_id: challengeId, p_code_hash: await hashOtp(challengeId, code) });
    if (consumed.error) throw consumed.error;
    if (!consumed.data) return json({ error: "The verification code is invalid, expired, or has reached the attempt limit." }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role,approval_status,account_status,locked_at")
      .eq("id", challenge.data.user_id)
      .single();
    if (profileError || !profile) return json({ error: "Unable to verify this account." }, 403);
    if ((profile.locked_at && profile.role !== "administrator") || profile.account_status !== "active") return json({ error: "This account cannot log in. Please contact support." }, 403);
    if (profile.role !== "administrator" && profile.approval_status !== "approved") return json({ error: "This account is not approved for login." }, 403);

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) throw link.error ?? new Error("Unable to create the verified session.");
    const verified = await sessionVerifier.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error("Unable to create the verified session.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    await admin.from("profiles").update({ last_login_at: new Date().toISOString(), last_login_ip: ip }).eq("id", challenge.data.user_id);
    return json({ session: verified.data.session });
  } catch (cause) {
    console.error("Login OTP request failed", cause instanceof Error ? cause.message : "Unknown error");
    return json({ error: "Unable to complete login verification." }, 500);
  }
});

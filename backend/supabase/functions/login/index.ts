import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSesEmail } from "../_shared/ses-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const encoder = new TextEncoder();
const MAX_FAILED_ATTEMPTS = 3;

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

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

async function sendOtp(email: string, code: string) {
  await sendSesEmail({ to: email, subject: "Your AIP&T login verification code", html: `<h2>Verify your AIP&amp;T login</h2><p>Your verification code is:</p><h1>${code}</h1><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>` });
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
  const passwordVerifier = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { email, password } = await request.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const suppliedPassword = typeof password === "string" ? password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 320 || suppliedPassword.length < 1 || suppliedPassword.length > 1024) return json({ code: "invalid_credentials", error: "The email address or password is incorrect.", attempts_remaining: MAX_FAILED_ATTEMPTS }, 401);
    const authLookup = await admin.rpc("find_auth_user_id_by_email", { p_email: normalizedEmail });
    const authUserId = typeof authLookup.data === "string" ? authLookup.data : null;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    if (authLookup.error) throw authLookup.error;
    if (!authUserId) return json({ code: "invalid_credentials", error: "The email address or password is incorrect.", attempts_remaining: MAX_FAILED_ATTEMPTS }, 401);

    const { data: profile } = await admin.from("profiles").select("id,role,approval_status,account_status,failed_login_attempts,locked_at").eq("id", authUserId).single();
    const isAdministrator = profile?.role === "administrator";
    if (profile?.locked_at && !isAdministrator) return json({ code: "account_locked", error: "This account is locked after three failed attempts. Use Forgot Password to reset it or contact an administrator.", attempts_remaining: 0 }, 423);
    if (profile?.role !== "administrator") {
      if (profile?.approval_status === "pending") return json({ code: "account_pending", error: "Your account is still awaiting administrator approval." }, 403);
      if (profile?.approval_status === "rejected") return json({ code: "account_rejected", error: "Your account has not been approved. Please contact support." }, 403);
      if (profile?.approval_status === "suspended") return json({ code: "account_suspended", error: "Your account has been suspended. Please contact support." }, 403);
      if (profile?.approval_status !== "approved") return json({ code: "account_unavailable", error: "This account cannot log in. Please contact support." }, 403);
    }
    if (profile?.account_status === "inactive") return json({ code: "account_inactive", error: "This account is deactivated. Contact an administrator." }, 403);

    const result = await passwordVerifier.auth.signInWithPassword({ email: normalizedEmail, password: suppliedPassword });
    if (result.error) {
      const attempts = (profile?.failed_login_attempts ?? 0) + 1;
      const locked = !isAdministrator && attempts >= MAX_FAILED_ATTEMPTS;
      const remaining = isAdministrator ? null : Math.max(0, MAX_FAILED_ATTEMPTS - attempts);
      await admin.from("profiles").update({ failed_login_attempts: isAdministrator ? attempts : Math.min(attempts, MAX_FAILED_ATTEMPTS), locked_at: locked ? new Date().toISOString() : null, last_login_ip: ip }).eq("id", authUserId);
      return json({ code: locked ? "account_locked" : "invalid_credentials", error: locked ? "This account is locked after three failed attempts. Use Forgot Password to reset it or contact an administrator." : "The email address or password is incorrect.", attempts_remaining: remaining }, locked ? 423 : 401);
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentUserChallenges = await admin.from("login_otp_challenges").select("id", { count: "exact", head: true }).eq("user_id", authUserId).gte("created_at", hourAgo);
    if ((recentUserChallenges.count ?? 0) >= 5) return json({ code: "otp_rate_limited", error: "Too many verification codes were requested. Please try again later." }, 429);
    if (ip) {
      const recentIpChallenges = await admin.from("login_otp_challenges").select("id", { count: "exact", head: true }).eq("request_ip", ip).gte("created_at", hourAgo);
      if ((recentIpChallenges.count ?? 0) >= 20) return json({ code: "otp_rate_limited", error: "Too many verification codes were requested. Please try again later." }, 429);
    }
    const latestChallenge = await admin.from("login_otp_challenges").select("last_sent_at").eq("user_id", authUserId).order("last_sent_at", { ascending: false }).limit(1).maybeSingle();
    if (latestChallenge.data && Date.now() - new Date(latestChallenge.data.last_sent_at).getTime() < 60_000) return json({ code: "otp_rate_limited", error: "Please wait before requesting another verification code." }, 429);

    const challengeId = crypto.randomUUID();
    const code = makeOtp();
    const codeHash = await hashOtp(challengeId, code);
    await admin.from("login_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("user_id", authUserId).is("consumed_at", null);
    const challenge = await admin.from("login_otp_challenges").insert({ id: challengeId, user_id: authUserId, code_hash: codeHash, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), request_ip: ip }).select("id").single();
    if (challenge.error) throw challenge.error;
    try {
      await sendOtp(normalizedEmail, code);
    } catch (cause) {
      await admin.from("login_otp_challenges").delete().eq("id", challengeId);
      console.error("Login OTP delivery failed", cause instanceof Error ? cause.name : "Unknown error");
      return json({
        code: "otp_delivery_failed",
        error: "Your password was verified, but the login verification email could not be sent. Please contact support or try again later.",
      }, 502);
    }
    await admin.from("profiles").update({ failed_login_attempts: 0, locked_at: null, last_login_ip: ip }).eq("id", authUserId);
    return json({ otp_required: true, challenge_id: challengeId, masked_email: maskEmail(normalizedEmail), expires_in: 300 });
  } catch (cause) {
    console.error("Login request failed", cause instanceof Error ? cause.message : "Unknown error");
    return json({ error: "Unable to complete login verification." }, 500);
  }
});

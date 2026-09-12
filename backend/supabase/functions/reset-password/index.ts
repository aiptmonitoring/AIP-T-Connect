import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !supabaseUrl || !serviceRoleKey) return json({ error: "Authentication required." }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "Authentication required." }, 401);

  const { error: updateError } = await db
    .from("profiles")
    .update({ failed_login_attempts: 0, locked_at: null })
    .eq("id", data.user.id);
  if (updateError) return json({ error: "Unable to unlock the account after password reset." }, 500);

  return json({ success: true });
});

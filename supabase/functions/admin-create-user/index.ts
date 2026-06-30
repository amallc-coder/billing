// Edge function: admin-create-user
// Lets an admin create a new login (auth user) and set role + per-user tab
// access. Uses the service-role key (auto-injected by Supabase) and verifies
// the caller is an admin before doing anything.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = ["admin", "biller", "viewer"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return json(401, { error: "unauthenticated" });

    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (prof?.role !== "admin") return json(403, { error: "admin only" });

    const { email, password, full_name, role, allowed_tabs } = await req.json();
    if (!email || !password) return json(400, { error: "email and password are required" });

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });
    if (cErr) return json(400, { error: cErr.message });
    const newId = created.user!.id;

    const { error: pErr } = await admin.from("profiles").upsert({
      id: newId,
      email,
      full_name: full_name || email,
      role: ROLES.includes(role) ? role : "viewer",
      allowed_tabs: Array.isArray(allowed_tabs) ? allowed_tabs : null,
    });
    if (pErr) return json(500, { error: pErr.message });

    return json(200, { user: { id: newId, email, role: ROLES.includes(role) ? role : "viewer" } });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) });
  }
});

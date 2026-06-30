// Edge function: classify-payer-type
// Classifies U.S. health-insurance payer names into a payer_type enum using
// Claude (claude-opus-4-8). Requires the ANTHROPIC_API_KEY secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID = ["commercial", "medicare", "medicaid", "self_pay", "other"];

const SYSTEM =
  "You classify U.S. health-insurance payer names into a payer type. Allowed types: commercial, medicare, medicaid, self_pay, other. Rules: Medicare including Part A/B, Railroad Medicare, and Medicare Advantage plans => medicare. State Medicaid and managed-Medicaid plans (Healthy Blue, WellCare, Amerigroup, Molina, CareSource, Peach State, etc.) => medicaid. Commercial insurers (BCBS/Anthem, Aetna, Cigna, UnitedHealthcare/UHC, Humana commercial, Kaiser, TRICARE, etc.) => commercial. Patient, guarantor, or self-pay => self_pay. Anything unclear => other. Respond with ONLY a JSON object mapping each input name verbatim to its type. No prose, no code fences.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json(400, { error: "ANTHROPIC_API_KEY not configured" });

    const { names } = await req.json();
    const list: string[] = Array.isArray(names)
      ? names.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim())
      : [];
    if (list.length === 0) return json(200, { classifications: {} });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: "user", content: "Classify these payer names:\n" + JSON.stringify(list) }],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      return json(502, { error: "anthropic_error", detail });
    }
    const data = await resp.json();
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    let parsed: Record<string, string> = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch (_e) {
      parsed = {};
    }
    const classifications: Record<string, string> = {};
    for (const n of list) {
      const t = String(parsed[n] || "").toLowerCase().replace(/[\s-]+/g, "_");
      classifications[n] = VALID.includes(t) ? t : "other";
    }
    return json(200, { classifications });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) });
  }
});

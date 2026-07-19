// AVEN_MERGE_ARC B6.1 Slice 2 — the merged agent fn. One Deno.serve, dispatched by `surface`:
//   surface: 'master' → the Master Agent (persistent chat, 28 tools, cards, cache, money read-back)
//   surface: 'field'  → the Field Agent  (voice, 7 tools, 25-word turns)
// The two handlers live in ./masterCore.ts and ./fieldCore.ts (each a verbatim copy of its legacy
// fn with only the Deno.serve wrapper turned into an exported function; both import the shared
// phase/gate/notify/money modules from ../_shared). v1 is behavior-preserving: zero tool-schema or
// prompt changes — the merge is consolidation + one deploy surface. The legacy ai-master-agent and
// ai-field-agent slugs stay deployed and independent so the URL cutover is a one-line rollback.
import { handleMasterAgent } from "./masterCore.ts";
import { handleFieldAgent } from "./fieldCore.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Read `surface` from a CLONE so the chosen core still gets the untouched request body.
  let surface: string | undefined;
  try {
    const body = await req.clone().json();
    surface = typeof body?.surface === "string" ? body.surface : undefined;
  } catch { /* malformed body → fall through to default-deny */ }

  if (surface === "master") return handleMasterAgent(req);
  if (surface === "field") return handleFieldAgent(req);

  // Default-deny: never silently route to the wrong surface (wrong tool roster / persona).
  return new Response(
    JSON.stringify({ error: "Missing or invalid 'surface' — expected 'master' or 'field'." }),
    { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

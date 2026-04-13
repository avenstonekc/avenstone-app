/*
  SQL — run once to create the table:

  create table if not exists ai_error_logs (
    id               uuid        primary key default gen_random_uuid(),
    function_name    text        not null,
    error_type       text,
    error_message    text        not null,
    user_input       text,
    ai_raw_response  text,
    session_id       uuid,
    job_id           uuid,
    user_id          uuid,
    tenant_id        uuid,
    metadata         jsonb,
    created_at       timestamptz default now()
  );
*/

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const { function_name, error_type, error_message, user_input,
            ai_raw_response, session_id, job_id, user_id, tenant_id, metadata } = body;

    if (!function_name || !error_message) {
      return new Response(JSON.stringify({ logged: false, reason: "missing required fields" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await sb.from("ai_error_logs").insert({
      function_name,
      error_type:      error_type      ?? null,
      error_message,
      user_input:      user_input      ?? null,
      ai_raw_response: ai_raw_response ?? null,
      session_id:      session_id      ?? null,
      job_id:          job_id          ?? null,
      user_id:         user_id         ?? null,
      tenant_id:       tenant_id       ?? null,
      metadata:        metadata        ?? null,
    }).select("id").single();

    if (error) throw error;

    return new Response(JSON.stringify({ logged: true, log_id: data.id }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (_) {
    return new Response(JSON.stringify({ logged: false }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  }
});

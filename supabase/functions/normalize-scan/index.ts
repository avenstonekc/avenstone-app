import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeFloorPlan } from './normalize.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { scan_id } = await req.json();
    if (!scan_id) {
      return json({ ok: false, error: 'scan_id is required' }, 400);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: scan, error: fetchErr } = await sb
      .from('job_lidar_scans')
      .select('id, tenant_id, rooms, scanner_version')
      .eq('id', scan_id)
      .single();

    if (fetchErr || !scan) {
      return json({ ok: false, error: fetchErr?.message ?? 'scan not found' }, 404);
    }

    const rawScan = {
      rooms: scan.rooms ?? [],
      scanner_version: scan.scanner_version ?? null,
    };

    const result = normalizeFloorPlan(rawScan);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, 422);
    }

    const { error: updateErr } = await sb
      .from('job_lidar_scans')
      .update({ normalized_geometry: result.data })
      .eq('id', scan.id)
      .eq('tenant_id', scan.tenant_id);

    if (updateErr) {
      return json({ ok: false, error: updateErr.message }, 500);
    }

    return json({ ok: true, error: null, data: result.data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

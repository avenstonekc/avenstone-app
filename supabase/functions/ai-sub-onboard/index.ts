
/*
  SQL — run once in Supabase dashboard:

  CREATE TABLE IF NOT EXISTS sub_pricing (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL,
    trade       TEXT NOT NULL,
    item_key    TEXT NOT NULL,
    item_label  TEXT NOT NULL,
    unit        TEXT NOT NULL,
    price       NUMERIC NOT NULL,
    notes       TEXT,
    is_custom   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sub_id, item_key)
  );

  CREATE TABLE IF NOT EXISTS sub_pricing_changes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_id        UUID NOT NULL REFERENCES profiles(id),
    tenant_id     UUID NOT NULL,
    item_key      TEXT NOT NULL,
    item_label    TEXT NOT NULL,
    trade         TEXT NOT NULL,
    old_price     NUMERIC,
    new_price     NUMERIC NOT NULL,
    reason        TEXT NOT NULL,
    ai_evaluation TEXT,
    ai_decision   TEXT,
    status        TEXT NOT NULL DEFAULT 'pending_owner',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE sub_pricing ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sub_pricing_changes ENABLE ROW LEVEL SECURITY;

  CREATE POLICY sub_pricing_self ON sub_pricing FOR ALL USING (sub_id = auth.uid());
  CREATE POLICY sub_pricing_tenant_read ON sub_pricing FOR SELECT USING (tenant_id = get_my_tenant_id());
  CREATE POLICY spc_self ON sub_pricing_changes FOR ALL USING (sub_id = auth.uid());
  CREATE POLICY spc_tenant_read ON sub_pricing_changes FOR SELECT USING (tenant_id = get_my_tenant_id());
*/

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ─── Trade pricing guide ──────────────────────────────────────────────────────
const TRADE_GUIDE: Record<string, { base_unit: string; items: Array<{ key: string; label: string; unit: string }> }> = {
  roofing: {
    base_unit: "per roofing square (100 sq ft)",
    items: [
      { key: "shingle_replace", label: "Shingle Tear-off & Replace", unit: "per square" },
      { key: "shingle_overlay", label: "Shingle Overlay (no tear-off)", unit: "per square" },
      { key: "ice_water_shield", label: "Ice & Water Shield Upgrade", unit: "per square" },
      { key: "decking_replace", label: "Decking/Sheathing Replacement", unit: "per sheet (4x8)" },
      { key: "ridge_cap", label: "Ridge Cap", unit: "per linear foot" },
      { key: "drip_edge", label: "Drip Edge", unit: "per linear foot" },
      { key: "valley_flashing", label: "Valley Flashing", unit: "per linear foot" },
      { key: "chimney_flash", label: "Chimney Flashing", unit: "each" },
      { key: "cricket_build", label: "Cricket/Saddle Build", unit: "each" },
      { key: "skylight_flash", label: "Skylight Flashing", unit: "each" },
      { key: "pipe_boot", label: "Pipe Boot/Vent Boot", unit: "each" },
      { key: "step_flashing", label: "Step Flashing (wall tie-in)", unit: "per linear foot" },
    ],
  },
  tile: {
    base_unit: "per square foot",
    items: [
      { key: "floor_tile_12x12", label: "Floor Tile – 12\"×12\"", unit: "per sqft" },
      { key: "floor_tile_24x24", label: "Floor Tile – 24\"×24\"", unit: "per sqft" },
      { key: "floor_tile_large", label: "Floor Tile – Large Format (48\"+ or plank)", unit: "per sqft" },
      { key: "wall_tile_standard", label: "Wall Tile – Standard", unit: "per sqft" },
      { key: "wall_tile_mosaic", label: "Wall Tile – Mosaic/Glass", unit: "per sqft" },
      { key: "shower_walls", label: "Shower Wall Tile", unit: "per sqft" },
      { key: "shower_pan", label: "Shower Pan Tile", unit: "per sqft" },
      { key: "backsplash", label: "Backsplash Install", unit: "per sqft" },
      { key: "demo_floor_tile", label: "Demo Existing Floor Tile", unit: "per sqft" },
      { key: "demo_wall_tile", label: "Demo Existing Wall Tile", unit: "per sqft" },
      { key: "floor_prep", label: "Floor Leveling/Self-leveler", unit: "per sqft" },
      { key: "heated_floor", label: "Heated Floor Mat Install", unit: "per sqft" },
      { key: "herringbone_pattern", label: "Herringbone/Custom Pattern Upcharge", unit: "per sqft" },
      { key: "shower_niche", label: "Shower Niche", unit: "each" },
      { key: "shower_bench", label: "Shower Bench", unit: "each" },
    ],
  },
  electrical: {
    base_unit: "varies by item",
    items: [
      { key: "hourly_rate", label: "Hourly Rate", unit: "per hour" },
      { key: "outlet_standard", label: "Standard Outlet", unit: "each" },
      { key: "outlet_gfci", label: "GFCI Outlet", unit: "each" },
      { key: "switch_standard", label: "Standard Switch", unit: "each" },
      { key: "light_fixture", label: "Light Fixture Install", unit: "each" },
      { key: "recessed_light", label: "Recessed Light Install", unit: "each" },
      { key: "ceiling_fan", label: "Ceiling Fan Install", unit: "each" },
      { key: "panel_upgrade_100", label: "Panel Upgrade – 100A", unit: "each" },
      { key: "panel_upgrade_200", label: "Panel Upgrade – 200A", unit: "each" },
      { key: "circuit_add", label: "New Circuit", unit: "each" },
      { key: "ev_charger", label: "EV Charger Install", unit: "each" },
      { key: "new_construction_sqft", label: "New Construction Rough-in", unit: "per sqft" },
      { key: "low_voltage_drop", label: "Low Voltage Drop (data/cable/speaker)", unit: "per drop" },
    ],
  },
  plumbing: {
    base_unit: "varies by fixture",
    items: [
      { key: "hourly_rate", label: "Hourly Rate", unit: "per hour" },
      { key: "toilet_install", label: "Toilet Install", unit: "each" },
      { key: "sink_install", label: "Sink Install", unit: "each" },
      { key: "shower_install", label: "Shower System Install", unit: "each" },
      { key: "tub_install", label: "Tub Install", unit: "each" },
      { key: "water_heater_tank", label: "Water Heater – Tank", unit: "each" },
      { key: "water_heater_tankless", label: "Water Heater – Tankless", unit: "each" },
      { key: "rough_in_bathroom", label: "Bathroom Rough-in (new)", unit: "each" },
      { key: "rough_in_kitchen", label: "Kitchen Rough-in (new)", unit: "each" },
      { key: "drain_tile_lf", label: "Drain Tile System", unit: "per linear foot" },
      { key: "sump_pump", label: "Sump Pump Install", unit: "each" },
      { key: "dishwasher_line", label: "Dishwasher Line", unit: "each" },
      { key: "fridge_water_line", label: "Fridge Water Line", unit: "each" },
    ],
  },
  hvac: {
    base_unit: "varies",
    items: [
      { key: "ac_unit_replace", label: "AC Unit Replacement", unit: "per ton" },
      { key: "furnace_replace", label: "Furnace Replacement", unit: "each" },
      { key: "mini_split_1zone", label: "Mini-Split – 1 Zone", unit: "each" },
      { key: "mini_split_add_zone", label: "Mini-Split Add-on Zone", unit: "each" },
      { key: "ductwork_new_sqft", label: "New Ductwork Install", unit: "per sqft (floor plan)" },
      { key: "ductwork_repair_lf", label: "Ductwork Repair/Seal", unit: "per linear foot" },
      { key: "thermostat", label: "Smart Thermostat Install", unit: "each" },
      { key: "humidifier", label: "Whole-home Humidifier", unit: "each" },
      { key: "hourly_service", label: "Service Call / Hourly", unit: "per hour" },
    ],
  },
  framing: {
    base_unit: "per square foot",
    items: [
      { key: "new_construction_sqft", label: "New Construction Framing", unit: "per sqft" },
      { key: "interior_wall_lf", label: "Interior Wall (non-structural)", unit: "per linear foot" },
      { key: "load_bearing_wall_lf", label: "Load-Bearing Wall", unit: "per linear foot" },
      { key: "beam_install", label: "Beam Install (LVL/steel)", unit: "each" },
      { key: "window_header", label: "Window/Door Header", unit: "each" },
      { key: "soffit_framing_lf", label: "Soffit/Bulkhead Framing", unit: "per linear foot" },
      { key: "stair_framing", label: "Stair Framing", unit: "per flight" },
      { key: "cathedral_ceiling_sqft", label: "Cathedral/Vaulted Ceiling", unit: "per sqft" },
      { key: "hourly_rate", label: "Hourly Rate", unit: "per hour" },
    ],
  },
  drywall: {
    base_unit: "per square foot",
    items: [
      { key: "hang_finish_level4", label: "Hang & Finish – Level 4", unit: "per sqft" },
      { key: "hang_finish_level5", label: "Hang & Finish – Level 5 (premium smooth)", unit: "per sqft" },
      { key: "hang_only", label: "Hang Only", unit: "per sqft" },
      { key: "finish_only", label: "Tape, Mud & Sand Only", unit: "per sqft" },
      { key: "ceiling_standard_sqft", label: "Ceiling – Standard", unit: "per sqft" },
      { key: "coffered_ceiling_sqft", label: "Coffered/Tray Ceiling Upcharge", unit: "per sqft" },
      { key: "curved_wall_lf", label: "Curved Wall", unit: "per linear foot" },
      { key: "drywall_repair_sqft", label: "Patch/Repair", unit: "per sqft" },
      { key: "demo_existing_sqft", label: "Demo Existing Drywall", unit: "per sqft" },
      { key: "soundboard_sqft", label: "Soundboard/Resilient Channel", unit: "per sqft" },
    ],
  },
  painting: {
    base_unit: "per square foot",
    items: [
      { key: "interior_walls_sqft", label: "Interior Walls – 2 coat", unit: "per sqft" },
      { key: "interior_ceilings_sqft", label: "Interior Ceilings", unit: "per sqft" },
      { key: "interior_trim_lf", label: "Interior Trim/Doors", unit: "per linear foot" },
      { key: "exterior_siding_sqft", label: "Exterior Siding", unit: "per sqft" },
      { key: "exterior_trim_lf", label: "Exterior Trim", unit: "per linear foot" },
      { key: "cabinet_paint_each", label: "Cabinet Door/Drawer Face", unit: "each" },
      { key: "epoxy_floor_sqft", label: "Epoxy Floor Coating", unit: "per sqft" },
      { key: "deck_stain_sqft", label: "Deck Stain/Seal", unit: "per sqft" },
      { key: "power_wash_sqft", label: "Power Wash", unit: "per sqft" },
      { key: "wallpaper_remove_sqft", label: "Wallpaper Removal", unit: "per sqft" },
    ],
  },
  flooring: {
    base_unit: "per square foot",
    items: [
      { key: "lvp_install_sqft", label: "LVP/LVT Install", unit: "per sqft" },
      { key: "hardwood_install_sqft", label: "Hardwood Install", unit: "per sqft" },
      { key: "hardwood_refinish_sqft", label: "Hardwood Sand & Refinish", unit: "per sqft" },
      { key: "carpet_install_sqft", label: "Carpet Install", unit: "per sqft" },
      { key: "laminate_install_sqft", label: "Laminate Install", unit: "per sqft" },
      { key: "subfloor_repair_sqft", label: "Subfloor Repair", unit: "per sqft" },
      { key: "demo_carpet_sqft", label: "Remove Carpet", unit: "per sqft" },
      { key: "demo_hardwood_sqft", label: "Remove Hardwood", unit: "per sqft" },
      { key: "stair_tread_each", label: "Stair Treads/Risers", unit: "per step" },
      { key: "transition_strip_each", label: "Transition Strips", unit: "each" },
    ],
  },
  concrete: {
    base_unit: "per square foot",
    items: [
      { key: "slab_standard_sqft", label: "Concrete Slab – Standard (4\")", unit: "per sqft" },
      { key: "slab_reinforced_sqft", label: "Concrete Slab – Reinforced", unit: "per sqft" },
      { key: "driveway_sqft", label: "Driveway", unit: "per sqft" },
      { key: "sidewalk_sqft", label: "Sidewalk/Walkway", unit: "per sqft" },
      { key: "patio_sqft", label: "Patio", unit: "per sqft" },
      { key: "demo_concrete_sqft", label: "Demo & Haul-off Existing", unit: "per sqft" },
      { key: "stamped_concrete_sqft", label: "Stamped Concrete Upcharge", unit: "per sqft" },
      { key: "crack_repair_each", label: "Crack Repair/Injection", unit: "each" },
    ],
  },
  insulation: {
    base_unit: "per square foot",
    items: [
      { key: "batt_wall_sqft", label: "Batt Insulation – Walls", unit: "per sqft" },
      { key: "batt_ceiling_sqft", label: "Batt Insulation – Ceiling", unit: "per sqft" },
      { key: "blown_attic_sqft", label: "Blown-in Attic", unit: "per sqft" },
      { key: "spray_foam_closed_sqft", label: "Spray Foam – Closed Cell", unit: "per sqft" },
      { key: "spray_foam_open_sqft", label: "Spray Foam – Open Cell", unit: "per sqft" },
      { key: "rim_joist_lf", label: "Rim Joist Insulation", unit: "per linear foot" },
      { key: "vapor_barrier_sqft", label: "Vapor Barrier", unit: "per sqft" },
    ],
  },
  gutters: {
    base_unit: "per linear foot",
    items: [
      { key: "gutter_5inch_lf", label: "5\" K-Style Gutter", unit: "per linear foot" },
      { key: "gutter_6inch_lf", label: "6\" K-Style Gutter", unit: "per linear foot" },
      { key: "downspout_each", label: "Downspout", unit: "each" },
      { key: "gutter_guard_lf", label: "Gutter Guard", unit: "per linear foot" },
      { key: "gutter_remove_lf", label: "Remove Existing Gutters", unit: "per linear foot" },
      { key: "underground_drain_lf", label: "Underground Drain Extension", unit: "per linear foot" },
      { key: "fascia_repair_lf", label: "Fascia Repair", unit: "per linear foot" },
    ],
  },
  siding: {
    base_unit: "per square foot",
    items: [
      { key: "vinyl_siding_sqft", label: "Vinyl Siding", unit: "per sqft" },
      { key: "hardiplank_sqft", label: "HardiePlank/Fiber Cement", unit: "per sqft" },
      { key: "lp_smartside_sqft", label: "LP SmartSide", unit: "per sqft" },
      { key: "remove_siding_sqft", label: "Remove Existing Siding", unit: "per sqft" },
      { key: "house_wrap_sqft", label: "House Wrap", unit: "per sqft" },
      { key: "soffit_fascia_lf", label: "Soffit & Fascia", unit: "per linear foot" },
      { key: "window_trim_wrap_each", label: "Window/Door Trim Wrap", unit: "each" },
    ],
  },
};

const normalizeTradeKey = (trade: string): string => {
  const t = (trade || "").toLowerCase();
  if (t.includes("roof")) return "roofing";
  if (t.includes("tile") || t.includes("ceramic")) return "tile";
  if (t.includes("electric")) return "electrical";
  if (t.includes("plumb")) return "plumbing";
  if (t.includes("hvac") || t.includes("heat") || t.includes("air") || t.includes("cool")) return "hvac";
  if (t.includes("fram") || t.includes("carp")) return "framing";
  if (t.includes("drywall") || t.includes("sheetrock")) return "drywall";
  if (t.includes("paint")) return "painting";
  if (t.includes("floor")) return "flooring";
  if (t.includes("concrete") || t.includes("flatwork")) return "concrete";
  if (t.includes("insul")) return "insulation";
  if (t.includes("gutter")) return "gutters";
  if (t.includes("sid")) return "siding";
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { sub_id, tenant_id, trade, full_name, message, conversation_history, action } = body;

    if (!sub_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "Missing sub_id or tenant_id" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Save action: persist collected pricing ──────────────────────────────
    if (action === "save") {
      const { items } = body;
      if (!items?.length) {
        return new Response(JSON.stringify({ saved: false, reason: "no items" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const rows = items.map((item: Record<string, unknown>) => ({
        sub_id, tenant_id,
        trade: item.trade || trade,
        item_key: item.key,
        item_label: item.label,
        unit: item.unit,
        price: Number(item.price),
        is_custom: item.is_custom || false,
        updated_at: new Date().toISOString(),
      }));
      await sb.from("sub_pricing").upsert(rows, { onConflict: "sub_id,item_key" });
      return new Response(JSON.stringify({ saved: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Load market data (anonymous — avg/min/max by item_key for this trade) ──
    const tradeKey = normalizeTradeKey(trade || "");
    let marketContext = "";
    if (tradeKey) {
      const { data: market } = await sb
        .from("sub_pricing")
        .select("item_key, item_label, price")
        .eq("tenant_id", tenant_id)
        .eq("trade", tradeKey)
        .neq("sub_id", sub_id);

      if (market && market.length > 0) {
        const grouped: Record<string, number[]> = {};
        for (const row of market) {
          if (!grouped[row.item_key]) grouped[row.item_key] = [];
          grouped[row.item_key].push(Number(row.price));
        }
        const lines = Object.entries(grouped).map(([key, prices]) => {
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          return `${key}: avg $${avg.toFixed(0)}, range $${min}–$${max}`;
        });
        marketContext = `\n\nMARKET PRICING DATA (${prices.length} other subs in this network — anonymous):\n${lines.join("\n")}\nIf their price is more than 60% above the network average for any item, mention it once diplomatically: "We're seeing that typically priced around $X in our network — want to confirm your number?"`;
      }
    }

    const guide = TRADE_GUIDE[tradeKey];
    const guideText = guide
      ? `TRADE: ${(trade || tradeKey).toUpperCase()}\nBase unit: ${guide.base_unit}\n\nAsk about each item in this order:\n${guide.items.map((it, i) => `${i + 1}. ${it.label} (${it.unit})`).join("\n")}`
      : `TRADE: ${trade || "General Contractor"}\nAsk about their main services, how they price each one, and any common add-ons or extras they charge for.`;

    const systemPrompt = `You are the Avenstone AI — onboarding a new subcontractor into the network. Your job is to collect their complete pricing for every service they offer. This data powers automated estimates and bid generation.

Sub name: ${full_name || "there"}
${guideText}${marketContext}

RULES:
- Be friendly but efficient. They're a contractor, not a client. Keep it conversational.
- Confirm each price before moving to the next item. If they give a range, ask "What's your typical number?"
- After going through all items, ALWAYS ask: "Is there anything else you charge for that I didn't cover? Any special conditions, minimums, or travel fees?"
- When you have collected prices for ALL items AND asked the catch-all question, set "is_complete": true.
- Never mention Claude or Anthropic.

Return ONLY valid JSON — no markdown, no explanation:
{
  "message": "Your conversational response",
  "collected_items": [
    { "key": "item_key", "label": "Display label", "unit": "unit", "price": 123, "trade": "${tradeKey || trade || "general"}", "is_custom": false }
  ],
  "is_complete": false
}

"collected_items" should include ALL items collected so far (cumulative across the whole conversation).
Custom items the sub adds themselves get "is_custom": true.`;

    const history = (conversation_history || []).slice(-30);
    const msgs = history.length > 0
      ? [...history, { role: "user", content: message || "Ready to get started." }]
      : [{ role: "user", content: message || `Hi, I'm ${full_name || "a new sub"}. I do ${trade || "general construction"} work.` }];

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: msgs,
      }),
    });

    const aiJson = await aiRes.json();
    const rawText = aiJson.content?.[0]?.text || "{}";

    let parsed: Record<string, unknown>;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: "AI parse error", raw: rawText }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

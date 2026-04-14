
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { sub_id, tenant_id, full_name, trade, message, conversation_history } = body;

    if (!sub_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "Missing sub_id or tenant_id" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Load this sub's current pricing
    const { data: myPricing } = await sb
      .from("sub_pricing")
      .select("item_key, item_label, unit, price, trade, is_custom")
      .eq("sub_id", sub_id)
      .order("trade")
      .order("item_label");

    // Load market data for comparison (anonymous)
    const { data: marketAll } = await sb
      .from("sub_pricing")
      .select("item_key, item_label, price, trade")
      .eq("tenant_id", tenant_id)
      .neq("sub_id", sub_id);

    const marketMap: Record<string, number[]> = {};
    for (const row of (marketAll || [])) {
      if (!marketMap[row.item_key]) marketMap[row.item_key] = [];
      marketMap[row.item_key].push(Number(row.price));
    }

    const marketSummary = Object.entries(marketMap).map(([key, prices]) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return `${key}: avg $${avg.toFixed(0)} (${prices.length} subs)`;
    }).join("\n");

    const myPricingText = (myPricing || []).map(p =>
      `${p.item_key} | ${p.item_label} | ${p.unit} | $${p.price}${p.is_custom ? " (custom)" : ""}`
    ).join("\n") || "No pricing on file yet.";

    const systemPrompt = `You are the Avenstone AI — a pricing advisor for subcontractors in the Avenstone network.

Sub: ${full_name || "Subcontractor"}
Trade: ${trade || "General"}

YOUR ROLE:
- Help the sub understand their pricing relative to market
- Handle price change requests with judgment
- Be direct and honest. This is a business conversation, not customer service.

THE SUB'S CURRENT PRICING:
${myPricingText}

NETWORK MARKET DATA (anonymous — other subs in same tenant):
${marketSummary || "No market data yet — you're the first in this trade."}

PRICE CHANGE LOGIC:
When a sub wants to change a price, evaluate their reason:
- GOOD reasons (approve automatically): material cost increases, market rate changes, equipment/overhead increases, new certifications or specializations, been underpriced vs market
- WEAK reasons (route to owner for approval): "just want more money", no reason given, vague reasoning, price already significantly above market
- If their requested new price would be >60% above network average with no strong justification → always route to owner

When you decide to approve or escalate, return it in the JSON "price_change" field.
If approved automatically: update immediately in your response.
If escalated to owner: tell them it's been sent for review and they'll hear back within 24-48 hours.

RULES:
- Never reveal individual sub names or exact sub counts when sharing market data
- Be supportive but firm. If a reason is weak, say so professionally.
- Never mention Claude or Anthropic.

Return ONLY valid JSON:
{
  "message": "Your response to the sub",
  "price_change": null | {
    "item_key": "the item key",
    "item_label": "Display name",
    "old_price": 100,
    "new_price": 120,
    "reason": "what they said",
    "decision": "approved" | "pending_owner",
    "evaluation": "brief internal note on why"
  }
}`;

    const history = (conversation_history || []).slice(-20);
    const msgs = history.length > 0
      ? [...history, { role: "user", content: message }]
      : [{ role: "user", content: message || "Hi, I want to review my pricing." }];

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

    // Handle price change decision
    const pc = parsed.price_change as Record<string, unknown> | null;
    if (pc && pc.decision) {
      // Log the change request
      await sb.from("sub_pricing_changes").insert({
        sub_id,
        tenant_id,
        item_key: pc.item_key,
        item_label: pc.item_label,
        trade: trade || "",
        old_price: pc.old_price || null,
        new_price: pc.new_price,
        reason: pc.reason || "",
        ai_evaluation: String(pc.evaluation || ""),
        ai_decision: pc.decision,
        status: pc.decision === "approved" ? "approved" : "pending_owner",
      });

      if (pc.decision === "approved") {
        // Auto-apply the price change
        await sb.from("sub_pricing")
          .update({ price: pc.new_price, updated_at: new Date().toISOString() })
          .eq("sub_id", sub_id)
          .eq("item_key", pc.item_key);
      } else {
        // Notify owner — pull owner IDs for this tenant
        const { data: owners } = await sb
          .from("profiles")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("role", "owner");

        if (owners?.length) {
          await sb.from("notifications").insert(
            owners.map((o: { id: string }) => ({
              tenant_id,
              user_id: o.id,
              type: "pricing_change_request",
              title: `Pricing Change Request — ${full_name || "Sub"}`,
              body: `${full_name || "A sub"} wants to change ${pc.item_label} from $${pc.old_price} to $${pc.new_price}. Reason: ${pc.reason}. Review needed.`,
              read: false,
              email_sent: false,
              sms_sent: false,
            }))
          );
        }
      }
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

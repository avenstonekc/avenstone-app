

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { goal, context, steps_count = 3, trigger = "manual" } = await req.json();

    if (!goal) {
      return new Response(JSON.stringify({ error: "Missing goal" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const triggerContext = {
      manual: "The contact was manually enrolled by a sales rep.",
      new_contact: "A new lead just came in — they haven't been contacted yet.",
      missed_call: "Someone called but we missed it. They already got a quick text-back. This is the follow-up sequence.",
    }[trigger] || "";

    const prompt = `You are a sales communication specialist for Avenstone Group, a residential remodeling and construction contractor in Kansas City, MO. You write warm, professional, human-sounding SMS messages — not robotic marketing blasts.

Goal of this sequence: ${goal}
${context ? `Additional context: ${context}` : ""}
Trigger: ${triggerContext}

Write a ${steps_count}-step SMS follow-up sequence. Each step should:
- Feel like it's from a real person, not a bot
- Be concise (under 160 characters ideally, 320 max)
- Have a clear, natural call to action
- Reference Avenstone Group naturally (not robotically)
- Space out appropriately (day 0 = same day, then 2-3 days apart)

Return ONLY a JSON array, no explanation:
[
  { "day": 0, "label": "Immediate", "message": "..." },
  { "day": 2, "label": "Day 2 Follow-up", "message": "..." },
  { "day": 5, "label": "Day 5 Check-in", "message": "..." }
]`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const raw = aiData.content?.[0]?.text || "[]";

    let steps;
    try {
      const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      steps = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, steps }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

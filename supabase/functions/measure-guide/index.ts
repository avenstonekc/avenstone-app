// deno-lint-ignore-file no-explicit-any


const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function buildSystemPrompt(job: any, transcript: any, measurements: any): string {
  const measurementsList = (measurements && typeof measurements === "object" && Object.keys(measurements).length > 0)
    ? Object.entries(measurements as Record<string, unknown>).map(([k, v]) => `  ${k}: ${v}`).join("\n")
    : "  None yet";

  const transcriptSection = (transcript && typeof transcript === "string" && transcript.length > 0)
    ? `\nCONSULTATION NOTES:\n${transcript}\n`
    : "";

  return `You are the Avenstone Field Measurement Guide. Walk contractors through measuring a job site one measurement at a time.

PROJECT:
Address: ${job?.address ?? "Unknown"}
Scope: ${job?.scope ?? "General remodel"}
Rough Sq Ft: ${job?.sqft ?? "Unknown"}
${transcriptSection}
MEASUREMENTS COLLECTED:
${measurementsList}

RULES:
- Ask for ONE measurement at a time, be specific
- Keep every response under 20 words, no markdown
- Confirm each measurement before moving to the next
- When all measurements are complete say: MEASUREMENTS_COMPLETE

WHAT TO MEASURE based on scope:
Kitchen: room length x width, ceiling height, cabinet run linear feet, island length if any, window and door count
Bathroom: room length x width, ceiling height, shower area length x width, vanity wall linear feet, window count
Living or bedroom: room length x width, ceiling height, window and door count
Whole home: every room dimensions plus exterior footprint`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const job = body.job ?? {};
    const transcript = body.transcript ?? null;
    const measurements = body.measurements ?? {};
    const messages: Array<{ role: string; content: string }> = body.messages ?? [];

    const apiMessages = messages.length > 0
      ? messages
      : [{ role: "user", content: "Start the measurement session." }];

    const systemPrompt = buildSystemPrompt(job, transcript, measurements);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error("Anthropic error:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: data.error?.message ?? "AI error" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const rawReply: string = data.content[0].text.trim();
    const complete = rawReply.includes("MEASUREMENTS_COMPLETE");
    const reply = complete
      ? "Perfect, all measurements are recorded. Tap Save to attach them to this job."
      : rawReply;

    return new Response(JSON.stringify({ reply, complete }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("measure-guide error:", String(e));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

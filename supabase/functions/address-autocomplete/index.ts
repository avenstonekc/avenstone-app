import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;

// Proxy Google Places Autocomplete — keeps the API key server-side
serve(async (req) => {
  const { input } = await req.json();
  if (!input || input.length < 3) return new Response("[]", { status: 200 });

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("key", GOOGLE_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  const suggestions = (data.predictions || []).map((p: any) => ({
    description: p.description,
    place_id: p.place_id,
  }));

  return new Response(JSON.stringify(suggestions), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// @deno-types="https://esm.sh/v135/web-push@3.6.7/src/index.d.ts"
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(
  "mailto:kalin@avenstonekc.com",
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

serve(async (req) => {
  try {
    const payload = await req.json();
    const notif = payload.record;
    if (!notif?.user_id) return new Response("no record", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE);

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", notif.user_id);

    if (!subs?.length) return new Response("no subscriptions", { status: 200 });

    const pushPayload = JSON.stringify({
      title: notif.title || "Avenstone",
      body:  notif.body  || "",
      url:   "/",
      tag:   notif.type  || "avenstone",
    });

    const expired: string[] = [];

    await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          pushPayload
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expired.push(s.id);
        } else {
          console.error("push send error:", err?.statusCode, err?.body);
        }
      }
    }));

    if (expired.length) {
      await sb.from("push_subscriptions").delete().in("id", expired);
    }

    return new Response(JSON.stringify({ sent: subs.length - expired.length, expired: expired.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(String(err), { status: 500 });
  }
});

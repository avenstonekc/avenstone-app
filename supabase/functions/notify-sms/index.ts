
// SMS notifications for internal staff/subs are disabled.
// Owners and employees use in-app notifications only.
// Subs use email + in-app notifications.

Deno.serve(async (_req) => {
  return new Response("skipped", { status: 200 });
});

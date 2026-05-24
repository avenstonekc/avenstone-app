# PUSH_NOTIFICATIONS_ARC

Dual-channel push notifications: APNs (iOS native via Capacitor) + Web Push (PWA). APNs ships first; Web Push deferred but schema and routing designed for both from day one.

Audit basis: 2026-05-23 (see CLAUDE_MEMORY.md handoff entry). iOS native push: zero. send-push edge fn: Web Push only, VAPID keys set, 7 stale rows. PWA: zero scaffolding.

---

## Locked decisions

1. **Option B — dual-channel from day one.** Schema, send-push routing, and registration code all designed to support APNs + Web Push. APNs ships in v1; Web Push is a later additive slice (manifest + sw.js + subscribe call only — no schema or send-push refactor).

2. **Channel discrimination in DB, not in code.** `push_subscriptions.channel` enum (`'web' | 'apns'`) is the source of truth. send-push branches on the channel column per subscription row. No `isNativePlatform()` checks in send-push — only at registration time on the client.

3. **One row per device per channel.** A user on iOS native + desktop Chrome has two rows. APNs token uniqueness: `(user_id, apns_token)`. Web Push uniqueness: `(user_id, endpoint)`. Different unique constraints per channel — partial unique indexes.

4. **Registration gated by `Capacitor.isNativePlatform()`.** Native → register APNs only. Web → register Web Push only (deferred slice). No client ever holds both channels for the same device.

5. **Tap routes to in-app target.** Every push payload includes `data.deep_link` (e.g. `/job/<id>/todos`, `/job/<id>/financials`). Tap handler reads it and navigates via existing app state. No new routing infra in v1 — uses current `selJ` setter pattern. URL-based routing is a separate backlog item.

6. **Four notification types in v1.** todo_assigned (cross-user), job_assigned, schedule_item_assigned, change_order_status. All four already emit `notifications` rows today — push is an additional fan-out, not a replacement for email.

7. **Priority gate already exists.** `on_notification_insert` trigger has a `WHEN (NEW.email_sent IS NOT TRUE)` clause (AGENT_OPS Phase 2.2, 2026-05-20). Push fan-out lives alongside email — same trigger, new branch. High-priority notifications push AND email; medium/low push only.

8. **send-push has zero callers today.** Wiring is greenfield. No legacy call path to preserve.

9. **APNs production cert, not sandbox, for TestFlight.** TestFlight builds use the production APNs environment, not the sandbox. Plugin docs and Apple Developer cert config both honor this.

10. **No silent push in v1.** All pushes are user-visible alerts. Background data sync via silent push deferred.

---

## Phases

### Phase 1 — Schema foundation (1 prompt)
- Extend `push_subscriptions`: add `channel TEXT NOT NULL` with CHECK constraint (`'web' | 'apns'`), add `apns_token TEXT` (nullable), keep `endpoint`/`p256dh`/`auth` (now nullable since APNs rows won't have them).
- Drop existing unique constraint on `(user_id, endpoint)` if present.
- Add two partial unique indexes:
  - `WHERE channel = 'web'` on `(user_id, endpoint)`
  - `WHERE channel = 'apns'` on `(user_id, apns_token)`
- Backfill the 7 existing rows: set `channel = 'web'` (they're all from prior Web Push dev work).
- RLS: existing policies preserved; verify they reference `user_id` not channel-specific columns.
- Migration verification: information_schema confirms channel column + CHECK, pg_indexes confirms both partial unique indexes.

### Phase 2 — PWA manifest (1 prompt)
- Add `public/manifest.json` with name, short_name, icons (use existing logo), theme_color (matches current meta), display:standalone, start_url:/.
- Add `<link rel="manifest" href="/manifest.json">` to index.html.
- No service worker yet. No sw.js. This phase is pure installability — "Add to Home Screen" on Chrome/Android/Safari.
- Verify: build passes, manifest accessible at /manifest.json after Vercel deploy.

### Phase 3 — APNs plugin install + iOS config (1 prompt)
- `npm install @capacitor/push-notifications@8.x` (Cap 8 version, matching project).
- `npx cap sync ios`.
- Add `UIBackgroundModes` with `remote-notification` to Info.plist.
- Create `ios/App/App/App.entitlements` with `aps-environment` = `production` (TestFlight uses prod, per locked decision #9).
- Update AppDelegate.swift with `didRegisterForRemoteNotificationsWithDeviceToken` + `didFailToRegisterForRemoteNotificationsWithError` handlers per plugin docs.
- APNs key/cert config: document the Apple Developer Portal steps in this arc doc (or a side note) — actual cert upload is Kalin's manual step in App Store Connect / Apple Developer console.
- No JS changes this phase. iOS plumbing only.
- Verification: `npx cap sync` succeeds, no Xcode errors on next Codemagic build.

### Phase 4 — Client registration (1 prompt)
- New file `avenstone-vite/src/lib/push.js`: `registerForPush()` function. Gated by `Capacitor.isNativePlatform()`. On native:
  - `PushNotifications.requestPermissions()` → if granted, `register()`.
  - Listener on `registration` → grab token, upsert into push_subscriptions with `channel='apns'`, `apns_token=<token>`, `user_id=<auth user id>`. Use sbHelper pattern `{ok, error, data}`.
  - Listener on `registrationError` → log to ai_error_logs.
  - Listener on `pushNotificationActionPerformed` → read `data.deep_link`, navigate via existing app router (selJ state).
  - Listener on `pushNotificationReceived` → foreground display (Capacitor handles this; verify behavior).
- Wire `registerForPush()` into App.jsx mount after auth confirms (post-profile-load).
- No Web Push path yet — function is APNs-only with a `// TODO: Web Push slice` comment at the gate.
- Verification: build passes, on-device TestFlight test confirms token lands in push_subscriptions.

### Phase 5 — send-push APNs branch + notification trigger fan-out (1 prompt)
- send-push edge fn: add APNs path using `apns2` Deno-compatible lib (audit available libs in prompt — fallback: raw HTTP/2 fetch to APNs endpoint with JWT auth).
- Branch on `subscription.channel`: 'web' → existing web-push code path (preserved verbatim), 'apns' → new APNs path.
- Payload contract (channel-agnostic input): `{ user_id, title, body, deep_link, priority }`. send-push internally fans out to all subscriptions for that user_id, branches per row.
- APNs auth: APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY as new function secrets (Kalin sets these manually after Phase 3 cert config).
- Wire `on_notification_insert` trigger to fan out to push for the four v1 types: todo_assigned, job_assigned, schedule_item_assigned, change_order_status. Trigger calls send-push with the notification row's user_id + type-appropriate copy + deep_link derived from related_entity.
- Email + push co-exist: existing email path unchanged, push is added in parallel under the same trigger.
- Verification: insert a test notification of each of the 4 types for a registered iOS user → push arrives on device → tap routes to correct screen.

### Phase 6 — Web Push slice (DEFERRED, blueprint only)
- Triggers when: browser-based or Android distribution becomes a priority, OR there's user demand for non-iOS push.
- Work: manifest.json already shipped (Phase 2). Add sw.js with push event listener + notificationclick handler. Add SW registration to main.jsx. Extend push.js `registerForPush()` web branch: subscribe via PushManager, upsert with `channel='web'`. send-push web path already exists — no edge fn changes needed.
- No schema changes. No send-push changes. Pure client-side additive slice.

---

## Schema reference (post-Phase 1)

```
push_subscriptions
  id           UUID PK
  user_id      UUID FK → profiles(id) ON DELETE CASCADE
  channel      TEXT NOT NULL CHECK (channel IN ('web','apns'))
  endpoint     TEXT NULL    -- web only
  p256dh       TEXT NULL    -- web only
  auth         TEXT NULL    -- web only
  apns_token   TEXT NULL    -- apns only
  created_at   TIMESTAMPTZ DEFAULT now()

  Indexes:
    idx_push_sub_web_unique  ON (user_id, endpoint)    WHERE channel = 'web'
    idx_push_sub_apns_unique ON (user_id, apns_token)  WHERE channel = 'apns'
```

---

## send-push contract (post-Phase 5)

```
POST /functions/v1/send-push
Body: { user_id: UUID, title: string, body: string, deep_link: string, priority: 'high'|'medium'|'low' }
Returns: { ok: boolean, sent: number, failed: number, errors: [{ subscription_id, channel, error }] }

Behavior:
  1. Load all push_subscriptions for user_id.
  2. For each row: branch on channel.
     - 'web' → webpush.sendNotification(subscription, JSON.stringify(payload))
     - 'apns' → APNs HTTP/2 POST with JWT auth, apns-topic = bundle id, payload includes aps.alert + data.deep_link
  3. Aggregate results, log failures to ai_error_logs.
  4. Subscription cleanup: on 410 Gone (web) or BadDeviceToken (apns) → delete the row.
```

---

## Deferred / out of scope

- Silent push (background sync) — not in v1.
- Notification grouping / threading — iOS defaults are fine for v1.
- Rich media in push payloads (images) — text only in v1.
- Notification preferences screen (per-type opt-in/out) — single global opt-in via OS permission in v1. Granular controls deferred until users ask.
- Android FCM — not in distribution model. Same architecture would apply (third channel value) if it becomes one.
- Token rotation handling — APNs tokens can change; plugin re-fires `registration` listener. v1 upsert pattern handles this implicitly via uniqueness constraint. Stale-token cleanup is via send-push failure handling (410 / BadDeviceToken delete).
- Deep-link target validation — if `data.deep_link` references a deleted entity, app falls back to home screen. No special error UI in v1.

---

## Open questions to resolve before each phase ships

- Phase 1: confirm no FK references to push_subscriptions exist (audit pg_constraint). If any, account for them in the migration.
- Phase 3: APNs cert config — Kalin needs to walk through Apple Developer Portal steps. Document in arc doc as a manual checklist before Phase 4 ships.
- Phase 5: confirm Deno APNs lib choice (apns2 vs raw HTTP/2). If raw HTTP/2, vendor in the JWT signing logic. Audit before writing the slice.

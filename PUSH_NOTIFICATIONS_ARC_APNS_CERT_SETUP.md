# APNs Certificate & Key Setup — Manual Checklist

This is the manual configuration Kalin must complete in Apple Developer Portal and Supabase before Phase 5 (send-push APNs branch) can go live. Phase 4 (client registration) can be built and tested without these secrets, but no push will actually deliver until all 4 secrets are set.

---

## Step 1 — Enable Push Notifications capability on the App ID

1. Go to [https://developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list)
2. Find the App ID with bundle ID `com.avenstonekc.avenstone`
3. Click it → scroll to **Capabilities** → find **Push Notifications**
4. Click **Configure** → enable it → **Save**

> If Push Notifications was already enabled, no change needed — just confirm it's checked.

---

## Step 2 — Create an APNs Authentication Key (.p8)

Apple recommends the APNs Auth Key (JWT-based) over the legacy certificate approach. One key works for all your apps and does not expire (only revoke it).

1. Go to [https://developer.apple.com/account/resources/authkeys/list](https://developer.apple.com/account/resources/authkeys/list)
2. Click the **+** button → **Register a New Key**
3. Name it: `Avenstone APNs Key` (or similar)
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue** → **Register**
6. **Download the `.p8` file immediately** — Apple only lets you download it once
7. Note the **Key ID** shown on the page (10-character alphanumeric, e.g. `ABC1234DEF`)

---

## Step 3 — Note your Team ID

1. Go to [https://developer.apple.com/account](https://developer.apple.com/account)
2. In the top-right area under your name, find **Team ID** (10-character alphanumeric)
3. Note it

---

## Step 4 — Collect your 4 Supabase secrets

You need:

| Secret name         | Value source                                     | Example shape |
|---------------------|--------------------------------------------------|---------------|
| `APNS_KEY_ID`       | Key ID from Step 2                               | `ABC1234DEF` |
| `APNS_TEAM_ID`      | Team ID from Step 3                              | `XYZ9876543` |
| `APNS_AUTH_KEY`     | Full contents of the `.p8` file (including `-----BEGIN PRIVATE KEY-----` header/footer) | multi-line string |
| `APNS_BUNDLE_ID`    | `com.avenstonekc.avenstone`                      | literal string |

---

## Step 5 — Store the 4 secrets in Supabase

Use the Supabase CLI or Dashboard → Functions → Secrets. Via CLI:

```bash
# Run each separately — never paste all 4 in one line
supabase secrets set APNS_KEY_ID=<your-key-id> --project-ref cbfftukmhqvvjlrlnltk
supabase secrets set APNS_TEAM_ID=<your-team-id> --project-ref cbfftukmhqvvjlrlnltk
supabase secrets set APNS_BUNDLE_ID=com.avenstonekc.avenstone --project-ref cbfftukmhqvvjlrlnltk

# For the .p8 file — pipe the file contents directly to avoid shell escaping issues
supabase secrets set APNS_AUTH_KEY="$(cat /path/to/AuthKey_ABC1234DEF.p8)" --project-ref cbfftukmhqvvjlrlnltk
```

> **Security:** Never paste the `.p8` contents into a chat window, a commit, or CLAUDE_MEMORY.md. Pipe directly from file to command.

---

## Step 6 — Verify `aps-environment` is correct for TestFlight

The entitlements file at `ios/App/App/App.entitlements` contains:

```xml
<key>aps-environment</key>
<string>production</string>
```

This is correct. TestFlight uses the **production** APNs endpoint, not the sandbox. Do not change this value. If you ever need to run against the sandbox (local Xcode development builds only), that requires a separate entitlement change — but for everything going through Codemagic → TestFlight, `production` is always correct.

---

## Step 7 — Post-Phase-4 verification (after client registration ships)

After Phase 4 (push.js + App.jsx wiring) is deployed to TestFlight:

1. Open the app on a physical iPhone
2. Accept the push notification permission prompt when it appears
3. Go to Supabase → Table Editor → `push_subscriptions`
4. Verify a new row exists with:
   - `channel = 'apns'`
   - `apns_token` populated (40-byte hex string)
   - `user_id` matching your Kalin auth ID (`8171742a-b586-4f13-be61-744e191a1896`)
   - `endpoint`, `p256dh`, `auth` all NULL

---

## Step 8 — Post-Phase-5 verification (after send-push APNs branch ships)

After Phase 5 (send-push edge fn APNs path) is deployed:

1. Insert a test notification row directly in Supabase for your user:

```sql
INSERT INTO notifications (user_id, tenant_id, type, title, body, related_entity_type, related_entity_id)
VALUES (
  '8171742a-b586-4f13-be61-744e191a1896',
  '00000000-0000-0000-0000-000000000001',
  'todo_assigned',
  'Test push',
  'This is a live APNs push test',
  'todo',
  '00000000-0000-0000-0000-000000000099'
);
```

2. Watch for the push notification to arrive on your iPhone (usually within 1-5 seconds)
3. Tap the notification — verify the app opens and navigates to the correct screen (todo deep link)
4. Check Supabase → Edge Function logs for `send-push` → verify no errors

---

## Key notes

- **The `.p8` file is non-expiring** — but if you ever revoke it in Apple Developer Portal, you must generate a new one and update `APNS_AUTH_KEY` in Supabase secrets
- **One APNs auth key per Apple Developer team** — it works for all your apps, not just Avenstone
- **TestFlight always uses production APNs** — sandbox APNs is only for Xcode direct-install builds (not Codemagic)
- **Token refresh** — APNs tokens can change when iOS updates. The Capacitor plugin re-fires `registration` on token change. The Phase 4 upsert pattern handles this via the `idx_push_sub_apns_unique` partial index — same (user_id, apns_token) combination is deduplicated, and a changed token creates a new row cleanly
- **send-push cleanup on failure** — Phase 5 will delete push_subscriptions rows that return `BadDeviceToken` from APNs (the token is no longer valid). This is the stale-token cleanup path documented in PUSH_NOTIFICATIONS_ARC.md

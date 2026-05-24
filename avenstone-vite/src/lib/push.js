import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { sbUpsertPushSubscription } from './supabase';

let registered = false;
let listenersAttached = false;
let onDeepLinkCallback = null;

/**
 * Register the current user/device for push notifications.
 * Idempotent — safe to call multiple times per session. Listeners attach once.
 *
 * @param {object} opts
 * @param {string} opts.userId  - Auth/profile ID of the current user. Required.
 * @param {(deepLink: string) => void} [opts.onDeepLink] - Called when a push notification is tapped. Receives data.deep_link string.
 * @returns {Promise<{ok: boolean, channel?: 'apns'|'web'|'none', error?: string}>}
 */
export async function registerForPush({ userId, onDeepLink } = {}) {
  if (!userId) {
    return { ok: false, error: 'userId required' };
  }

  onDeepLinkCallback = onDeepLink || null;

  // Web users: no-op until Phase 6 wires Web Push.
  if (!Capacitor.isNativePlatform()) {
    return { ok: true, channel: 'none' };
  }

  if (registered) {
    return { ok: true, channel: 'apns' };
  }

  try {
    // 1. Permission gate. iOS shows the native prompt on the first request.
    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;

    if (status === 'prompt' || status === 'prompt-with-rationale') {
      const req = await PushNotifications.requestPermissions();
      status = req.receive;
    }

    if (status !== 'granted') {
      return { ok: false, channel: 'apns', error: `permission ${status}` };
    }

    // 2. Attach listeners exactly once — before register() so we don't miss the token event.
    if (!listenersAttached) {
      await PushNotifications.addListener('registration', async (token) => {
        const res = await sbUpsertPushSubscription({
          user_id: userId,
          channel: 'apns',
          apns_token: token.value,
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error('push subscription upsert failed:', res.error);
        }
      });

      await PushNotifications.addListener('registrationError', (err) => {
        // eslint-disable-next-line no-console
        console.error('push registration error:', err);
      });

      await PushNotifications.addListener('pushNotificationReceived', () => {
        // Foreground receive — Capacitor displays the notification banner by default.
        // No app-state changes needed in v1.
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const deepLink = action?.notification?.data?.deep_link;
        if (deepLink && typeof onDeepLinkCallback === 'function') {
          onDeepLinkCallback(deepLink);
        }
      });

      listenersAttached = true;
    }

    // 3. Request a device token from APNs. Fires the 'registration' listener on success.
    await PushNotifications.register();
    registered = true;

    return { ok: true, channel: 'apns' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Tear down listeners and reset registration state. Call on logout. Idempotent.
 */
export async function unregisterPushListeners() {
  if (!listenersAttached) return;
  try {
    await PushNotifications.removeAllListeners();
  } catch {
    // best effort
  }
  listenersAttached = false;
  registered = false;
  onDeepLinkCallback = null;
}

// Phone notifications for owners who installed the Pickam app (Web Push: Android, iPhone home-screen apps, desktop).
import webpush from "web-push";
import { config } from "./config.js";
import * as db from "./db.js";

let keys: { publicKey: string; privateKey: string } | null = null;

/** VAPID keys from the environment, or generated once and stored, so there's nothing to configure. */
export function vapidKeys() {
  if (keys) return keys;
  if (config.vapid.publicKey && config.vapid.privateKey) keys = { ...config.vapid };
  else {
    const stored = db.kvGet("vapid_keys");
    keys = stored ? JSON.parse(stored) : webpush.generateVAPIDKeys();
    if (!stored) db.kvSet("vapid_keys", JSON.stringify(keys));
  }
  return keys!;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url?: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
  /** Keep it on screen until tapped (used for urgent alerts). */
  urgent?: boolean;
}

/** Send to every device the owner turned notifications on for. Dead subscriptions are removed. */
export async function pushToOwner(businessId: string, msg: PushMessage): Promise<number> {
  const subs = db.listPushSubscriptions(businessId);
  if (!subs.length) return 0;
  const { publicKey, privateKey } = vapidKeys();
  const options = { vapidDetails: { subject: config.publicUrl.startsWith("https") ? config.publicUrl : "mailto:hello@pickam.ng", publicKey, privateKey }, TTL: 3600, urgency: msg.urgent ? ("high" as const) : ("normal" as const) };
  const payload = JSON.stringify({ url: "/app", ...msg });
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload, options);
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) db.deletePushSubscription(sub.endpoint);
        else console.error("[push] failed", err?.statusCode ?? err);
      }
    }),
  );
  return sent;
}

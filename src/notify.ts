import { EventEmitter } from "node:events";
import { config } from "./config.js";
import type { AlertMode, Business, Urgency } from "./db.js";

export interface OwnerAlert {
  kind: "escalation" | "order" | "call";
  urgency: Urgency;
  /** Resolved delivery mode after settings and quiet hours are applied. */
  mode: AlertMode;
  title: string;
  body: string;
  refId?: number | string;
  at: string;
}

/** Live dashboard subscribers listen on `business:<id>`. */
export const alertBus = new EventEmitter();
alertBus.setMaxListeners(0);

function lagosMinutesNow(now: Date): number {
  const [h, m] = now
    .toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour12: false, hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number);
  return h * 60 + m;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function inQuietHours(settings: Business["settings"], now = new Date()): boolean {
  if (!settings.quietHours.enabled) return false;
  const t = lagosMinutesNow(now);
  const start = toMinutes(settings.quietHours.start);
  const end = toMinutes(settings.quietHours.end);
  // Window may cross midnight (22:00 -> 07:00).
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

/** Decide how loudly to alert the owner for this urgency, honouring quiet hours. */
export function resolveAlertMode(settings: Business["settings"], urgency: Urgency, now = new Date()): AlertMode {
  const mode = settings.alerts[urgency];
  if (urgency !== "urgent" && inQuietHours(settings, now)) return "digest";
  return mode;
}

export async function sendSms(to: string, message: string): Promise<void> {
  const { username, apiKey, senderId } = config.africasTalking;
  if (!apiKey || !to) return;
  const form = new URLSearchParams({ username, to, message });
  if (senderId) form.set("from", senderId);
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const res = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw new Error(`Africa's Talking SMS failed: ${res.status} ${await res.text()}`);
}

/** Push an alert to the owner's open dashboards and, if configured, by SMS. */
export async function alertOwner(business: Business, alert: Omit<OwnerAlert, "mode" | "at">): Promise<OwnerAlert> {
  const full: OwnerAlert = { ...alert, mode: resolveAlertMode(business.settings, alert.urgency), at: new Date().toISOString() };
  alertBus.emit(`business:${business.id}`, full);
  if (full.mode !== "digest" && business.settings.smsAlerts) {
    const prefix = full.mode === "ring" ? "URGENT - " : "";
    try {
      await sendSms(business.ownerPhone, `${prefix}Pickam: ${full.title}\n${full.body}`.slice(0, 459));
    } catch (err) {
      console.error("[notify] SMS failed", err);
    }
  }
  return full;
}

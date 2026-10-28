import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { linkWhatsAppMessage, type AlertMode, type Business, type Urgency } from "./db.js";
import { sendAlertTemplate, whatsappConfigured } from "./whatsapp.js";

export interface OwnerAlert {
  kind: "escalation" | "order" | "call" | "payment" | "billing";
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

/**
 * Message the owner outside the dashboard: WhatsApp first (if on), SMS as backup.
 * `alsoSms` sends the SMS even when WhatsApp worked (used for "ring" alerts).
 * Returns the WhatsApp message id, if one was sent.
 */
export async function messageOwner(business: Business, title: string, details: string, alsoSms = false): Promise<string | null> {
  const s = business.settings;
  let waId: string | null = null;
  if (s.whatsappAlerts && whatsappConfigured() && business.ownerPhone) {
    try {
      waId = await sendAlertTemplate(business.ownerPhone, title, details);
    } catch (err) {
      console.error("[notify] WhatsApp failed", err);
    }
  }
  if (s.smsAlerts && (!waId || alsoSms)) {
    try {
      await sendSms(business.ownerPhone, `Pickam: ${title}\n${details}`.slice(0, 459));
    } catch (err) {
      console.error("[notify] SMS failed", err);
    }
  }
  return waId;
}

/** Push an alert to the owner's open dashboards and, unless it's a digest item, to WhatsApp/SMS. */
export async function alertOwner(
  business: Business,
  alert: Omit<OwnerAlert, "mode" | "at">,
  opts: { forceMode?: AlertMode; escalationId?: number } = {},
): Promise<OwnerAlert> {
  const mode = opts.forceMode ?? resolveAlertMode(business.settings, alert.urgency);
  const full: OwnerAlert = { ...alert, mode, at: new Date().toISOString() };
  alertBus.emit(`business:${business.id}`, full);
  if (mode !== "digest") {
    const title = mode === "ring" ? `URGENT - ${full.title}` : full.title;
    const waId = await messageOwner(business, title, full.body, mode === "ring");
    if (waId && opts.escalationId) linkWhatsAppMessage(waId, business.id, opts.escalationId);
  }
  return full;
}

/** Tell Pickam staff about something that needs a human (e.g. the number pool is empty). */
export async function alertAdmin(message: string) {
  console.warn(`[admin] ${message}`);
  if (config.adminPhone) await sendSms(config.adminPhone, `Pickam admin: ${message}`).catch((err) => console.error("[notify] admin SMS failed", err));
}

// WhatsApp Cloud API (Meta): alerts to owners, and receiving their replies and voice notes.
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { toWhatsAppId } from "./phone.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export const whatsappConfigured = () => !!(config.whatsapp.token && config.whatsapp.phoneNumberId);

async function send(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${GRAPH}/${config.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok || !body.messages?.[0]) throw new Error(`WhatsApp send failed: ${res.status} ${body.error?.message ?? ""}`);
  return body.messages[0].id;
}

// Template parameters may not contain newlines, tabs or more than four spaces in a row.
const templateParam = (s: string) => s.replace(/[\n\t]+/g, " · ").replace(/ {4,}/g, "   ").slice(0, 1000);

/**
 * Business-initiated messages need an approved template. The alert template has two body parameters:
 * "{{1}}" (title) and "{{2}}" (details). Returns the WhatsApp message id.
 */
export function sendAlertTemplate(toE164: string, title: string, details: string): Promise<string> {
  return send({
    to: toWhatsAppId(toE164),
    type: "template",
    template: {
      name: config.whatsapp.alertTemplate,
      language: { code: config.whatsapp.templateLanguage },
      components: [{ type: "body", parameters: [{ type: "text", text: templateParam(title) }, { type: "text", text: templateParam(details) }] }],
    },
  });
}

/** Free-form text; only allowed within 24 hours of the owner's last message to us. */
export const sendText = (toE164: string, text: string) => send({ to: toWhatsAppId(toE164), type: "text", text: { body: text.slice(0, 4096) } });

/** Download an inbound media file (e.g. a voice note). */
export async function downloadMedia(mediaId: string): Promise<{ data: Blob; mimeType: string }> {
  const auth = { Authorization: `Bearer ${config.whatsapp.token}` };
  const meta = (await (await fetch(`${GRAPH}/${mediaId}`, { headers: auth })).json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("WhatsApp media lookup failed");
  const file = await fetch(meta.url, { headers: auth });
  if (!file.ok) throw new Error(`WhatsApp media download failed: ${file.status}`);
  return { data: await file.blob(), mimeType: meta.mime_type ?? "audio/ogg" };
}

/** Meta signs webhooks with `X-Hub-Signature-256: sha256=<hmac>` using the app secret. */
export function verifyWhatsAppSignature(rawBody: string, header: string | undefined): boolean {
  if (!header || !config.whatsapp.appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", config.whatsapp.appSecret).update(rawBody).digest("hex");
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export interface InboundMessage {
  id: string;
  from: string; // E.164 with "+"
  /** WhatsApp id of the message this one replies to (swipe-reply). */
  replyTo?: string;
  text?: string;
  audioId?: string;
}

/** Flatten Meta's webhook payload into the messages we care about. */
export function parseInbound(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        out.push({
          id: m.id,
          from: `+${m.from}`,
          replyTo: m.context?.id,
          text: m.type === "text" ? m.text?.body : undefined,
          audioId: m.type === "audio" ? m.audio?.id : undefined,
        });
      }
    }
  }
  return out;
}

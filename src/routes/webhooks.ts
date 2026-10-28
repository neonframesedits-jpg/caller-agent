// Inbound webhooks: ElevenLabs (finished calls), Paystack (payments), WhatsApp (owner messages).
// All need the raw body for signature checks, so this router is mounted before the JSON parser.
import express, { Router } from "express";
import { config } from "../config.js";
import { applySuccessfulCharge, recordFinishedCall } from "../billing.js";
import { getBusinessByAgentId } from "../db.js";
import { verifyWebhookSignature } from "../elevenlabs.js";
import { alertOwner } from "../notify.js";
import { handleInboundWhatsApp } from "../owner-inbox.js";
import { verifyPaystackSignature } from "../paystack.js";
import { parseInbound, verifyWhatsAppSignature } from "../whatsapp.js";

export const webhooksRouter = Router();
const rawText = express.text({ type: "*/*", limit: "5mb" });
const raw = (body: unknown) => (typeof body === "string" ? body : "");

webhooksRouter.post("/elevenlabs/post-call", rawText, async (req, res) => {
  const body = raw(req.body);
  if (!verifyWebhookSignature(body, req.header("elevenlabs-signature"), config.elevenlabs.webhookSecret)) {
    res.status(401).json({ error: "bad signature" });
    return;
  }
  const event = JSON.parse(body);
  if (event.type !== "post_call_transcription") {
    res.json({ ignored: event.type });
    return;
  }
  const data = event.data ?? {};
  const business = getBusinessByAgentId(data.agent_id);
  if (!business) {
    res.json({ ignored: "unknown agent" });
    return;
  }
  const summary: string = data.analysis?.transcript_summary ?? "";
  const customerPhone: string = data.metadata?.phone_call?.external_number ?? "";
  await recordFinishedCall(business, {
    conversationId: data.conversation_id,
    customerPhone,
    durationSecs: Math.round(data.metadata?.call_duration_secs ?? 0),
    summary,
    transcript: (data.transcript ?? []).map((t: any) => ({ role: t.role, message: t.message, at: t.time_in_call_secs })),
    successful: data.analysis?.call_successful ?? "unknown",
  });
  void alertOwner(business, {
    kind: "call",
    urgency: "low",
    title: `Call from ${customerPhone || "unknown number"}`,
    body: summary || "No summary available.",
    refId: data.conversation_id,
  });
  res.json({ ok: true });
});

webhooksRouter.post("/paystack", rawText, async (req, res) => {
  const body = raw(req.body);
  if (!verifyPaystackSignature(body, req.header("x-paystack-signature"))) {
    res.status(401).json({ error: "bad signature" });
    return;
  }
  const event = JSON.parse(body);
  if (event.event === "charge.success" && event.data?.status === "success") {
    const result = await applySuccessfulCharge(String(event.data.reference), Number(event.data.amount));
    res.json({ result });
    return;
  }
  res.json({ ignored: event.event });
});

// Meta calls this once to verify the webhook URL.
webhooksRouter.get("/whatsapp", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && config.whatsapp.verifyToken && req.query["hub.verify_token"] === config.whatsapp.verifyToken) {
    res.send(String(req.query["hub.challenge"] ?? ""));
  } else {
    res.status(403).end();
  }
});

webhooksRouter.post("/whatsapp", rawText, (req, res) => {
  const body = raw(req.body);
  if (!verifyWhatsAppSignature(body, req.header("x-hub-signature-256"))) {
    res.status(401).end();
    return;
  }
  // Acknowledge straight away; Meta retries slow webhooks. Voice notes take a few seconds to transcribe.
  res.sendStatus(200);
  for (const msg of parseInbound(JSON.parse(body))) {
    handleInboundWhatsApp(msg).catch((err) => console.error("[whatsapp] inbound failed", err));
  }
});

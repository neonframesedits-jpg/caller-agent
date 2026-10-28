// ElevenLabs post-call webhook: stores the transcript and summary of every finished call.
import express, { Router } from "express";
import { config } from "../config.js";
import { getBusinessByAgentId, upsertCall } from "../db.js";
import { verifyWebhookSignature } from "../elevenlabs.js";
import { alertOwner } from "../notify.js";

export const webhooksRouter = Router();

webhooksRouter.post("/elevenlabs/post-call", express.text({ type: "*/*", limit: "5mb" }), (req, res) => {
  const raw = typeof req.body === "string" ? req.body : "";
  if (!verifyWebhookSignature(raw, req.header("elevenlabs-signature"), config.elevenlabs.webhookSecret)) {
    res.status(401).json({ error: "bad signature" });
    return;
  }
  const event = JSON.parse(raw);
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
  upsertCall(business.id, {
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

// Core call flow: lookups, orders, escalations, learning, post-call webhook.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createBusiness, setAgentId, setBusinessFields, type Business } from "../src/db.js";
import { alertBus, type OwnerAlert } from "../src/notify.js";
import { client, settle, signElevenLabs, startTestServer, stopTestServer } from "./helpers.js";

let server: Server;
let base: string;
let biz: Business;
let owner: ReturnType<typeof client>;
const alerts: OwnerAlert[] = [];

before(async () => {
  ({ server, base } = await startTestServer());
  biz = createBusiness({ name: "Mama Tee's Kitchen", ownerPhone: "+2348000000000" });
  setAgentId(biz.id, "agent_123");
  setBusinessFields(biz.id, { onboarded: 1 });
  alertBus.on(`business:${biz.id}`, (a: OwnerAlert) => alerts.push(a));
  owner = client(base);
  owner.setToken(biz.ownerToken);
});

after(() => stopTestServer(server));

const tool = (path: string, body: unknown, secret = biz.toolSecret) =>
  client(base).req(`/tools/${biz.id}/${path}`, "POST", body, { "x-tool-secret": secret });

test("owner endpoints require a valid token", async () => {
  assert.equal((await client(base).req("/api/business")).status, 401);
  assert.equal((await owner.req("/api/business")).status, 200);
});

test("tool endpoints require the tool secret", async () => {
  assert.equal((await tool("business-info", { question: "hi" }, "wrong")).status, 401);
});

test("full call flow: lookup, order, escalate, owner answers, AI learns", async () => {
  await owner.req("/api/products", "POST", { name: "Jollof Rice and Chicken", priceNaira: 3500 });
  const fried = (await owner.req("/api/products", "POST", { name: "Fried Rice", priceNaira: 3000 })).body;
  await owner.req(`/api/products/${fried.id}`, "PATCH", { available: false });
  await owner.req("/api/faqs", "POST", { question: "Do you deliver to Lekki?", answer: "Yes, ₦2,500 to Lekki." });

  const info = (await tool("business-info", { question: "una dey deliver to Lekki?" })).body;
  assert.equal(info.answers[0].answer, "Yes, ₦2,500 to Lekki.");
  assert.equal(info.menu.find((m: any) => m.name === "Fried Rice").available_today, false);

  const soldOut = (await tool("order", { customer_name: "Chidi", items: [{ name: "fried rice", quantity: 1 }], delivery_address: "Yaba" })).body;
  assert.equal(soldOut.ok, false);

  const order = (
    await tool("order", {
      customer_name: "Chidi",
      items: [{ name: "jollof rice", quantity: 2 }],
      delivery_address: "12 Herbert Macaulay Way, Yaba",
      caller_phone: "+2348011111111",
      conversation_id: "{{system__conversation_id}}",
    })
  ).body;
  assert.equal(order.ok, true);
  assert.equal(order.total, "₦7,000");
  await settle();
  assert.equal(alerts.at(-1)?.kind, "order");

  const unknown = (await tool("business-info", { question: "do you cater for weddings of 300 guests?" })).body;
  assert.equal(unknown.answers.length, 0);

  const escalated = (
    await tool("escalate", { question: "Do you cater for weddings of 300 guests?", summary: "Wedding on Saturday", urgency: "urgent", customer_name: "Ngozi", caller_phone: "+2348022222222" })
  ).body;
  assert.match(escalated.say_to_caller, /within 10 minutes/);
  await settle();
  assert.equal(alerts.at(-1)?.mode, "ring");

  const [esc] = (await owner.req("/api/escalations?status=open")).body;
  assert.equal(esc.customer_phone, "+2348022222222");
  const resolved = (
    await owner.req(`/api/escalations/${esc.id}`, "PATCH", { status: "resolved", ownerAnswer: "Yes, we cater for events up to 500 guests. Call for a quote.", saveAsFaq: true })
  ).body;
  assert.equal(resolved.escalation.status, "resolved");

  const learned = (await tool("business-info", { question: "can you cater for a wedding?" })).body;
  assert.match(learned.answers[0].answer, /events up to 500 guests/);
});

test("post-call webhook stores the call and counts minutes", async () => {
  const body = JSON.stringify({
    type: "post_call_transcription",
    data: {
      agent_id: "agent_123",
      conversation_id: "conv_1",
      transcript: [{ role: "user", message: "I want jollof", time_in_call_secs: 2 }],
      metadata: { call_duration_secs: 95, phone_call: { external_number: "+2348011111111" } },
      analysis: { transcript_summary: "Chidi ordered 2 jollof.", call_successful: "success" },
    },
  });
  const anon = client(base);
  assert.equal((await anon.req("/webhooks/elevenlabs/post-call", "POST", body, { "elevenlabs-signature": "t=1,v0=bad" })).status, 401);
  assert.equal((await anon.req("/webhooks/elevenlabs/post-call", "POST", body, { "elevenlabs-signature": signElevenLabs(body) })).status, 200);

  const calls = (await owner.req("/api/calls")).body;
  assert.equal(calls[0].summary, "Chidi ordered 2 jollof.");
  const { usage } = (await owner.req("/api/business")).body;
  assert.equal(usage.minutesUsed, 2);
});

test("settings validation rejects bad input", async () => {
  assert.equal((await owner.req("/api/business", "PUT", { settings: { callbackMinutes: -5 } })).status, 400);
});

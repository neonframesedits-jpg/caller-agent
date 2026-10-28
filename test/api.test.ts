import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { config } from "../src/config.js";
import { createBusiness, openDb, setAgentId, type Business } from "../src/db.js";
import { alertBus, type OwnerAlert } from "../src/notify.js";
import { createApp } from "../src/server.js";

let server: Server;
let base: string;
let biz: Business;
const alerts: OwnerAlert[] = [];

before(async () => {
  openDb(":memory:");
  config.africasTalking.apiKey = ""; // never send real SMS from tests
  config.elevenlabs.webhookSecret = "whsec";
  biz = createBusiness({ name: "Mama Tee's Kitchen", ownerPhone: "+2348000000000" });
  setAgentId(biz.id, "agent_123");
  alertBus.on(`business:${biz.id}`, (a: OwnerAlert) => alerts.push(a));
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => server.close());

const owner = (path: string, method = "GET", body?: unknown) =>
  fetch(base + path, { method, headers: { Authorization: `Bearer ${biz.ownerToken}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
const tool = (path: string, body: unknown, secret = biz.toolSecret) =>
  fetch(`${base}/tools/${biz.id}/${path}`, { method: "POST", headers: { "x-tool-secret": secret, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("owner endpoints require a valid token", async () => {
  assert.equal((await fetch(`${base}/api/business`)).status, 401);
  assert.equal((await owner("/api/business")).status, 200);
});

test("tool endpoints require the tool secret", async () => {
  assert.equal((await tool("business-info", { question: "hi" }, "wrong")).status, 401);
});

test("full call flow: lookup, order, escalate, owner answers, AI learns", async () => {
  await owner("/api/products", "POST", { name: "Jollof Rice and Chicken", priceNaira: 3500 });
  const fried = await (await owner("/api/products", "POST", { name: "Fried Rice", priceNaira: 3000 })).json();
  await owner(`/api/products/${fried.id}`, "PATCH", { available: false });
  await owner("/api/faqs", "POST", { question: "Do you deliver to Lekki?", answer: "Yes, ₦2,500 to Lekki." });

  const info = await (await tool("business-info", { question: "una dey deliver to Lekki?" })).json();
  assert.equal(info.answers[0].answer, "Yes, ₦2,500 to Lekki.");
  assert.equal(info.menu.find((m: any) => m.name === "Fried Rice").available_today, false);

  const soldOut = await (await tool("order", { customer_name: "Chidi", items: [{ name: "fried rice", quantity: 1 }], delivery_address: "Yaba" })).json();
  assert.equal(soldOut.ok, false);

  const order = await (
    await tool("order", {
      customer_name: "Chidi",
      items: [{ name: "jollof rice", quantity: 2 }],
      delivery_address: "12 Herbert Macaulay Way, Yaba",
      caller_phone: "+2348011111111",
      conversation_id: "{{system__conversation_id}}",
    })
  ).json();
  assert.equal(order.ok, true);
  assert.equal(order.total, "₦7,000");
  assert.equal(alerts.at(-1)?.kind, "order");

  const unknown = await (await tool("business-info", { question: "do you cater for weddings of 300 guests?" })).json();
  assert.equal(unknown.answers.length, 0);

  const escalated = await (
    await tool("escalate", { question: "Do you cater for weddings of 300 guests?", summary: "Wedding on Saturday", urgency: "urgent", customer_name: "Ngozi", caller_phone: "+2348022222222" })
  ).json();
  assert.match(escalated.say_to_caller, /within 10 minutes/);
  assert.equal(alerts.at(-1)?.mode, "ring");

  const [esc] = await (await owner("/api/escalations?status=open")).json();
  assert.equal(esc.customer_phone, "+2348022222222");
  const resolved = await (await owner(`/api/escalations/${esc.id}`, "PATCH", { status: "resolved", ownerAnswer: "Yes, we cater for events up to 500 guests. Call for a quote.", saveAsFaq: true })).json();
  assert.equal(resolved.status, "resolved");

  const learned = await (await tool("business-info", { question: "can you cater for a wedding?" })).json();
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
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex");
  const bad = await fetch(`${base}/webhooks/elevenlabs/post-call`, { method: "POST", headers: { "elevenlabs-signature": `t=${t},v0=bad` }, body });
  assert.equal(bad.status, 401);
  const res = await fetch(`${base}/webhooks/elevenlabs/post-call`, { method: "POST", headers: { "Content-Type": "application/json", "elevenlabs-signature": `t=${t},v0=${sig}` }, body });
  assert.equal(res.status, 200);

  const calls = await (await owner("/api/calls")).json();
  assert.equal(calls[0].summary, "Chidi ordered 2 jollof.");
  const { usage } = await (await owner("/api/business")).json();
  assert.equal(usage.minutesUsed, 2);
});

test("settings validation rejects bad input", async () => {
  const res = await owner("/api/business", "PUT", { settings: { callbackMinutes: -5 } });
  assert.equal(res.status, 400);
});

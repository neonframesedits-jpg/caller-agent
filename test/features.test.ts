// Signup, billing, number provisioning, payment links, AI callbacks, WhatsApp inbox and background jobs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import * as db from "../src/db.js";
import { chaseOverdueCallbacks, sendDailySummaries } from "../src/scheduler.js";
import { callsTo, client, mock, settle, signElevenLabs, signPaystack, signWhatsApp, smsTo, startTestServer, stopTestServer } from "./helpers.js";

let server: Server;
let base: string;
let owner: ReturnType<typeof client>;
let biz: db.Business;
const OWNER = "+2348031234567";

before(async () => {
  ({ server, base } = await startTestServer());
  owner = client(base);
});
after(() => stopTestServer(server));

const fresh = () => db.getBusiness(biz.id)!;
const tool = (path: string, body: unknown) => client(base).req(`/tools/${biz.id}/${path}`, "POST", body, { "x-tool-secret": biz.toolSecret });
const paystackWebhook = (reference: string, amountNaira: number) => {
  const body = JSON.stringify({ event: "charge.success", data: { status: "success", reference, amount: amountNaira * 100 } });
  return client(base).req("/webhooks/paystack", "POST", body, { "x-paystack-signature": signPaystack(body) });
};
const whatsapp = (message: Record<string, unknown>) => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: `in.${Math.random()}`, from: OWNER.slice(1), ...message }] } }] }] });
  return client(base).req("/webhooks/whatsapp", "POST", body, { "x-hub-signature-256": signWhatsApp(body) });
};
const lastWhatsAppTextTo = (phone: string) =>
  callsTo(/wa-phone\/messages/)
    .filter((c) => c.body.to === phone.slice(1) && c.body.type === "text")
    .at(-1)?.body.text.body as string;
const postCall = (conversationId: string, secs: number) => {
  const body = JSON.stringify({
    type: "post_call_transcription",
    data: { agent_id: fresh().agentId, conversation_id: conversationId, transcript: [], metadata: { call_duration_secs: secs, phone_call: { external_number: "+2348099999999" } }, analysis: {} },
  });
  return client(base).req("/webhooks/elevenlabs/post-call", "POST", body, { "elevenlabs-signature": signElevenLabs(body) });
};

test("1. phone login: code by SMS, wrong code rejected, new business created", async () => {
  assert.equal((await owner.req("/auth/code", "POST", { phone: "12345" })).status, 400);
  const sent = await owner.req("/auth/code", "POST", { phone: "0803 123 4567" });
  assert.equal(sent.body.phone, OWNER);
  const code = smsTo(OWNER).at(-1)!.match(/\d{6}/)![0];
  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal((await owner.req("/auth/verify", "POST", { phone: OWNER, code: wrong })).status, 400);
  const ok = await owner.req("/auth/verify", "POST", { phone: "08031234567", code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.isNew, true);
  owner.setToken(ok.body.token);
  // A code can only be used once.
  assert.equal((await owner.req("/auth/verify", "POST", { phone: OWNER, code })).status, 400);

  const me = (await owner.req("/api/business")).body;
  assert.equal(me.business.ownerPhone, OWNER);
  assert.equal(me.business.onboarded, false);
  assert.equal(me.usage.plan.id, "trial");
  assert.equal(me.usage.mode, "full");
  biz = db.getBusiness(me.business.id)!;
});

test("1. login codes are rate limited", async () => {
  for (let i = 0; i < 4; i++) await owner.req("/auth/code", "POST", { phone: "08050000000" });
  assert.equal((await owner.req("/auth/code", "POST", { phone: "08050000000" })).status, 200);
  assert.equal((await owner.req("/auth/code", "POST", { phone: "08050000000" })).status, 429);
});

test("5. onboarding gives the business a number routed to its agent", async () => {
  // Pool is empty: owner gets a friendly error and Pickam staff are told.
  await owner.req("/api/business", "PUT", { profile: { name: "Mama Tee's Kitchen", ownerName: "Titi" } });
  const empty = await owner.req("/api/onboarding/complete", "POST");
  assert.equal(empty.status, 503);

  const admin = client(base);
  assert.equal((await admin.req("/admin/numbers", "POST", { number: "02017001111" })).status, 401);
  const added = await admin.req("/admin/numbers", "POST", { number: "02017001111" }, { "x-admin-key": "admin" });
  assert.equal(added.body.number, "+2342017001111");

  const done = await owner.req("/api/onboarding/complete", "POST");
  assert.equal(done.status, 200);
  assert.equal(done.body.number, "+2342017001111");
  assert.equal(done.body.forwardingCodes.find((c: any) => c.code.startsWith("**004")).code, "**004*02017001111#");
  biz = fresh();
  assert.equal(biz.agentId, "agent_test");
  assert.equal(biz.onboarded, true);
  const assign = callsTo(/convai\/phone-numbers\/pn_/).at(-1)!;
  assert.equal(assign.method, "PATCH");
  assert.equal(assign.body.agent_id, "agent_test");
});

test("2. billing: plan purchase via Paystack, idempotent webhook", async () => {
  const checkout = await owner.req("/api/billing/checkout", "POST", { plan: "starter" });
  assert.match(checkout.body.url, /checkout\.paystack\.com/);
  assert.equal(callsTo(/transaction\/initialize/).at(-1)!.body.amount, 2_000_000);
  assert.equal((await owner.req("/api/billing/checkout", "POST", { plan: "trial" })).status, 400);

  const bad = await client(base).req("/webhooks/paystack", "POST", "{}", { "x-paystack-signature": "nope" });
  assert.equal(bad.status, 401);
  assert.equal((await paystackWebhook(checkout.body.reference, 1000)).body.result, "amount too low");
  assert.equal((await paystackWebhook(checkout.body.reference, 20_000)).body.result, "ok");
  assert.equal((await paystackWebhook(checkout.body.reference, 20_000)).body.result, "already processed");
  assert.equal(fresh().plan, "starter");
});

test("2. billing: minutes run out, wallet pays, then the AI drops to message-only", async () => {
  const wallet = await owner.req("/api/billing/checkout", "POST", { walletAmountNaira: 1000 });
  await paystackWebhook(wallet.body.reference, 1000);
  assert.equal(fresh().walletNaira, 1000);

  await postCall("c_big", 59 * 60); // 59 of 60 plan minutes
  await postCall("c_over", 4 * 60); // 1 in plan + 3 over at ₦300 = ₦900
  assert.equal(fresh().walletNaira, 100);
  let usage = (await owner.req("/api/business")).body.usage;
  assert.equal(usage.mode, "message_only");

  const info = (await tool("business-info", { question: "how much is jollof" })).body;
  assert.equal(info.service_mode, "message_only");
  const order = (await tool("order", { customer_name: "A", items: [{ name: "x", quantity: 1 }], delivery_address: "y" })).body;
  assert.equal(order.ok, false);
  await settle();
  assert.ok(callsTo(/wa-phone\/messages/).some((c) => JSON.stringify(c.body).includes("only taking messages")));

  // Top up restores full service.
  const topup = await owner.req("/api/billing/checkout", "POST", { walletAmountNaira: 5000 });
  await paystackWebhook(topup.body.reference, 5000);
  usage = (await owner.req("/api/business")).body.usage;
  assert.equal(usage.mode, "full");
  assert.equal(usage.walletMinutes, 17);
  const ledger = (await owner.req("/api/billing/ledger")).body;
  assert.ok(ledger.some((l: any) => l.amount_naira === -900));
});

test("7. payment link during the call, paid via Paystack", async () => {
  mock(/bank\/resolve/, () => ({ status: true, data: { account_name: "TITILAYO ADEBAYO", account_number: "0123456789" } }));
  mock(/api\.paystack\.co\/subaccount/, () => ({ status: true, data: { subaccount_code: "ACCT_123" } }));
  const payout = await owner.req("/api/payouts", "POST", { bankCode: "058", accountNumber: "0123456789" });
  assert.equal(payout.body.accountName, "TITILAYO ADEBAYO");

  await owner.req("/api/products", "POST", { name: "Jollof Rice", priceNaira: 3500 });
  const order = (await tool("order", { customer_name: "Chidi", items: [{ name: "jollof", quantity: 2 }], delivery_address: "Yaba", caller_phone: "+2348011111111" })).body;
  assert.equal(order.ok, true);
  assert.match(order.payment, /payment link/);
  await settle();
  const init = callsTo(/transaction\/initialize/).at(-1)!;
  assert.equal(init.body.subaccount, "ACCT_123");
  assert.equal(init.body.amount, 700_000);
  assert.match(smsTo("+2348011111111").at(-1)!, /pay ₦7,000 for order #\d+ here: https:\/\/checkout/);

  await paystackWebhook(init.body.reference, 7000);
  const [o] = (await owner.req("/api/orders")).body;
  assert.equal(o.payment_status, "paid");
});

test("6. answering a callback makes the AI phone the customer", async () => {
  const esc = (await tool("escalate", { question: "Do you do small chops for 100 people?", summary: "", urgency: "normal", customer_name: "Ngozi", caller_phone: "+2348022222222" })).body;
  assert.equal(esc.ok, true);
  const [open] = (await owner.req("/api/escalations?status=open")).body;
  const r = (await owner.req(`/api/escalations/${open.id}`, "PATCH", { status: "resolved", ownerAnswer: "Yes, ₦150,000 for 100 packs.", saveAsFaq: true, callBack: true })).body;
  assert.equal(r.callback, "calling");
  const call = callsTo(/outbound-call/).at(-1)!.body;
  assert.equal(call.to_number, "+2348022222222");
  assert.equal(call.agent_phone_number_id, "pn_+2342017001111");
  assert.equal(call.conversation_initiation_client_data.dynamic_variables.call_purpose, "owner_callback");
  assert.equal(call.conversation_initiation_client_data.dynamic_variables.owner_answer, "Yes, ₦150,000 for 100 packs.");
  assert.match(call.conversation_initiation_client_data.conversation_config_override.agent.first_message, /Hello Ngozi, this is Ada from Mama Tee's Kitchen/);
});

test("4 + 8. WhatsApp: alerts go to WhatsApp; owner answers by swipe-reply, #id, menu commands and voice notes", async () => {
  await tool("escalate", { question: "Do you open on Sunday?", summary: "", urgency: "normal", customer_name: "Bola", caller_phone: "+2348033333333" });
  await settle();
  const alert = callsTo(/wa-phone\/messages/).filter((c) => c.body.type === "template").at(-1)!;
  assert.equal(alert.body.to, OWNER.slice(1));
  const alertText = JSON.stringify(alert.body.template.components);
  assert.match(alertText, /Do you open on Sunday/);
  assert.doesNotMatch(alertText, /\n/);
  const alertId = `wamid.${callsTo(/./).indexOf(alert) + 1}`;

  // Bad signature is rejected; Meta URL verification works.
  assert.equal((await client(base).req("/webhooks/whatsapp", "POST", "{}", { "x-hub-signature-256": "sha256=bad" })).status, 401);
  const verify = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=42`);
  assert.equal(await verify.text(), "42");

  // Swipe-reply to the alert.
  await whatsapp({ type: "text", text: { body: "No, we rest on Sundays." }, context: { id: alertId } });
  await settle();
  assert.match(lastWhatsAppTextTo(OWNER), /Saved your answer to "Do you open on Sunday\?"/);
  assert.equal(callsTo(/outbound-call/).at(-1)!.body.to_number, "+2348033333333");

  // "#id answer"
  await tool("escalate", { question: "Do you sell zobo?", summary: "", urgency: "low", customer_name: "", caller_phone: "+2348044444444" });
  const [zobo] = (await owner.req("/api/escalations?status=open")).body;
  await whatsapp({ type: "text", text: { body: `#${zobo.id} Yes, ₦500 per bottle` } });
  await settle();
  assert.equal(db.getEscalation(biz.id, zobo.id)!.owner_answer, "Yes, ₦500 per bottle");

  // Menu command.
  await whatsapp({ type: "text", text: { body: "sold out jollof" } });
  await settle();
  assert.equal(db.listProducts(biz.id).find((p) => p.name === "Jollof Rice")!.available, false);
  assert.match(lastWhatsAppTextTo(OWNER), /Jollof Rice marked sold out/);

  // Voice note becomes a note Ada can use.
  mock(/graph\.facebook\.com\/v21\.0\/media123$/, () => ({ url: "https://lookaside.fbsbx.com/media123", mime_type: "audio/ogg" }));
  mock(/lookaside\.fbsbx\.com/, () => new Response(new Uint8Array([1, 2, 3])));
  mock(/speech-to-text/, () => ({ text: "We no dey deliver on Sundays, only Monday to Saturday." }));
  await whatsapp({ type: "audio", audio: { id: "media123" } });
  await settle();
  assert.match(lastWhatsAppTextTo(OWNER), /I heard: "We no dey deliver on Sundays/);
  const info = (await tool("business-info", { question: "una dey deliver on Sunday?" })).body;
  assert.match(info.answers.map((a: any) => a.owner_note ?? a.answer).join(" "), /Monday to Saturday/);

  // Strangers get a polite reply and nothing changes.
  const before = db.listFaqs(biz.id).length;
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "x", from: "2348077777777", type: "text", text: { body: "hello" } }] } }] }] });
  await client(base).req("/webhooks/whatsapp", "POST", body, { "x-hub-signature-256": signWhatsApp(body) });
  await settle();
  assert.equal(db.listFaqs(biz.id).length, before);
});

test("3. overdue callbacks re-alert the owner once and apologise to the customer", async () => {
  await tool("escalate", { question: "Can you deliver to Ikorodu today?", summary: "", urgency: "normal", customer_name: "Emeka", caller_phone: "+2348055555555" });
  const [esc] = (await owner.req("/api/escalations?status=open")).body;
  const smsBefore = smsTo(OWNER).length;
  await chaseOverdueCallbacks(new Date(Date.now() + 5 * 60_000));
  assert.equal(db.getEscalation(biz.id, esc.id)!.reminded_at, null, "not overdue yet");

  await chaseOverdueCallbacks(new Date(Date.now() + 11 * 60_000));
  assert.ok(db.getEscalation(biz.id, esc.id)!.reminded_at);
  assert.match(smsTo("+2348055555555").at(-1)!, /sorry for the delay! Titi will call you back/);
  assert.equal(smsTo(OWNER).length, smsBefore + 1, "ring alerts also go by SMS");

  await chaseOverdueCallbacks(new Date(Date.now() + 20 * 60_000));
  assert.equal(smsTo("+2348055555555").length, 1, "only chased once");
});

test("9. daily summary goes out once, after the chosen time", async () => {
  const sentBefore = callsTo(/wa-phone\/messages/).length;
  // 07:00 Lagos: too early.
  await sendDailySummaries(new Date("2030-01-02T06:00:00Z"));
  assert.equal(callsTo(/wa-phone\/messages/).length, sentBefore);
  // Pending callbacks exist, so there is something to report at 08:30 Lagos.
  await sendDailySummaries(new Date("2030-01-02T07:30:00Z"));
  await sendDailySummaries(new Date("2030-01-02T07:45:00Z"));
  const sent = callsTo(/wa-phone\/messages/).slice(sentBefore);
  assert.equal(sent.length, 1);
  assert.match(JSON.stringify(sent[0].body), /Daily summary for Mama Tee's Kitchen/);
  assert.match(JSON.stringify(sent[0].body), /callbacks? pending/);
});

test("logout ends the session", async () => {
  assert.equal((await owner.req("/api/logout", "POST")).status, 204);
  assert.equal((await owner.req("/api/business")).status, 401);
});

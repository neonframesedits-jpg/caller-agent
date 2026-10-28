import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { matchProduct, searchFaqs } from "../src/knowledge.js";
import { inQuietHours, resolveAlertMode } from "../src/notify.js";
import { buildSystemPrompt, buildTools, verifyWebhookSignature } from "../src/elevenlabs.js";
import { defaultSettings, type Business } from "../src/db.js";
import { usageSummary } from "../src/plans.js";

const faqs = [
  { id: 1, question: "Do you deliver to Lekki?", answer: "Yes, Lekki delivery is ₦2,500.", source: "owner" as const },
  { id: 2, question: "What time do you open?", answer: "We open 9am to 8pm, Monday to Saturday.", source: "owner" as const },
  { id: 3, question: "Can I pay on delivery?", answer: "No, payment is by transfer before dispatch.", source: "owner" as const },
];

test("searchFaqs finds the right answer for differently-worded questions", () => {
  assert.equal(searchFaqs(faqs, "abeg una dey deliver for Lekki?")[0]?.id, 1);
  assert.equal(searchFaqs(faqs, "can I pay when it is delivered")[0]?.id, 3);
  assert.equal(searchFaqs(faqs, "do you sell shawarma").length, 0);
});

test("matchProduct maps spoken items to menu items", () => {
  const products = [
    { id: 1, name: "Jollof Rice and Chicken", priceNaira: 3500, description: "", available: true },
    { id: 2, name: "Fried Rice", priceNaira: 3000, description: "", available: true },
  ];
  assert.equal(matchProduct(products, "two plates of jollof rice")?.id, 1);
  assert.equal(matchProduct(products, "fried rice")?.id, 2);
  assert.equal(matchProduct(products, "amala"), null);
});

test("quiet hours across midnight downgrade non-urgent alerts to digest", () => {
  const s = { ...defaultSettings("X"), quietHours: { enabled: true, start: "22:00", end: "07:00" } };
  const lagos11pm = new Date("2026-10-28T22:00:00Z"); // 23:00 in Lagos (UTC+1)
  const lagosNoon = new Date("2026-10-28T11:00:00Z");
  assert.equal(inQuietHours(s, lagos11pm), true);
  assert.equal(inQuietHours(s, lagosNoon), false);
  assert.equal(resolveAlertMode(s, "normal", lagos11pm), "digest");
  assert.equal(resolveAlertMode(s, "urgent", lagos11pm), "ring");
  assert.equal(resolveAlertMode(s, "normal", lagosNoon), "notify");
});

test("webhook signature verification", () => {
  const body = '{"type":"post_call_transcription"}';
  const t = 1_800_000_000;
  const sig = createHmac("sha256", "secret").update(`${t}.${body}`).digest("hex");
  assert.equal(verifyWebhookSignature(body, `t=${t},v0=${sig}`, "secret", 1800, t * 1000), true);
  assert.equal(verifyWebhookSignature(body + " ", `t=${t},v0=${sig}`, "secret", 1800, t * 1000), false);
  assert.equal(verifyWebhookSignature(body, `t=${t},v0=${sig}`, "secret", 1800, (t + 3600) * 1000), false);
  assert.equal(verifyWebhookSignature(body, undefined, "secret"), false);
});

test("agent prompt and tools reflect settings", () => {
  const b = { id: "b1", name: "Mama Tee's Kitchen", description: "", category: "", location: "Surulere", openingHours: "", deliveryInfo: "", toolSecret: "s", settings: defaultSettings("Mama Tee's Kitchen") } as Business;
  const prompt = buildSystemPrompt(b);
  assert.match(prompt, /You are Ada/);
  assert.match(prompt, /within 10 minutes/);
  assert.match(prompt, /Location: Surulere/);
  assert.deepEqual(buildTools(b).map((t) => t.name), ["get_business_info", "escalate_to_owner", "place_order"]);
  b.settings.takeOrders = false;
  assert.deepEqual(buildTools(b).map((t) => t.name), ["get_business_info", "escalate_to_owner"]);
});

test("usage summary bills overage minutes", () => {
  const u = usageSummary("starter", 75);
  assert.equal(u.overageMinutes, 15);
  assert.equal(u.estimatedBillNaira, 20_000 + 15 * 300);
});

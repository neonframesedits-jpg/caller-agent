// Landing page, waitlist and dashboard routes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { config } from "../src/config.js";
import { client, startTestServer, stopTestServer } from "./helpers.js";

let server: Server;
let base: string;

before(async () => {
  ({ server, base } = await startTestServer());
});
after(() => stopTestServer(server));

test("landing page at /, dashboard at /app", async () => {
  const landing = await (await fetch(`${base}/`)).text();
  assert.match(landing, /Ada picks am/);
  const app = await (await fetch(`${base}/app`)).text();
  assert.match(app, /Pickam Dashboard/);
});

test("waitlist: join, keeps first spot on repeat, tracks source and referrals", async () => {
  const anon = client(base);
  const first = await anon.req("/waitlist", "POST", { name: "Titi", businessName: "Mama Tee's Kitchen", phone: "0803 123 4567", category: "Food & catering", source: "TikTok" });
  assert.equal(first.status, 201);
  assert.equal(first.body.position, 1);
  assert.match(first.body.shareUrl, /\?ref=friend&by=1$/);

  const again = await anon.req("/waitlist", "POST", { name: "Titi A", businessName: "Mama Tee's", phone: "+2348031234567" });
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyJoined, true);
  assert.equal(again.body.position, 1);

  const friend = await anon.req("/waitlist", "POST", { name: "Kemi", businessName: "Kemi's Closet", phone: "08151112222", source: "friend", referredBy: first.body.id });
  assert.equal(friend.body.position, 2);
  const bogusRef = await anon.req("/waitlist", "POST", { name: "Chuks", businessName: "Chuks Gadgets", phone: "09061234567", referredBy: 999 });
  assert.equal(bogusRef.status, 201);

  assert.equal((await anon.req("/waitlist", "POST", { name: "X", businessName: "Y", phone: "123" })).status, 400);
  assert.equal((await anon.req("/waitlist", "POST", { name: "", businessName: "Y", phone: "08030000000" })).status, 400);

  assert.equal((await anon.req("/admin/waitlist")).status, 401);
  const rows = (await anon.req("/admin/waitlist", "GET", undefined, { "x-admin-key": "admin" })).body;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].source, "tiktok");
  assert.equal(rows[0].referrals, 1);
  assert.equal(rows[2].referred_by, null);

  const csv = await (await fetch(`${base}/admin/waitlist?format=csv&key=admin`)).text();
  assert.match(csv.split("\n")[1], /"Titi","Mama Tee's Kitchen","\+2348031234567"/);
});

test("waitlist: honeypot silently drops bots", async () => {
  const before = (await client(base).req("/public-config")).body.waitlistCount;
  const bot = await client(base).req("/waitlist", "POST", { name: "Bot", businessName: "Spam", phone: "08099999999", website: "http://spam" });
  assert.equal(bot.status, 200);
  assert.equal((await client(base).req("/public-config")).body.waitlistCount, before);
});

test("waitlist: per-IP rate limit", async () => {
  const anon = client(base);
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await anon.req("/waitlist", "POST", { name: "N", businessName: "B", phone: `0807000000${i % 10}` })).status;
  assert.equal(last, 429);
});

test("public config reflects SIGNUPS_OPEN", async () => {
  assert.equal((await client(base).req("/public-config")).body.signupsOpen, false);
  config.signupsOpen = true;
  assert.equal((await client(base).req("/public-config")).body.signupsOpen, true);
  config.signupsOpen = false;
});

test("live demo: agent is created once with auth on, calls are capped per visitor and per day", async () => {
  const { ensureDemoAgent, buildDemoAgentConfig } = await import("../src/demo.js");
  const { mock, callsTo } = await import("./helpers.js");
  mock(/convai\/conversation\/get-signed-url/, () => ({ signed_url: "wss://api.elevenlabs.io/demo-signed" }));

  assert.equal((await client(base).req("/public-config")).body.demoAvailable, false);
  assert.equal((await client(base).req("/demo/session", "POST")).status, 503);

  const id = await ensureDemoAgent();
  assert.equal(id, "agent_test");
  const created = callsTo(/agents\/create/).at(-1)!.body;
  assert.equal(created.platform_settings.auth.enable_auth, true);
  assert.equal(created.conversation_config.conversation.max_duration_seconds, 120);
  assert.match(created.conversation_config.agent.prompt.prompt, /LIVE DEMO of Pickam/);
  assert.equal("llm" in created.conversation_config.agent.prompt, false, "no LLM set = ElevenLabs default");
  // Second start-up updates the same agent instead of creating another.
  await ensureDemoAgent();
  assert.equal(callsTo(/agents\/create/).length, 1);
  assert.equal(callsTo(/agents\/agent_test$/).at(-1)!.method, "PATCH");
  assert.ok(buildDemoAgentConfig().name.includes("demo"));
  // If someone deletes the agent in ElevenLabs, the next start-up recreates it.
  mock(/agents\/agent_test$/, () => new Response("not found", { status: 404 }));
  mock(/agents\/create/, () => ({ agent_id: "agent_new" }));
  assert.equal(await ensureDemoAgent(), "agent_new");

  assert.equal((await client(base).req("/public-config")).body.demoAvailable, true);
  const first = await client(base).req("/demo/session", "POST");
  assert.equal(first.status, 200);
  assert.equal(first.body.signedUrl, "wss://api.elevenlabs.io/demo-signed");
  await client(base).req("/demo/session", "POST");
  await client(base).req("/demo/session", "POST");
  const fourth = await client(base).req("/demo/session", "POST");
  assert.equal(fourth.status, 429, "3 demo calls per visitor per hour");
});

test("live demo: daily cap", async () => {
  const { startDemoCall, demoCallsToday } = await import("../src/demo.js");
  config.demo.dailyCallLimit = demoCallsToday() + 1;
  await startDemoCall("visitor-a");
  await assert.rejects(startDemoCall("visitor-b"), /needs a rest/);
  config.demo.dailyCallLimit = 50;
});

// Email login (Brevo), email alerts, Ada's lines from POOL_NUMBERS, and upgrading old databases.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../src/config.js";
import * as db from "../src/db.js";
import { client, emailsTo, callsTo, settle, startTestServer, stopTestServer } from "./helpers.js";

let server: Server;
let base: string;
const owner = () => client(base);

before(async () => {
  ({ server, base } = await startTestServer());
});
after(() => stopTestServer(server));

test("login methods reflect what's configured", async () => {
  assert.deepEqual((await owner().req("/auth/methods")).body, { sms: true, email: true });
});

test("email login: code by email, new account, then business phone is required before connecting", async () => {
  const c = owner();
  assert.equal((await c.req("/auth/code", "POST", { email: "not-an-email" })).status, 400);
  const sent = await c.req("/auth/code", "POST", { email: "  Titi@Example.com " });
  assert.equal(sent.body.email, "titi@example.com");
  const mail = emailsTo("titi@example.com").at(-1)!;
  const code = mail.subject.match(/\d{6}/)![0];
  assert.match(mail.textContent, new RegExp(code));

  const ok = await c.req("/auth/verify", "POST", { email: "titi@example.com", code });
  assert.equal(ok.body.isNew, true);
  c.setToken(ok.body.token);
  const me = (await c.req("/api/business")).body.business;
  assert.equal(me.ownerEmail, "titi@example.com");
  assert.equal(me.ownerPhone, "");

  await c.req("/api/business", "PUT", { profile: { name: "Mama Tee's Kitchen" } });
  const blocked = await c.req("/api/onboarding/complete", "POST");
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /phone number/);

  assert.equal((await c.req("/api/business", "PUT", { contact: { ownerPhone: "123" } })).status, 400);
  await c.req("/api/business", "PUT", { contact: { ownerPhone: "0803 999 0000" } });
  assert.equal((await c.req("/api/business")).body.business.ownerPhone, "+2348039990000");
  // Once set, it can't be swapped through this endpoint.
  await c.req("/api/business", "PUT", { contact: { ownerPhone: "08031111111" } });
  assert.equal((await c.req("/api/business")).body.business.ownerPhone, "+2348039990000");

  // Logging in again by email finds the same business.
  await c.req("/auth/code", "POST", { email: "titi@example.com" });
  const code2 = emailsTo("titi@example.com").at(-1)!.subject.match(/\d{6}/)![0];
  assert.equal((await c.req("/auth/verify", "POST", { email: "titi@example.com", code: code2 })).body.isNew, false);
});

test("a phone already used by another account can't be claimed", async () => {
  db.createBusiness({ ownerPhone: "+2348077777777" });
  const c = owner();
  await c.req("/auth/code", "POST", { email: "kemi@example.com" });
  const code = emailsTo("kemi@example.com").at(-1)!.subject.match(/\d{6}/)![0];
  c.setToken((await c.req("/auth/verify", "POST", { email: "kemi@example.com", code })).body.token);
  const r = await c.req("/api/business", "PUT", { contact: { ownerPhone: "08077777777" } });
  assert.equal(r.status, 409);
});

test("email is the alert backup when WhatsApp and SMS can't reach the owner", async () => {
  const b = db.createBusiness({ name: "Kemi's Closet", ownerEmail: "alerts@example.com" });
  db.setBusinessFields(b.id, { onboarded: 1 });
  const before = emailsTo("alerts@example.com").length;
  await client(base).req(`/tools/${b.id}/escalate`, "POST", { question: "Do you have size 14?", summary: "", urgency: "normal", caller_phone: "+2348011112222" }, { "x-tool-secret": b.toolSecret });
  await settle();
  const mails = emailsTo("alerts@example.com");
  assert.equal(mails.length, before + 1);
  assert.match(mails.at(-1)!.subject, /needs you/);
  assert.match(mails.at(-1)!.textContent, /Do you have size 14\?/);
});

test("in production, phone login is off without an SMS provider and says to use email", async () => {
  config.production = true;
  const sms = config.africasTalking.apiKey;
  config.africasTalking.apiKey = "";
  try {
    assert.deepEqual((await owner().req("/auth/methods")).body, { sms: false, email: true });
    const r = await owner().req("/auth/code", "POST", { phone: "08031234000" });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /email/);
  } finally {
    config.production = false;
    config.africasTalking.apiKey = sms;
  }
});

test("POOL_NUMBERS adds Ada's lines at start-up and connects them to ElevenLabs once", async () => {
  const { syncPoolNumbersFromConfig } = await import("../src/numbers.js");
  config.poolNumbers = ["0201 700 2222", "nonsense"];
  assert.deepEqual(await syncPoolNumbersFromConfig(), ["+2342017002222"]);
  assert.deepEqual(await syncPoolNumbersFromConfig(), [], "nothing new the second time");
  assert.equal(db.listPoolNumbers().find((n) => n.number === "+2342017002222")!.elevenlabs_phone_number_id, "pn_+2342017002222");
  assert.equal(callsTo(/convai\/phone-numbers$/).filter((c) => c.body.phone_number === "+2342017002222").length, 1);
});

test("old databases get the new owner_email column on start-up", () => {
  const path = join(mkdtempSync(join(tmpdir(), "pickam-")), "old.db");
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '', opening_hours TEXT NOT NULL DEFAULT '', delivery_info TEXT NOT NULL DEFAULT '', owner_name TEXT NOT NULL DEFAULT '',
    owner_phone TEXT NOT NULL DEFAULT '', owner_token TEXT NOT NULL UNIQUE, tool_secret TEXT NOT NULL, agent_id TEXT UNIQUE, plan TEXT NOT NULL DEFAULT 'trial',
    plan_expires_at TEXT NOT NULL, period_start TEXT NOT NULL, wallet_naira INTEGER NOT NULL DEFAULT 0, phone_number TEXT, paystack_subaccount TEXT,
    payout_account_name TEXT, onboarded INTEGER NOT NULL DEFAULT 0, last_digest_date TEXT, settings_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  old.prepare("INSERT INTO businesses (id, name, owner_token, tool_secret, plan_expires_at, period_start, settings_json) VALUES ('b1', 'Old Shop', 't', 's', '2099-01-01', '2026-01-01', '{}')").run();
  old.close();
  db.openDb(path);
  assert.equal(db.getBusiness("b1")!.ownerEmail, "");
  db.openDb(":memory:");
});

test("with Twilio configured, Ada's lines are imported as Twilio numbers and callbacks go through Twilio", async () => {
  const { syncPoolNumbersFromConfig } = await import("../src/numbers.js");
  const { startOutboundCall } = await import("../src/elevenlabs.js");
  config.twilio = { accountSid: "AC123", authToken: "tw-token" };
  try {
    config.poolNumbers = ["+15551234567"];
    assert.deepEqual(await syncPoolNumbersFromConfig(), ["+15551234567"]);
    const imported = callsTo(/convai\/phone-numbers$/).at(-1)!.body;
    assert.deepEqual(
      { provider: imported.provider, sid: imported.sid, token: imported.token, phone_number: imported.phone_number },
      { provider: "twilio", sid: "AC123", token: "tw-token", phone_number: "+15551234567" },
    );
    await startOutboundCall({ agentId: "a", phoneNumberId: "p", to: "+2348011112222", firstMessage: "Hi", variables: {} });
    assert.equal(callsTo(/outbound-call/).at(-1)!.url, "https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
  } finally {
    config.twilio = { accountSid: "", authToken: "" };
  }
});

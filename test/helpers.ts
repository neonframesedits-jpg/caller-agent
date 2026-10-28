// Test harness: in-memory database, a running server, and a fake for every external API.
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { config } from "../src/config.js";
import { openDb } from "../src/db.js";
import { createApp } from "../src/server.js";

export interface ExternalCall {
  url: string;
  method: string;
  body: any;
}

type Handler = (call: ExternalCall) => unknown;

const realFetch = globalThis.fetch;
export const external: ExternalCall[] = [];
const handlers: [RegExp, Handler][] = [];

/** Fake an external endpoint. Later registrations win. */
export function mock(pattern: RegExp, handler: Handler) {
  handlers.unshift([pattern, handler]);
}

export const callsTo = (pattern: RegExp) => external.filter((c) => pattern.test(c.url));
export const smsTo = (phone: string) =>
  callsTo(/africastalking/)
    .filter((c) => c.body.to === phone)
    .map((c) => c.body.message as string);

async function parseBody(init?: RequestInit) {
  const b = init?.body;
  if (b == null) return undefined;
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return b;
    }
  }
  if (b instanceof URLSearchParams) return Object.fromEntries(b);
  if (b instanceof FormData) return Object.fromEntries([...b.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "<file>"]));
  return b;
}

export async function startTestServer() {
  openDb(":memory:");
  config.publicUrl = "https://pickam.test";
  config.adminKey = "admin";
  config.elevenlabs.apiKey = "el-key";
  config.elevenlabs.webhookSecret = "whsec";
  config.africasTalking.apiKey = "at-key";
  config.whatsapp = { ...config.whatsapp, token: "wa-token", phoneNumberId: "wa-phone", appSecret: "wa-secret", verifyToken: "wa-verify" };
  config.paystack.secretKey = "sk_test";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("http://127.0.0.1")) return realFetch(input, init);
    const call = { url, method: init?.method ?? "GET", body: await parseBody(init) };
    external.push(call);
    const match = handlers.find(([re]) => re.test(url));
    const result = match ? match[1](call) : {};
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  // Sensible defaults for every external service.
  mock(/africastalking/, () => ({ SMSMessageData: { Recipients: [] } }));
  mock(/graph\.facebook\.com\/v21\.0\/wa-phone\/messages/, () => ({ messages: [{ id: `wamid.${external.length}` }] }));
  mock(/elevenlabs\.io\/v1\/convai\/agents\/create/, () => ({ agent_id: "agent_test" }));
  mock(/elevenlabs\.io\/v1\/convai\/phone-numbers$/, (c) => ({ phone_number_id: `pn_${c.body.phone_number}` }));
  mock(/elevenlabs\.io\/v1\/convai\/sip-trunk\/outbound-call/, () => ({ success: true, conversation_id: "conv_out" }));
  mock(/api\.paystack\.co\/transaction\/initialize/, (c) => ({ status: true, data: { authorization_url: `https://checkout.paystack.com/${c.body.reference}`, reference: c.body.reference } }));

  const server: Server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { server, base };
}

export function stopTestServer(server: Server) {
  server.close();
  globalThis.fetch = realFetch;
}

export const signElevenLabs = (body: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v0=${createHmac("sha256", config.elevenlabs.webhookSecret).update(`${t}.${body}`).digest("hex")}`;
export const signPaystack = (body: string) => createHmac("sha512", config.paystack.secretKey).update(body).digest("hex");
export const signWhatsApp = (body: string) => "sha256=" + createHmac("sha256", config.whatsapp.appSecret).update(body).digest("hex");

/** Waits for fire-and-forget work (alerts, SMS) to finish. */
export const settle = () => new Promise((r) => setTimeout(r, 30));

export function client(base: string) {
  let token = "";
  const req = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => {
    const res = await realFetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };
  return { req, setToken: (t: string) => (token = t) };
}

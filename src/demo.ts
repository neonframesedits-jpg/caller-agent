// The website's "Talk to Ada" demo: a voice agent for a pretend restaurant that anyone can call from the browser.
// The agent requires a signed URL, so it can only be reached through Pickam, which enforces the cost caps.
import { config } from "./config.js";
import * as db from "./db.js";

const API = "https://api.elevenlabs.io/v1";
const KV_KEY = "demo_agent_id";

export const DEMO_PROMPT = `You are Ada, the friendly phone receptionist for "Mama Tee's Kitchen", a home kitchen in Surulere, Lagos.
This call is a LIVE DEMO of Pickam, an AI receptionist for Nigerian businesses. The caller is trying you out from the Pickam website, probably after seeing a TikTok video.

How you talk:
- Keep replies short: one or two sentences, warm and natural, like a polite Nigerian customer-care person.
- Speak clear Nigerian English. If the caller speaks Pidgin, reply in friendly Pidgin.
- Say prices in naira, e.g. "three thousand five hundred naira".

Menu (only these items and prices):
- Jollof rice and chicken: ₦3,500
- Fried rice and chicken: ₦3,500
- Ofada rice and ayamase: ₦4,500
- Small chops (pack of 10): ₦5,000
- Extra plantain (dodo): ₦500
- Zobo (50cl): ₦700
Today the ofada rice is SOLD OUT. Offer jollof or fried rice instead.

Delivery: by dispatch rider. Lagos Mainland ₦1,500, Lagos Island ₦2,500. It takes 45 to 90 minutes. Pickup is free.
Opening hours: Monday to Saturday, 9am to 8pm. Closed Sundays.
Payment: after an order you send a payment link by SMS (card, transfer or USSD).
Events and catering: possible, but prices depend on the number of guests, so Mama Tee must call back.

Rules:
- Never invent items, prices or discounts that are not above.
- If the caller asks for a discount, a custom order, catering, or anything not above: say you'll ask Mama Tee and she'll call them back within 10 minutes. This shows how Pickam hands calls to the owner.
- For an order: get the items and quantities, a name, and the area for delivery (any area is fine, it's a demo). Read the order back with the total including delivery, then say you've sent a payment link to their phone.
- After the order, or if the caller asks what this is, say briefly: this was a Pickam demo, no real order was placed, and if they want an AI receptionist like you for their own business, they can join the waitlist on the Pickam website.
- Do not ask for real addresses, bank details or other personal information. A name and an area are enough.
- If the caller asks whether you are a real person, be honest that you are an AI assistant.
- Calls are short. If the conversation goes on long, wrap up politely and remind them about the waitlist.`;

export const DEMO_GREETING = "Hello, thank you for calling Mama Tee's Kitchen! I'm Ada. How can I help you today?";

export function buildDemoAgentConfig() {
  return {
    name: "Pickam website demo - Mama Tee's Kitchen",
    conversation_config: {
      agent: { first_message: DEMO_GREETING, language: "en", prompt: { prompt: DEMO_PROMPT, ...(config.elevenlabs.llm ? { llm: config.elevenlabs.llm } : {}) } },
      tts: config.elevenlabs.defaultVoiceId ? { voice_id: config.elevenlabs.defaultVoiceId } : undefined,
      conversation: { max_duration_seconds: config.demo.maxCallSeconds },
    },
    // Only callers with a signed URL from our server can connect, so the caps below can't be bypassed.
    platform_settings: { auth: { enable_auth: true } },
    tags: ["pickam", "website-demo"],
  };
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": config.elevenlabs.apiKey, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

export const demoConfigured = () => config.demo.enabled && !!config.elevenlabs.apiKey;
export const demoAgentId = () => config.demo.agentId || db.kvGet(KV_KEY) || null;

/**
 * Create the demo agent the first time, and refresh its prompt and voice on every start.
 * Runs at server start-up; failures are logged, not fatal (the site works without the demo).
 */
export async function ensureDemoAgent(): Promise<string | null> {
  if (!demoConfigured() || config.demo.agentId) return demoAgentId();
  const body = JSON.stringify(buildDemoAgentConfig());
  const existing = db.kvGet(KV_KEY);
  if (existing) {
    try {
      await api(`/convai/agents/${existing}`, { method: "PATCH", body });
      return existing;
    } catch (err) {
      // Deleted in the ElevenLabs dashboard: make a new one below.
      if (!/failed: 404/.test((err as Error).message)) throw err;
    }
  }
  const created = await api("/convai/agents/create", { method: "POST", body });
  db.kvSet(KV_KEY, created.agent_id);
  return created.agent_id as string;
}

// Per-visitor limit, in memory (one server instance).
const visitorHits = new Map<string, number[]>();

export class DemoUnavailable extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const lagosDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);

/** Check the caps and return a one-time URL the browser uses to start a call. */
export async function startDemoCall(visitor: string, now = new Date()): Promise<string> {
  const agentId = demoAgentId();
  if (!demoConfigured() || !agentId) throw new DemoUnavailable("The live demo isn't switched on yet.", 503);

  const hourAgo = now.getTime() - 3_600_000;
  const recent = (visitorHits.get(visitor) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= config.demo.callsPerVisitorPerHour) {
    throw new DemoUnavailable("You've tried Ada a few times already. Please try again in an hour, or join the waitlist!", 429);
  }
  if (!db.takeDemoCallSlot(lagosDay(now), config.demo.dailyCallLimit)) {
    throw new DemoUnavailable("Ada has taken so many demo calls today that she needs a rest. Try again tomorrow, or join the waitlist!", 429);
  }
  recent.push(now.getTime());
  visitorHits.set(visitor, recent);

  const { signed_url } = await api(`/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`);
  return signed_url as string;
}

export const demoCallsToday = (now = new Date()) => db.demoCallsOn(lagosDay(now));

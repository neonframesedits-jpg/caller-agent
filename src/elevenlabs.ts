import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import type { Business } from "./db.js";

const API = "https://api.elevenlabs.io/v1";

/** The instructions the voice agent follows on every call. Live data (menu, FAQs) comes from tools. */
export function buildSystemPrompt(b: Business): string {
  const s = b.settings;
  const lines = [
    `You are ${s.agentName}, the friendly phone receptionist for ${b.name}, a business in Nigeria.`,
    b.description ? `About the business: ${b.description}` : null,
    b.category ? `Category: ${b.category}` : null,
    b.location ? `Location: ${b.location}` : null,
    b.openingHours ? `Opening hours: ${b.openingHours}` : null,
    b.deliveryInfo ? `Delivery: ${b.deliveryInfo}` : null,
    "",
    "How you talk:",
    "- You are on a phone call. Keep every reply short (one to three sentences), warm and natural, like a polite Nigerian customer-care person.",
    s.languageStyle === "pidgin"
      ? "- Speak clear Nigerian English. If the caller speaks Pidgin, reply in friendly Pidgin."
      : "- Speak clear, polite Nigerian English.",
    "- Say prices in naira, e.g. 'three thousand five hundred naira'.",
    "- If the caller asks whether you are a real person, be honest that you are an AI assistant for the business.",
    "",
    "Answering questions:",
    "- ALWAYS call `get_business_info` before answering any question about products, prices, availability, delivery, payment or policies. Only use facts it returns or facts written above.",
    "- NEVER guess or invent prices, availability, discounts or promises.",
    `- If the information is not available, or the caller wants something only the owner can decide (special discounts, complaints, refunds, custom orders, partnerships), call \`escalate_to_owner\`, then tell the caller: "Let me get the owner to call you back within ${s.callbackMinutes} minutes." Confirm the number to call back on.`,
    "- Mark an escalation 'urgent' when the caller is upset, the order is large, or it is time-sensitive (e.g. event today).",
    "",
    s.takeOrders
      ? [
          "Taking orders:",
          "- Collect: items and quantities, the caller's name, delivery address (or pickup), and any notes.",
          "- Read the order back and get a clear yes before calling `place_order`.",
          "- After `place_order`, tell the caller the total it returns and the payment instructions it returns.",
        ].join("\n")
      : "Do not take orders. If the caller wants to order, call `escalate_to_owner` so the owner calls them back.",
    s.extraRules ? `\nRules from the owner (always follow):\n${s.extraRules}` : null,
    "",
    "Before ending the call, ask if there is anything else, then thank the caller by name if you know it.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

type JsonSchema = Record<string, unknown>;

function webhookTool(b: Business, name: string, description: string, path: string, body: JsonSchema) {
  return {
    type: "webhook",
    name,
    description,
    api_schema: {
      url: `${config.publicUrl}/tools/${b.id}/${path}`,
      method: "POST",
      request_headers: { "x-tool-secret": b.toolSecret },
      request_body_schema: body,
    },
  };
}

// The caller's number and the conversation id come from ElevenLabs system variables, not from the LLM.
const callerFields = {
  caller_phone: { type: "string", dynamic_variable: "system__caller_id", description: "Caller phone number" },
  conversation_id: { type: "string", dynamic_variable: "system__conversation_id", description: "Conversation id" },
};

export function buildTools(b: Business) {
  const tools = [
    webhookTool(b, "get_business_info", "Look up live answers about the business: products, prices, what is available today, delivery and policies.", "business-info", {
      type: "object",
      properties: { question: { type: "string", description: "The caller's question, in their own words" } },
      required: ["question"],
    }),
    webhookTool(
      b,
      "escalate_to_owner",
      "Hand the caller over to the business owner when you cannot answer or the owner must decide. The owner gets alerted and calls back.",
      "escalate",
      {
        type: "object",
        properties: {
          question: { type: "string", description: "What exactly the caller wants to know or needs" },
          summary: { type: "string", description: "Short summary of the call so far, so the owner has context" },
          customer_name: { type: "string", description: "Caller's name if known, else empty" },
          callback_phone: { type: "string", description: "Number the caller wants to be called back on, if different from the number they are calling from" },
          urgency: { type: "string", enum: ["low", "normal", "urgent"], description: "How urgent this is for the caller" },
          ...callerFields,
        },
        required: ["question", "summary", "urgency"],
      },
    ),
  ];
  if (b.settings.takeOrders) {
    tools.push(
      webhookTool(b, "place_order", "Record a confirmed order. Only call after the caller has confirmed the items read back to them.", "order", {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "Caller's name" },
          items: {
            type: "array",
            description: "Items ordered",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Product name as on the menu" },
                quantity: { type: "integer", description: "How many" },
              },
              required: ["name", "quantity"],
            },
          },
          delivery_address: { type: "string", description: "Delivery address, or 'pickup'" },
          notes: { type: "string", description: "Extra instructions, e.g. 'no pepper', 'deliver after 5pm'" },
          ...callerFields,
        },
        required: ["customer_name", "items", "delivery_address"],
      }),
    );
  }
  return tools;
}

export function buildAgentConfig(b: Business) {
  return {
    name: `Pickam - ${b.name}`,
    conversation_config: {
      agent: {
        first_message: b.settings.greeting,
        language: "en",
        prompt: { prompt: buildSystemPrompt(b), llm: config.elevenlabs.llm, tools: buildTools(b) },
      },
      tts: config.elevenlabs.defaultVoiceId ? { voice_id: config.elevenlabs.defaultVoiceId } : undefined,
      // Caps cost per call (pranks, very long chats).
      conversation: { max_duration_seconds: 300 },
    },
    tags: ["pickam", `business:${b.id}`],
  };
}

async function api(path: string, init: RequestInit) {
  if (!config.elevenlabs.apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": config.elevenlabs.apiKey, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${init.method} ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** Create the business's agent on first sync, update it afterwards. Returns the agent id. */
export async function syncAgent(b: Business): Promise<string> {
  const body = JSON.stringify(buildAgentConfig(b));
  if (b.agentId) {
    await api(`/convai/agents/${b.agentId}`, { method: "PATCH", body });
    return b.agentId;
  }
  const created = await api("/convai/agents/create", { method: "POST", body });
  return created.agent_id as string;
}

/**
 * Verify the `ElevenLabs-Signature: t=<unix>,v0=<hex hmac>` header on post-call webhooks.
 * The HMAC-SHA256 is computed over `${t}.${rawBody}` with the webhook secret.
 */
export function verifyWebhookSignature(rawBody: string, header: string | undefined, secret: string, toleranceSecs = 30 * 60, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v0 || Math.abs(now / 1000 - t) > toleranceSecs) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const given = Buffer.from(parts.v0);
  return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected));
}

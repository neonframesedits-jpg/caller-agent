import { readFileSync, existsSync } from "node:fs";

// Minimal .env loader so the project has no extra dependency for it.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const env = (name: string, fallback = "") => process.env[name] ?? fallback;

export const config = {
  port: Number(env("PORT", "3000")),
  publicUrl: env("PUBLIC_URL", "http://localhost:3000").replace(/\/$/, ""),
  production: env("NODE_ENV") === "production",
  adminKey: env("ADMIN_KEY"),
  /** Pickam staff phone, alerted when e.g. the phone number pool runs out. */
  adminPhone: env("ADMIN_PHONE"),
  databasePath: env("DATABASE_PATH", "data/pickam.db"),
  elevenlabs: {
    apiKey: env("ELEVENLABS_API_KEY"),
    defaultVoiceId: env("ELEVENLABS_DEFAULT_VOICE_ID"),
    llm: env("ELEVENLABS_LLM", "gpt-4o-mini"),
    webhookSecret: env("ELEVENLABS_WEBHOOK_SECRET"),
  },
  /** SIP trunk of the Nigerian voice provider, used when importing numbers into ElevenLabs. */
  sip: {
    address: env("SIP_TRUNK_ADDRESS"),
    username: env("SIP_TRUNK_USERNAME"),
    password: env("SIP_TRUNK_PASSWORD"),
  },
  africasTalking: {
    username: env("AT_USERNAME", "sandbox"),
    apiKey: env("AT_API_KEY"),
    senderId: env("AT_SENDER_ID"),
  },
  whatsapp: {
    token: env("WHATSAPP_TOKEN"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    appSecret: env("WHATSAPP_APP_SECRET"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    /** Approved template with two body parameters: {{1}} title, {{2}} details. */
    alertTemplate: env("WHATSAPP_ALERT_TEMPLATE", "pickam_alert"),
    templateLanguage: env("WHATSAPP_TEMPLATE_LANGUAGE", "en"),
  },
  paystack: {
    secretKey: env("PAYSTACK_SECRET_KEY"),
    /** Pickam's cut of customer payments made through order payment links, in percent. */
    orderFeePercent: Number(env("PAYSTACK_ORDER_FEE_PERCENT", "0")),
  },
};

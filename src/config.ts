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
  /** false = the landing page collects early-access sign-ups; true = it sends people straight to signup. */
  signupsOpen: env("SIGNUPS_OPEN", "false") === "true",
  elevenlabs: {
    apiKey: env("ELEVENLABS_API_KEY"),
    defaultVoiceId: env("ELEVENLABS_DEFAULT_VOICE_ID"),
    /** Leave empty to use ElevenLabs' default model. */
    llm: env("ELEVENLABS_LLM"),
    webhookSecret: env("ELEVENLABS_WEBHOOK_SECRET"),
  },
  /** The website "Talk to Ada" demo. Each call costs ElevenLabs minutes, so it is capped. */
  demo: {
    enabled: env("DEMO_ENABLED", "true") === "true",
    /** Use an agent you made yourself in ElevenLabs instead of the one Pickam creates. */
    agentId: env("DEMO_AGENT_ID"),
    maxCallSeconds: Number(env("DEMO_MAX_CALL_SECONDS", "120")),
    dailyCallLimit: Number(env("DEMO_DAILY_CALL_LIMIT", "50")),
    callsPerVisitorPerHour: Number(env("DEMO_CALLS_PER_VISITOR_PER_HOUR", "3")),
  },
  /** Web Push keys. Leave empty: Pickam generates and stores a pair on first start. */
  vapid: { publicKey: env("VAPID_PUBLIC_KEY"), privateKey: env("VAPID_PRIVATE_KEY") },
  /** First N businesses to buy a plan get their first month at half price. 0 turns the offer off. */
  foundingSlots: Number(env("FOUNDING_SLOTS", "100")),
  /** Twilio account. When set, Ada's lines in POOL_NUMBERS are Twilio numbers (e.g. a free-trial number). */
  twilio: {
    accountSid: env("TWILIO_ACCOUNT_SID"),
    authToken: env("TWILIO_AUTH_TOKEN"),
  },
  /** SIP trunk of the Nigerian voice provider, used when importing numbers into ElevenLabs. */
  sip: {
    address: env("SIP_TRUNK_ADDRESS"),
    username: env("SIP_TRUNK_USERNAME"),
    password: env("SIP_TRUNK_PASSWORD"),
  },
  /** Brevo (free: 300 emails/day) for login codes and owner alerts by email. */
  brevo: {
    apiKey: env("BREVO_API_KEY"),
    senderEmail: env("BREVO_SENDER_EMAIL"),
    senderName: env("BREVO_SENDER_NAME", "Pickam"),
  },
  /** Ada's lines, comma-separated (e.g. "+2342017001111,+2342017002222"). Added to the pool at start-up. */
  poolNumbers: env("POOL_NUMBERS")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean),
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

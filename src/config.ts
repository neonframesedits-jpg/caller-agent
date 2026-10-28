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
  adminKey: env("ADMIN_KEY"),
  databasePath: env("DATABASE_PATH", "data/pickam.db"),
  elevenlabs: {
    apiKey: env("ELEVENLABS_API_KEY"),
    defaultVoiceId: env("ELEVENLABS_DEFAULT_VOICE_ID"),
    llm: env("ELEVENLABS_LLM", "gpt-4o-mini"),
    webhookSecret: env("ELEVENLABS_WEBHOOK_SECRET"),
  },
  africasTalking: {
    username: env("AT_USERNAME", "sandbox"),
    apiKey: env("AT_API_KEY"),
    senderId: env("AT_SENDER_ID"),
  },
};

// Login with one-time codes, sent by SMS to a phone number or by email (Brevo).
import { randomInt } from "node:crypto";
import { config } from "./config.js";
import * as db from "./db.js";
import { emailConfigured, normalizeEmail, sendEmail } from "./email.js";
import { sendSms } from "./notify.js";
import { normalizePhone } from "./phone.js";

const CODE_TTL_MS = 10 * 60_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type LoginId = { phone: string } | { email: string };

/** Which ways of logging in this server can deliver codes for. Development prints codes to the console. */
export const loginMethods = () => ({
  sms: !!config.africasTalking.apiKey || !config.production,
  email: emailConfigured() || !config.production,
});

/** Validate and normalise; the OTP table is keyed by "+234…" or "email:…". */
function resolve(id: LoginId): { kind: "phone" | "email"; value: string; key: string } {
  if ("email" in id && id.email) {
    const email = normalizeEmail(id.email);
    if (!email) throw new AuthError("Enter a valid email address.");
    return { kind: "email", value: email, key: `email:${email}` };
  }
  const phone = normalizePhone("phone" in id ? id.phone : "");
  if (!phone) throw new AuthError("Enter a valid Nigerian phone number.");
  return { kind: "phone", value: phone, key: phone };
}

const hashCode = (key: string, code: string) => db.sha256(`${key}:${code}`);

export async function requestCode(id: LoginId): Promise<{ phone?: string; email?: string }> {
  const who = resolve(id);
  if (!loginMethods()[who.kind === "phone" ? "sms" : "email"]) {
    throw new AuthError(who.kind === "phone" ? "Phone login isn't available yet. Use your email instead." : "Email login isn't available yet.", 503);
  }
  const now = Date.now();
  const existing = db.getOtp(who.key);
  const sameWindow = existing && now - existing.window_start < 3_600_000;
  if (sameWindow && existing.sent_in_window >= MAX_SENDS_PER_HOUR) throw new AuthError("Too many codes requested. Try again in an hour.", 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  db.saveOtp({
    phone: who.key,
    code_hash: hashCode(who.key, code),
    expires_at: now + CODE_TTL_MS,
    attempts: 0,
    window_start: sameWindow ? existing.window_start : now,
    sent_in_window: sameWindow ? existing.sent_in_window + 1 : 1,
  });

  let sent = false;
  try {
    if (who.kind === "phone") sent = await sendSms(who.value, `Your Pickam code is ${code}. It expires in 10 minutes. Don't share it with anyone.`);
    else
      sent = await sendEmail(who.value, `Your Pickam code: ${code}`, {
        heading: "Your login code",
        code,
        lines: ["Enter this code in Pickam to log in. It expires in 10 minutes.", "If you didn't ask for it, you can ignore this email."],
      });
  } catch (err) {
    console.error("[auth] sending code failed", err);
    throw new AuthError(`We couldn't send your code just now. Please try again${who.kind === "phone" ? " or use your email" : ""}.`, 502);
  }
  if (!sent) console.log(`[auth] ${who.kind} not configured. Login code for ${who.value}: ${code}`);
  return who.kind === "phone" ? { phone: who.value } : { email: who.value };
}

/** Check the code. Signs in the owner, creating their business on first login. */
export function verifyCode(id: LoginId, code: string): { token: string; isNew: boolean } {
  const who = resolve(id);
  const otp = db.getOtp(who.key);
  if (!otp || otp.expires_at < Date.now()) throw new AuthError("That code has expired. Request a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new AuthError("Too many wrong attempts. Request a new code.", 429);
  if (hashCode(who.key, code.trim()) !== otp.code_hash) {
    db.bumpOtpAttempts(who.key);
    throw new AuthError("Wrong code. Check it and try again.");
  }
  db.consumeOtp(who.key);
  let business = who.kind === "phone" ? db.getBusinessByOwnerPhone(who.value) : db.getBusinessByOwnerEmail(who.value);
  const isNew = !business;
  if (!business) business = db.createBusiness(who.kind === "phone" ? { ownerPhone: who.value } : { ownerEmail: who.value });
  return { token: db.createSession(business.id), isNew };
}

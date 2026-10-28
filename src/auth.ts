// Phone-number login with one-time codes sent by SMS.
import { randomInt } from "node:crypto";
import { config } from "./config.js";
import * as db from "./db.js";
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

const hashCode = (phone: string, code: string) => db.sha256(`${phone}:${code}`);

export async function requestCode(rawPhone: string): Promise<{ phone: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError("Enter a valid Nigerian phone number.");
  const now = Date.now();
  const existing = db.getOtp(phone);
  const sameWindow = existing && now - existing.window_start < 3_600_000;
  if (sameWindow && existing.sent_in_window >= MAX_SENDS_PER_HOUR) throw new AuthError("Too many codes requested. Try again in an hour.", 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  db.saveOtp({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: now + CODE_TTL_MS,
    attempts: 0,
    window_start: sameWindow ? existing.window_start : now,
    sent_in_window: sameWindow ? existing.sent_in_window + 1 : 1,
  });
  if (config.africasTalking.apiKey) {
    await sendSms(phone, `Your Pickam code is ${code}. It expires in 10 minutes. Don't share it with anyone.`);
  } else if (!config.production) {
    console.log(`[auth] SMS not configured. Login code for ${phone}: ${code}`);
  } else {
    throw new AuthError("SMS is not configured on the server.", 503);
  }
  return { phone };
}

/** Check the code. Signs in the owner, creating their business on first login. */
export function verifyCode(rawPhone: string, code: string): { token: string; isNew: boolean } {
  const phone = normalizePhone(rawPhone);
  const otp = phone ? db.getOtp(phone) : undefined;
  if (!phone || !otp || otp.expires_at < Date.now()) throw new AuthError("That code has expired. Request a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new AuthError("Too many wrong attempts. Request a new code.", 429);
  if (hashCode(phone, code.trim()) !== otp.code_hash) {
    db.bumpOtpAttempts(phone);
    throw new AuthError("Wrong code. Check the SMS and try again.");
  }
  db.consumeOtp(phone);
  let business = db.getBusinessByOwnerPhone(phone);
  const isNew = !business;
  if (!business) business = db.createBusiness({ ownerPhone: phone });
  return { token: db.createSession(business.id), isNew };
}

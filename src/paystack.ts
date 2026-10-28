// Paystack: plan payments, wallet top-ups, and customers paying for orders.
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const API = "https://api.paystack.co";

export const paystackConfigured = () => !!config.paystack.secretKey;

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.paystack.secretKey) throw new Error("PAYSTACK_SECRET_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.paystack.secretKey}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !body.status) throw new Error(`Paystack ${path} failed: ${res.status} ${body.message ?? ""}`);
  return body.data as T;
}

/** Paystack needs an email; callers on the phone don't give one, so derive a stable placeholder from their number. */
export const placeholderEmail = (phone: string) => `${phone.replace(/\D/g, "") || "customer"}@customers.pickam.ng`;

export async function initializeTransaction(input: {
  amountNaira: number;
  email: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  subaccount?: string;
}): Promise<{ authorization_url: string; reference: string }> {
  return call("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountNaira * 100, // kobo
      email: input.email,
      reference: input.reference,
      currency: "NGN",
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      ...(input.subaccount ? { subaccount: input.subaccount, bearer: "subaccount" } : {}),
    }),
  });
}

export const listBanks = () => call<{ name: string; code: string }[]>("/bank?country=nigeria&currency=NGN&perPage=100");

export const resolveAccount = (accountNumber: string, bankCode: string) =>
  call<{ account_name: string; account_number: string }>(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);

/** Create a settlement subaccount so order payments go straight to the business's bank account. */
export const createSubaccount = (input: { businessName: string; bankCode: string; accountNumber: string }) =>
  call<{ subaccount_code: string }>("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: config.paystack.orderFeePercent,
    }),
  });

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function verifyPaystackSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !config.paystack.secretKey) return false;
  const expected = createHmac("sha512", config.paystack.secretKey).update(rawBody).digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

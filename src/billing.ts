// Money flows: owners paying Pickam (plans, wallet), customers paying owners (order links), and metering calls.
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import * as db from "./db.js";
import { formatNaira } from "./knowledge.js";
import { alertOwner, sendSms } from "./notify.js";
import * as paystack from "./paystack.js";
import { PLAN_DAYS, callCharge, planFor, usageFor } from "./plans.js";

const newReference = (purpose: string) => `pk_${purpose}_${randomBytes(9).toString("hex")}`;

export const MIN_TOPUP_NAIRA = 1_000;

export type CheckoutRequest = { kind: "plan"; plan: string } | { kind: "wallet"; amountNaira: number };

/** Start a Paystack checkout for the owner. Returns the page to send them to. */
export async function startCheckout(b: db.Business, req: CheckoutRequest): Promise<{ url: string; reference: string }> {
  let amountNaira: number;
  let meta: Record<string, unknown>;
  if (req.kind === "plan") {
    const plan = planFor(req.plan);
    if (plan.id !== req.plan || !plan.purchasable) throw new Error("Unknown plan");
    amountNaira = plan.priceNaira;
    meta = { plan: plan.id };
  } else {
    if (!Number.isInteger(req.amountNaira) || req.amountNaira < MIN_TOPUP_NAIRA) throw new Error(`Minimum top-up is ${formatNaira(MIN_TOPUP_NAIRA)}`);
    amountNaira = req.amountNaira;
    meta = {};
  }
  const reference = newReference(req.kind);
  db.createPayment({ reference, business_id: b.id, purpose: req.kind, amount_naira: amountNaira, meta });
  const tx = await paystack.initializeTransaction({
    amountNaira,
    email: paystack.placeholderEmail(b.ownerPhone),
    reference,
    callbackUrl: `${config.publicUrl}/?paid=${reference}`,
    metadata: { business_id: b.id, purpose: req.kind, ...meta },
  });
  return { url: tx.authorization_url, reference };
}

/** Apply a successful Paystack charge. Safe to call more than once for the same reference. */
export async function applySuccessfulCharge(reference: string, amountKobo: number): Promise<string> {
  const payment = db.getPayment(reference);
  if (!payment) return "unknown reference";
  if (Math.floor(amountKobo / 100) < payment.amount_naira) return "amount too low";
  if (!db.markPaymentSuccess(reference)) return "already processed";
  const b = db.getBusiness(payment.business_id);
  if (!b) return "business gone";

  if (payment.purpose === "plan") {
    const plan = planFor(payment.meta.plan);
    const from = Math.max(Date.now(), new Date(b.planExpiresAt).getTime());
    db.setBusinessFields(b.id, {
      plan: plan.id,
      period_start: new Date().toISOString(),
      plan_expires_at: new Date(from + PLAN_DAYS * 86_400_000).toISOString(),
    });
    await alertOwner(b, { kind: "billing", urgency: "low", title: `${plan.name} plan active`, body: `Thank you! ${plan.includedMinutes} minutes for the next ${PLAN_DAYS} days.` });
  } else if (payment.purpose === "wallet") {
    db.adjustWallet(b.id, payment.amount_naira, "Wallet top-up", reference);
    await alertOwner(b, { kind: "billing", urgency: "low", title: `Wallet topped up`, body: `${formatNaira(payment.amount_naira)} added.` });
  } else if (payment.purpose === "order") {
    const orderId = Number(payment.meta.order_id);
    db.setOrderPayment(orderId, { payment_status: "paid" });
    await alertOwner(b, { kind: "payment", urgency: "normal", title: `Order #${orderId} paid - ${formatNaira(payment.amount_naira)}`, body: "The customer paid with the link Pickam sent. You can dispatch." });
  }
  return "ok";
}

/**
 * Store a finished call and charge any minutes beyond the plan to the wallet.
 * Alerts the owner when plan minutes run out or the AI drops to message-only mode.
 */
export async function recordFinishedCall(
  b: db.Business,
  call: { conversationId: string; customerPhone: string; durationSecs: number; summary: string; transcript: unknown; successful: string },
) {
  const isNew = !db.callExists(call.conversationId);
  const before = usageFor(b);
  db.upsertCall(b.id, call);
  if (!isNew || call.durationSecs <= 0) return;

  const minutes = Math.ceil(call.durationSecs / 60);
  const usedBefore = db.minutesUsedSince(b.id, b.periodStart, call.conversationId);
  const charge = callCharge(b, minutes, usedBefore);
  if (charge.chargeNaira > 0) db.adjustWallet(b.id, -charge.chargeNaira, `Call: ${charge.overageMinutes} extra min`, call.conversationId);

  const after = usageFor(db.getBusiness(b.id)!);
  if (before.mode === "full" && after.mode === "message_only") {
    await alertOwner(b, {
      kind: "billing",
      urgency: "urgent",
      title: "Your AI is now only taking messages",
      body: `${after.reason} Renew or top up in the Pickam dashboard so Ada can answer customers fully again.`,
    });
  } else if (before.minutesLeft > 0 && after.minutesLeft === 0 && after.mode === "full") {
    await alertOwner(b, {
      kind: "billing",
      urgency: "normal",
      title: "Plan minutes finished",
      body: `Extra minutes now come from your wallet (${formatNaira(after.walletNaira)} left, ${formatNaira(after.plan.overagePerMinuteNaira)}/min).`,
    });
  }
}

/** Connect the owner's bank account so customers' order payments settle straight to them. */
export async function setupPayout(b: db.Business, bankCode: string, accountNumber: string): Promise<string> {
  const account = await paystack.resolveAccount(accountNumber, bankCode);
  const sub = await paystack.createSubaccount({ businessName: b.name || account.account_name, bankCode, accountNumber });
  db.setBusinessFields(b.id, { paystack_subaccount: sub.subaccount_code, payout_account_name: account.account_name });
  return account.account_name;
}

export const canSendPaymentLinks = (b: db.Business) => b.settings.paymentLinks && !!b.paystackSubaccount && paystack.paystackConfigured();

/** Create a Paystack link for an order and text it to the customer. */
export async function sendOrderPaymentLink(b: db.Business, order: { id: number; totalNaira: number }, customerPhone: string): Promise<string> {
  const reference = newReference("order");
  db.createPayment({ reference, business_id: b.id, purpose: "order", amount_naira: order.totalNaira, meta: { order_id: order.id } });
  const tx = await paystack.initializeTransaction({
    amountNaira: order.totalNaira,
    email: paystack.placeholderEmail(customerPhone),
    reference,
    subaccount: b.paystackSubaccount!,
    metadata: { business_id: b.id, purpose: "order", order_id: order.id },
  });
  db.setOrderPayment(order.id, { payment_status: "link_sent", payment_link: tx.authorization_url });
  await sendSms(customerPhone, `${b.name}: pay ${formatNaira(order.totalNaira)} for order #${order.id} here: ${tx.authorization_url}`);
  return tx.authorization_url;
}

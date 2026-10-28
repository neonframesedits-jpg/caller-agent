// Subscription plans and the rules for when the AI may answer in full. See docs/BUSINESS.md for the pricing maths.
import type { Business } from "./db.js";
import { minutesUsedSince } from "./db.js";

export interface Plan {
  id: string;
  name: string;
  priceNaira: number;
  includedMinutes: number;
  /** Charged from the wallet once included minutes are used up. */
  overagePerMinuteNaira: number;
  purchasable: boolean;
}

export const PLAN_DAYS = 30;

export const PLANS: Record<string, Plan> = {
  trial: { id: "trial", name: "Free trial", priceNaira: 0, includedMinutes: 30, overagePerMinuteNaira: 350, purchasable: false },
  payg: { id: "payg", name: "Pay-as-you-go", priceNaira: 5_000, includedMinutes: 0, overagePerMinuteNaira: 350, purchasable: true },
  starter: { id: "starter", name: "Starter", priceNaira: 20_000, includedMinutes: 60, overagePerMinuteNaira: 300, purchasable: true },
  business: { id: "business", name: "Business", priceNaira: 45_000, includedMinutes: 200, overagePerMinuteNaira: 250, purchasable: true },
  pro: { id: "pro", name: "Pro", priceNaira: 110_000, includedMinutes: 600, overagePerMinuteNaira: 200, purchasable: true },
};

export const planFor = (id: string) => PLANS[id] ?? PLANS.trial;

/** "full" = answers and takes orders; "message_only" = only takes a message for the owner. */
export type ServiceMode = "full" | "message_only";

export interface Usage {
  plan: Plan;
  active: boolean;
  expiresAt: string;
  minutesUsed: number;
  minutesLeft: number;
  walletNaira: number;
  /** Extra minutes the wallet can still pay for. */
  walletMinutes: number;
  mode: ServiceMode;
  reason: string | null;
}

export function usageFor(b: Business, now = new Date()): Usage {
  const plan = planFor(b.plan);
  const active = new Date(b.planExpiresAt) > now;
  const minutesUsed = minutesUsedSince(b.id, b.periodStart);
  const minutesLeft = active ? Math.max(0, plan.includedMinutes - minutesUsed) : 0;
  const walletMinutes = Math.max(0, Math.floor(b.walletNaira / plan.overagePerMinuteNaira));
  let reason: string | null = null;
  if (!active) reason = b.plan === "trial" ? "Your free trial has ended." : "Your plan has expired.";
  else if (minutesLeft === 0 && walletMinutes === 0) reason = "Your minutes are finished and your wallet is empty.";
  return {
    plan,
    active,
    expiresAt: b.planExpiresAt,
    minutesUsed,
    minutesLeft,
    walletNaira: b.walletNaira,
    walletMinutes,
    mode: reason ? "message_only" : "full",
    reason,
  };
}

/**
 * Work out what one finished call costs the wallet.
 * Minutes inside the plan are free; the rest is charged at the plan's overage rate.
 * Calls taken while the plan has expired are charged entirely at the overage rate.
 */
export function callCharge(b: Business, callMinutes: number, minutesUsedBefore: number, now = new Date()) {
  const plan = planFor(b.plan);
  const active = new Date(b.planExpiresAt) > now;
  const includedLeft = active ? Math.max(0, plan.includedMinutes - minutesUsedBefore) : 0;
  const overageMinutes = Math.max(0, callMinutes - includedLeft);
  return { overageMinutes, chargeNaira: overageMinutes * plan.overagePerMinuteNaira, includedLeftAfter: Math.max(0, includedLeft - callMinutes) };
}

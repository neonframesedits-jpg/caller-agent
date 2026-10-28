// Subscription plans. See docs/BUSINESS.md for how these prices were worked out.
export interface Plan {
  id: string;
  name: string;
  priceNaira: number;
  includedMinutes: number;
  overagePerMinuteNaira: number;
}

export const PLANS: Record<string, Plan> = {
  trial: { id: "trial", name: "Free trial (14 days)", priceNaira: 0, includedMinutes: 30, overagePerMinuteNaira: 0 },
  starter: { id: "starter", name: "Starter", priceNaira: 20_000, includedMinutes: 60, overagePerMinuteNaira: 300 },
  business: { id: "business", name: "Business", priceNaira: 45_000, includedMinutes: 200, overagePerMinuteNaira: 250 },
  pro: { id: "pro", name: "Pro", priceNaira: 110_000, includedMinutes: 600, overagePerMinuteNaira: 200 },
};

export function usageSummary(planId: string, minutesUsed: number) {
  const plan = PLANS[planId] ?? PLANS.trial;
  const overageMinutes = Math.max(0, minutesUsed - plan.includedMinutes);
  return {
    plan,
    minutesUsed,
    minutesLeft: Math.max(0, plan.includedMinutes - minutesUsed),
    overageMinutes,
    estimatedBillNaira: plan.priceNaira + overageMinutes * plan.overagePerMinuteNaira,
  };
}

// Background jobs, checked every minute: chase overdue callbacks and send daily summaries.
// Runs in-process, so deploy a single instance (see README "Hosting").
import * as db from "./db.js";
import { formatNaira } from "./knowledge.js";
import { alertOwner, messageOwner, sendSms } from "./notify.js";

/** Remind the owner (loudly) about callbacks past their promised time, and apologise to the customer. */
export async function chaseOverdueCallbacks(now = new Date()) {
  for (const esc of db.listOverdueEscalations(now.toISOString())) {
    db.markEscalationReminded(esc.id);
    const b = db.getBusiness(esc.business_id);
    if (!b) continue;
    await alertOwner(
      b,
      {
        kind: "escalation",
        urgency: "urgent",
        title: `OVERDUE: ${esc.customer_name || "a customer"} is still waiting${esc.customer_phone ? ` (${esc.customer_phone})` : ""}`,
        body: `You promised to call back within ${b.settings.callbackMinutes} min about: ${esc.question}. Reply to this message with the answer and ${b.settings.agentName} will call them.`,
        refId: esc.id,
      },
      { forceMode: "ring", escalationId: esc.id },
    );
    if (b.settings.apologySms && esc.customer_phone) {
      const who = b.ownerName || "the owner";
      await sendSms(esc.customer_phone, `${b.name}: sorry for the delay! ${who} will call you back shortly about your question.`).catch((err) =>
        console.error("[scheduler] apology SMS failed", err),
      );
    }
  }
}

/** "YYYY-MM-DD" and minutes-since-midnight in Lagos. */
function lagosClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function buildDailySummary(b: db.Business, now = new Date()): string | null {
  // Lagos is UTC+1 all year (no daylight saving), so Lagos midnight is 23:00 UTC the day before.
  const { date } = lagosClock(now);
  const todayStartUtc = new Date(`${date}T00:00:00+01:00`);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 86_400_000);
  const a = db.activityBetween(b.id, yesterdayStartUtc.toISOString(), todayStartUtc.toISOString());
  if (a.calls === 0 && a.orders === 0 && a.pendingCallbacks === 0) return null;
  const parts = [`${a.calls} call${a.calls === 1 ? "" : "s"}`, `${a.orders} order${a.orders === 1 ? "" : "s"} (${formatNaira(a.orderTotalNaira)})`];
  let text = `Yesterday: ${parts.join(", ")}. ${a.pendingCallbacks} callback${a.pendingCallbacks === 1 ? "" : "s"} pending.`;
  if (a.unansweredQuestions.length) text += ` Questions Ada couldn't answer: ${a.unansweredQuestions.map((q) => `"${q}"`).join(", ")}. Reply with the answers to teach her.`;
  return text;
}

export async function sendDailySummaries(now = new Date()) {
  const { date, minutes } = lagosClock(now);
  for (const b of db.listBusinesses()) {
    const ds = b.settings.dailySummary;
    if (!ds.enabled || !b.onboarded || b.lastDigestDate === date) continue;
    const [h, m] = ds.time.split(":").map(Number);
    if (minutes < h * 60 + (m || 0)) continue;
    db.setBusinessFields(b.id, { last_digest_date: date });
    const text = buildDailySummary(b, now);
    if (text) await messageOwner(b, `Daily summary for ${b.name}`, text);
  }
}

export function startScheduler() {
  const tick = () => {
    chaseOverdueCallbacks().catch((err) => console.error("[scheduler] overdue", err));
    sendDailySummaries().catch((err) => console.error("[scheduler] summaries", err));
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  return timer;
}

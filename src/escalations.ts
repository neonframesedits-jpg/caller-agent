// What happens when the owner answers a customer's question.
import * as db from "./db.js";
import { startOutboundCall } from "./elevenlabs.js";
import { sendSms } from "./notify.js";

export interface AnswerOptions {
  /** Save the answer so the AI can answer this question alone next time. */
  save: boolean;
  /** Have the AI phone the customer with the answer. */
  callBack: boolean;
}

export type CallbackResult = "calling" | "no_number" | "not_set_up" | "failed" | "skipped";

export async function answerEscalation(b: db.Business, esc: db.Escalation, answer: string, opts: AnswerOptions): Promise<CallbackResult> {
  db.updateEscalation(b.id, esc.id, "resolved", answer || undefined);
  if (opts.save && answer) db.addFaq(b.id, esc.question, answer, "learned");
  if (!opts.callBack || !answer) return "skipped";
  return aiCallBack(b, { ...esc, owner_answer: answer });
}

/** The AI phones the customer and gives them the owner's answer. */
export async function aiCallBack(b: db.Business, esc: db.Escalation): Promise<CallbackResult> {
  if (!esc.customer_phone) {
    db.setEscalationCallbackStatus(esc.id, "no_number");
    return "no_number";
  }
  const pool = db.getPoolNumberForBusiness(b.id);
  if (!b.agentId || !pool?.elevenlabs_phone_number_id) {
    db.setEscalationCallbackStatus(esc.id, "not_set_up");
    return "not_set_up";
  }
  const name = esc.customer_name ? ` ${esc.customer_name}` : "";
  try {
    await startOutboundCall({
      agentId: b.agentId,
      phoneNumberId: pool.elevenlabs_phone_number_id,
      to: esc.customer_phone,
      firstMessage: `Hello${name}, this is ${b.settings.agentName} from ${b.name}. I'm calling you back about your question. Is this a good time?`,
      variables: { call_purpose: "owner_callback", callback_question: esc.question, owner_answer: esc.owner_answer ?? "" },
    });
    db.setEscalationCallbackStatus(esc.id, "calling");
    return "calling";
  } catch (err) {
    console.error("[callback] outbound call failed", err);
    db.setEscalationCallbackStatus(esc.id, "failed");
    // Still get the answer to the customer.
    await sendSms(esc.customer_phone, `${b.name}: about your question "${esc.question}": ${esc.owner_answer}`).catch(() => {});
    return "failed";
  }
}

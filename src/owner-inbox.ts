// Owners talk to Pickam on WhatsApp: answer callbacks, mark items sold out, and teach the AI by text or voice note.
import * as db from "./db.js";
import { transcribe } from "./elevenlabs.js";
import { answerEscalation, type CallbackResult } from "./escalations.js";
import { matchProduct } from "./knowledge.js";
import { normalizePhone } from "./phone.js";
import { downloadMedia, sendText, type InboundMessage } from "./whatsapp.js";

export const HELP_TEXT = [
  "Pickam on WhatsApp:",
  "• Reply to an alert (swipe right on it) with the answer, by text or voice note, and Ada will call the customer back with it.",
  "• Or send: #12 your answer (12 is the callback number).",
  "• \"sold out jollof\" / \"available jollof\" to update your menu.",
  "• Anything else you send (text or voice note) is saved as info Ada can use, e.g. \"We don't deliver on Sundays\".",
].join("\n");

const callbackNote: Record<CallbackResult, string> = {
  calling: "Ada is calling them now with your answer.",
  no_number: "We don't have their number, so they couldn't be called back.",
  not_set_up: "Your Pickam number isn't set up yet, so Ada couldn't call them. Please call them yourself.",
  failed: "Ada couldn't reach them, so we sent your answer by SMS.",
  skipped: "",
};

/** Work out what an owner's message means and act on it. Returns the reply to send back. */
export async function handleOwnerText(b: db.Business, text: string, replyTo?: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "I didn't catch that. Send \"help\" to see what I can do.";
  if (/^(help|menu|\?)$/i.test(trimmed)) return HELP_TEXT;

  // 1. Swipe-reply to an alert, or "#12 answer".
  let esc = replyTo ? db.escalationForWhatsAppMessage(b.id, replyTo) : undefined;
  let answer = trimmed;
  const tagged = trimmed.match(/^#\s*(\d+)[\s:.\-]+([\s\S]+)$/);
  if (!esc && tagged) {
    esc = db.getEscalation(b.id, Number(tagged[1]));
    answer = tagged[2].trim();
    if (!esc) return `I couldn't find callback #${tagged[1]}.`;
  }
  if (esc) {
    if (esc.status === "resolved") return `Callback #${esc.id} was already answered.`;
    const result = await answerEscalation(b, esc, answer, { save: true, callBack: b.settings.aiCallsBack });
    return `✅ Saved your answer to "${esc.question}". ${callbackNote[result]}`.trim();
  }

  // 2. Menu availability.
  const stock = trimmed.match(/^(sold\s*out|finished|out of stock|available|restocked|back)\s*:?\s+(.+)$/i);
  if (stock) {
    const product = matchProduct(db.listProducts(b.id), stock[2]);
    if (!product) return `I couldn't find "${stock[2]}" on your menu.`;
    const available = /^(available|restocked|back)/i.test(stock[1]);
    db.setProductAvailable(b.id, product.id, available);
    return available ? `✅ ${product.name} is available again.` : `✅ ${product.name} marked sold out. Ada will tell callers.`;
  }

  // 3. Anything else teaches the AI.
  db.addFaq(b.id, "", trimmed, "whatsapp");
  return `✅ Saved. Ada will use this when customers ask:\n"${trimmed.slice(0, 300)}"`;
}

/** Entry point for every inbound WhatsApp message. */
export async function handleInboundWhatsApp(msg: InboundMessage): Promise<void> {
  const phone = normalizePhone(msg.from);
  const b = phone ? db.getBusinessByOwnerPhone(phone) : null;
  if (!b) {
    await sendText(msg.from, "Hi! This number is for Pickam business owners. Sign up at pickam.ng to get an AI receptionist for your business.").catch(() => {});
    return;
  }
  if (!msg.text && !msg.audioId) {
    await sendText(b.ownerPhone, "I can read text and voice notes. Send \"help\" to see what I can do.").catch(() => {});
    return;
  }
  let text = msg.text ?? "";
  if (msg.audioId) {
    try {
      const media = await downloadMedia(msg.audioId);
      text = await transcribe(media.data);
    } catch (err) {
      console.error("[whatsapp] voice note failed", err);
      await sendText(b.ownerPhone, "Sorry, I couldn't hear that voice note. Please try again or type it.").catch(() => {});
      return;
    }
    if (!text) {
      await sendText(b.ownerPhone, "That voice note was empty. Please try again.").catch(() => {});
      return;
    }
  }
  const reply = await handleOwnerText(b, text, msg.replyTo);
  await sendText(b.ownerPhone, msg.audioId ? `🎙️ I heard: "${text.slice(0, 300)}"\n\n${reply}` : reply).catch((err) => console.error("[whatsapp] reply failed", err));
}

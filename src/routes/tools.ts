// Endpoints the ElevenLabs voice agent calls *during* a phone call.
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createEscalation, createOrder, getBusiness, listFaqs, listProducts, type Business, type OrderItem } from "../db.js";
import { formatNaira, matchProduct, searchFaqs } from "../knowledge.js";
import { alertOwner } from "../notify.js";

export const toolsRouter = Router();

type ToolRequest = Request & { business?: Business };

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

toolsRouter.use("/:businessId", (req: ToolRequest, res: Response, next: NextFunction) => {
  const business = getBusiness(String(req.params.businessId));
  const secret = req.header("x-tool-secret") ?? "";
  if (!business || !safeEqual(secret, business.toolSecret)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.business = business;
  next();
});

// ElevenLabs sends dynamic variables literally (e.g. "{{system__caller_id}}") when they are not set, as on web test calls.
const dynamicVar = z
  .string()
  .optional()
  .transform((v) => (v && !v.includes("{{") ? v : ""));

toolsRouter.post("/:businessId/business-info", (req: ToolRequest, res) => {
  const b = req.business!;
  const { question } = z.object({ question: z.string().default("") }).parse(req.body ?? {});
  const products = listProducts(b.id);
  const matches = searchFaqs(listFaqs(b.id), question);
  res.json({
    answers: matches.map((m) => ({ question: m.question, answer: m.answer })),
    menu: products.map((p) => ({
      name: p.name,
      price: formatNaira(p.priceNaira),
      available_today: p.available,
      ...(p.description ? { description: p.description } : {}),
    })),
    opening_hours: b.openingHours || undefined,
    delivery: b.deliveryInfo || undefined,
    location: b.location || undefined,
    guidance:
      matches.length === 0
        ? "No saved answer matches this question. If the menu and details above do not answer it, call escalate_to_owner. Do not guess."
        : "Answer using only the information above.",
  });
});

const escalateBody = z.object({
  question: z.string().min(1),
  summary: z.string().default(""),
  customer_name: z.string().default(""),
  callback_phone: z.string().default(""),
  urgency: z.enum(["low", "normal", "urgent"]).catch("normal"),
  caller_phone: dynamicVar,
  conversation_id: dynamicVar,
});

toolsRouter.post("/:businessId/escalate", (req: ToolRequest, res) => {
  const b = req.business!;
  const body = escalateBody.parse(req.body ?? {});
  const customerPhone = body.callback_phone || body.caller_phone;
  const esc = createEscalation(
    b.id,
    {
      conversation_id: body.conversation_id || null,
      customer_name: body.customer_name,
      customer_phone: customerPhone,
      question: body.question,
      summary: body.summary,
      urgency: body.urgency,
    },
    b.settings.callbackMinutes,
  );
  void alertOwner(b, {
    kind: "escalation",
    urgency: body.urgency,
    title: `${body.customer_name || "A customer"} needs you${customerPhone ? ` (${customerPhone})` : ""}`,
    body: `${body.question}${body.summary ? `\nContext: ${body.summary}` : ""}\nCall back within ${b.settings.callbackMinutes} min.`,
    refId: esc.id,
  });
  res.json({
    ok: true,
    say_to_caller: `The owner has been notified and will call back within ${b.settings.callbackMinutes} minutes${
      customerPhone ? "" : ". Ask the caller for the best number to reach them"
    }.`,
  });
});

const orderBody = z.object({
  customer_name: z.string().default(""),
  items: z.array(z.object({ name: z.string(), quantity: z.coerce.number().int().positive() })).min(1),
  delivery_address: z.string().default(""),
  notes: z.string().default(""),
  caller_phone: dynamicVar,
  conversation_id: dynamicVar,
});

toolsRouter.post("/:businessId/order", (req: ToolRequest, res) => {
  const b = req.business!;
  if (!b.settings.takeOrders) {
    res.json({ ok: false, say_to_caller: "Orders are not taken by phone. Call escalate_to_owner so the owner can call back." });
    return;
  }
  const body = orderBody.parse(req.body ?? {});
  const products = listProducts(b.id);
  const items: OrderItem[] = [];
  const problems: string[] = [];
  for (const item of body.items) {
    const product = matchProduct(products, item.name);
    if (!product) problems.push(`"${item.name}" is not on the menu`);
    else if (!product.available) problems.push(`${product.name} is not available today`);
    else items.push({ name: product.name, quantity: item.quantity, unitPriceNaira: product.priceNaira });
  }
  if (problems.length) {
    res.json({ ok: false, problems, say_to_caller: `Tell the caller: ${problems.join("; ")}. Offer something else from the menu.` });
    return;
  }
  const order = createOrder(b.id, {
    conversationId: body.conversation_id || null,
    customerName: body.customer_name,
    customerPhone: body.caller_phone,
    items,
    deliveryAddress: body.delivery_address,
    notes: body.notes,
  });
  const lines = items.map((i) => `${i.quantity} x ${i.name}`).join(", ");
  void alertOwner(b, {
    kind: "order",
    urgency: "normal",
    title: `New order #${order.id} - ${formatNaira(order.totalNaira)}`,
    body: `${body.customer_name} ${body.caller_phone}: ${lines}. Deliver to: ${body.delivery_address}${body.notes ? `. Notes: ${body.notes}` : ""}`,
    refId: order.id,
  });
  res.json({
    ok: true,
    order_number: order.id,
    total: formatNaira(order.totalNaira),
    items: lines,
    payment_instructions: b.settings.paymentInstructions || "The owner will confirm payment details when they call to confirm the order.",
    note: b.deliveryInfo ? `Delivery info: ${b.deliveryInfo}` : undefined,
  });
});

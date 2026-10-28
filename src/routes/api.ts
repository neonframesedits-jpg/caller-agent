// Owner dashboard API (Bearer owner token) and admin onboarding (x-admin-key).
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { config } from "../config.js";
import * as db from "../db.js";
import { syncAgent } from "../elevenlabs.js";
import { alertBus, type OwnerAlert } from "../notify.js";
import { usageSummary } from "../plans.js";

export const apiRouter = Router();

type OwnerRequest = Request & { business?: db.Business };

// ---- Admin: onboard a new business ---------------------------------------------------

apiRouter.post("/admin/businesses", (req, res) => {
  if (!config.adminKey || req.header("x-admin-key") !== config.adminKey) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = z
    .object({ name: z.string().min(1), ownerName: z.string().optional(), ownerPhone: z.string().optional(), plan: z.string().optional() })
    .parse(req.body);
  const b = db.createBusiness(body);
  res.status(201).json({ id: b.id, ownerToken: b.ownerToken, dashboard: `${config.publicUrl}/?token=${b.ownerToken}` });
});

// ---- Owner auth ---------------------------------------------------------------------------

function ownerAuth(req: OwnerRequest, res: Response, next: NextFunction) {
  // EventSource cannot send headers, so the live alert stream accepts ?token= as well.
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") || (req.query.token as string | undefined) || "";
  const business = token ? db.getBusinessByToken(token) : null;
  if (!business) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.business = business;
  next();
}

apiRouter.use("/api", ownerAuth);
const id = (req: Request) => Number(req.params.id);

// ---- Business profile & settings ------------------------------------------------------------

const publicBusiness = (b: db.Business) => {
  const { ownerToken, toolSecret, ...rest } = b;
  return rest;
};

apiRouter.get("/api/business", (req: OwnerRequest, res) => {
  const b = req.business!;
  res.json({ business: publicBusiness(b), usage: usageSummary(b.plan, db.minutesUsedThisMonth(b.id)) });
});

const profileSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    category: z.string(),
    location: z.string(),
    openingHours: z.string(),
    deliveryInfo: z.string(),
    ownerName: z.string(),
    ownerPhone: z.string(),
  })
  .partial();

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const alertMode = z.enum(["ring", "notify", "digest"]);
const settingsSchema = z
  .object({
    agentName: z.string().min(1),
    greeting: z.string().min(1),
    languageStyle: z.enum(["english", "pidgin"]),
    callbackMinutes: z.number().int().min(1).max(24 * 60),
    alerts: z.object({ low: alertMode, normal: alertMode, urgent: alertMode }),
    smsAlerts: z.boolean(),
    quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
    takeOrders: z.boolean(),
    paymentInstructions: z.string(),
    extraRules: z.string(),
  })
  .partial();

apiRouter.put("/api/business", (req: OwnerRequest, res) => {
  const body = z.object({ profile: profileSchema.optional(), settings: settingsSchema.optional() }).parse(req.body);
  const b = db.updateBusiness(req.business!.id, body.profile ?? {}, body.settings);
  res.json({ business: publicBusiness(b) });
});

/** Push the latest profile/settings to the ElevenLabs agent (creates it the first time). */
apiRouter.post("/api/agent/sync", async (req: OwnerRequest, res) => {
  const b = req.business!;
  try {
    const agentId = await syncAgent(b);
    if (agentId !== b.agentId) db.setAgentId(b.id, agentId);
    res.json({ agentId });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// ---- Knowledge base -------------------------------------------------------------------------

apiRouter.get("/api/faqs", (req: OwnerRequest, res) => res.json(db.listFaqs(req.business!.id)));

apiRouter.post("/api/faqs", (req: OwnerRequest, res) => {
  const { question, answer } = z.object({ question: z.string().min(1), answer: z.string().min(1) }).parse(req.body);
  res.status(201).json({ id: db.addFaq(req.business!.id, question, answer) });
});

apiRouter.delete("/api/faqs/:id", (req: OwnerRequest, res) => {
  db.deleteFaq(req.business!.id, id(req));
  res.status(204).end();
});

apiRouter.get("/api/products", (req: OwnerRequest, res) => res.json(db.listProducts(req.business!.id)));

apiRouter.post("/api/products", (req: OwnerRequest, res) => {
  const p = z
    .object({ name: z.string().min(1), priceNaira: z.number().int().nonnegative(), description: z.string().default(""), available: z.boolean().default(true) })
    .parse(req.body);
  res.status(201).json({ id: db.addProduct(req.business!.id, p) });
});

/** Toggle "sold out for today" - the AI sees this immediately on the next call. */
apiRouter.patch("/api/products/:id", (req: OwnerRequest, res) => {
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  db.setProductAvailable(req.business!.id, id(req), available);
  res.status(204).end();
});

apiRouter.delete("/api/products/:id", (req: OwnerRequest, res) => {
  db.deleteProduct(req.business!.id, id(req));
  res.status(204).end();
});

// ---- Escalations (owner hand-off) -----------------------------------------------------------

apiRouter.get("/api/escalations", (req: OwnerRequest, res) => {
  const status = z.enum(["open", "acknowledged", "resolved"]).optional().parse(req.query.status || undefined);
  res.json(db.listEscalations(req.business!.id, status));
});

apiRouter.patch("/api/escalations/:id", (req: OwnerRequest, res) => {
  const b = req.business!;
  const body = z
    .object({
      status: z.enum(["open", "acknowledged", "resolved"]),
      ownerAnswer: z.string().optional(),
      // The owner's answer becomes a saved FAQ, so the AI can answer it alone next time.
      saveAsFaq: z.boolean().default(false),
    })
    .parse(req.body);
  const esc = db.getEscalation(b.id, id(req));
  if (!esc) {
    res.status(404).json({ error: "not found" });
    return;
  }
  db.updateEscalation(b.id, esc.id, body.status, body.ownerAnswer);
  if (body.saveAsFaq && body.ownerAnswer) db.addFaq(b.id, esc.question, body.ownerAnswer, "learned");
  res.json(db.getEscalation(b.id, esc.id));
});

// ---- Orders & calls -------------------------------------------------------------------------

apiRouter.get("/api/orders", (req: OwnerRequest, res) => res.json(db.listOrders(req.business!.id)));

apiRouter.patch("/api/orders/:id", (req: OwnerRequest, res) => {
  const { status } = z.object({ status: z.enum(["new", "confirmed", "delivered", "cancelled"]) }).parse(req.body);
  db.updateOrderStatus(req.business!.id, id(req), status);
  res.status(204).end();
});

apiRouter.get("/api/calls", (req: OwnerRequest, res) => res.json(db.listCalls(req.business!.id)));

apiRouter.get("/api/calls/:conversationId", (req: OwnerRequest, res) => {
  const call = db.getCall(req.business!.id, String(req.params.conversationId));
  if (call) res.json(call);
  else res.status(404).json({ error: "not found" });
});

// ---- Live alerts (Server-Sent Events) -------------------------------------------------------

apiRouter.get("/api/alerts/stream", (req: OwnerRequest, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(": connected\n\n");
  const channel = `business:${req.business!.id}`;
  const send = (alert: OwnerAlert) => res.write(`data: ${JSON.stringify(alert)}\n\n`);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 25_000);
  alertBus.on(channel, send);
  req.on("close", () => {
    clearInterval(keepAlive);
    alertBus.off(channel, send);
  });
});

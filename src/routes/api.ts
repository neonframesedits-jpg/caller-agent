// Owner dashboard API (Bearer session token), phone login, and admin endpoints (x-admin-key).
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { AuthError, requestCode, verifyCode } from "../auth.js";
import { MIN_TOPUP_NAIRA, setupPayout, startCheckout } from "../billing.js";
import * as db from "../db.js";
import { syncAgent } from "../elevenlabs.js";
import { answerEscalation } from "../escalations.js";
import { alertBus, type OwnerAlert } from "../notify.js";
import { NoNumbersError, addNumberToPool, provisionNumber } from "../numbers.js";
import * as paystack from "../paystack.js";
import { forwardingCodes, normalizePhone } from "../phone.js";
import { PLANS, usageFor } from "../plans.js";
import { whatsappConfigured } from "../whatsapp.js";

export const apiRouter = Router();

type OwnerRequest = Request & { business?: db.Business; sessionToken?: string };

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

// ---- Phone login ----------------------------------------------------------------------------

apiRouter.post("/auth/code", async (req, res) => {
  const { phone } = z.object({ phone: z.string() }).parse(req.body);
  try {
    res.json(await requestCode(phone));
  } catch (err) {
    if (err instanceof AuthError) fail(res, err.status, err.message);
    else throw err;
  }
});

apiRouter.post("/auth/verify", (req, res) => {
  const { phone, code } = z.object({ phone: z.string(), code: z.string() }).parse(req.body);
  try {
    res.json(verifyCode(phone, code));
  } catch (err) {
    if (err instanceof AuthError) fail(res, err.status, err.message);
    else throw err;
  }
});

// ---- Admin ------------------------------------------------------------------------------------

function adminAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.adminKey || req.header("x-admin-key") !== config.adminKey) return void fail(res, 401, "unauthorized");
  next();
}

apiRouter.post("/admin/businesses", adminAuth, (req, res) => {
  const body = z
    .object({ name: z.string().min(1), ownerName: z.string().optional(), ownerPhone: z.string().optional(), plan: z.string().optional() })
    .parse(req.body);
  const ownerPhone = body.ownerPhone ? normalizePhone(body.ownerPhone) : "";
  if (ownerPhone === null) return void fail(res, 400, "invalid ownerPhone");
  const b = db.createBusiness({ ...body, ownerPhone });
  res.status(201).json({ id: b.id, ownerToken: b.ownerToken, dashboard: `${config.publicUrl}/?token=${b.ownerToken}` });
});

/** Add a number bought from the SIP provider to the pool handed out at onboarding. */
apiRouter.post("/admin/numbers", adminAuth, async (req, res) => {
  const { number } = z.object({ number: z.string() }).parse(req.body);
  try {
    res.status(201).json(await addNumberToPool(number));
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

apiRouter.get("/admin/numbers", adminAuth, (_req, res) => res.json(db.listPoolNumbers()));

// ---- Owner auth ---------------------------------------------------------------------------

function ownerAuth(req: OwnerRequest, res: Response, next: NextFunction) {
  // EventSource cannot send headers, so the live alert stream accepts ?token= as well.
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") || (req.query.token as string | undefined) || "";
  // Session tokens come from phone login; the owner token is the admin-issued magic link.
  const business = token ? db.getBusinessBySession(token) ?? db.getBusinessByToken(token) : null;
  if (!business) return void fail(res, 401, "unauthorized");
  req.business = business;
  req.sessionToken = token;
  next();
}

apiRouter.use("/api", ownerAuth);
const id = (req: Request) => Number(req.params.id);

apiRouter.post("/api/logout", (req: OwnerRequest, res) => {
  db.deleteSession(req.sessionToken!);
  res.status(204).end();
});

// ---- Business profile & settings ------------------------------------------------------------

const publicBusiness = (b: db.Business) => {
  const { ownerToken, toolSecret, paystackSubaccount, ...rest } = b;
  return { ...rest, greetingPreview: db.greetingFor(b), payoutConnected: !!paystackSubaccount };
};

apiRouter.get("/api/business", (req: OwnerRequest, res) => {
  const b = req.business!;
  res.json({
    business: publicBusiness(b),
    usage: usageFor(b),
    plans: Object.values(PLANS).filter((p) => p.purchasable),
    forwardingCodes: b.phoneNumber ? forwardingCodes(b.phoneNumber) : [],
    features: { payments: paystack.paystackConfigured(), whatsapp: whatsappConfigured(), minTopUpNaira: MIN_TOPUP_NAIRA },
  });
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
  })
  .partial();

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const alertMode = z.enum(["ring", "notify", "digest"]);
const settingsSchema = z
  .object({
    agentName: z.string().min(1),
    greeting: z.string(),
    languageStyle: z.enum(["english", "pidgin"]),
    callbackMinutes: z.number().int().min(1).max(24 * 60),
    alerts: z.object({ low: alertMode, normal: alertMode, urgent: alertMode }),
    whatsappAlerts: z.boolean(),
    smsAlerts: z.boolean(),
    quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
    apologySms: z.boolean(),
    aiCallsBack: z.boolean(),
    dailySummary: z.object({ enabled: z.boolean(), time: hhmm }),
    takeOrders: z.boolean(),
    paymentLinks: z.boolean(),
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
    fail(res, 502, (err as Error).message);
  }
});

// ---- Onboarding & phone number --------------------------------------------------------------

async function provision(b: db.Business, res: Response) {
  try {
    res.json(await provisionNumber(b));
  } catch (err) {
    if (err instanceof NoNumbersError) fail(res, 503, err.message);
    else fail(res, 502, `Could not set up your number: ${(err as Error).message}`);
  }
}

/** Finish the signup wizard, then hand out a Pickam number. */
apiRouter.post("/api/onboarding/complete", async (req: OwnerRequest, res) => {
  const b = req.business!;
  if (!b.name) return void fail(res, 400, "Add your business name first.");
  db.setBusinessFields(b.id, { onboarded: 1 });
  await provision(db.getBusiness(b.id)!, res);
});

apiRouter.post("/api/number/provision", (req: OwnerRequest, res) => provision(req.business!, res));

// ---- Billing ----------------------------------------------------------------------------------

apiRouter.post("/api/billing/checkout", async (req: OwnerRequest, res) => {
  const body = z.union([z.object({ plan: z.string() }), z.object({ walletAmountNaira: z.number().int() })]).parse(req.body);
  try {
    const checkout = await startCheckout(
      req.business!,
      "plan" in body ? { kind: "plan", plan: body.plan } : { kind: "wallet", amountNaira: body.walletAmountNaira },
    );
    res.json(checkout);
  } catch (err) {
    fail(res, 400, (err as Error).message);
  }
});

apiRouter.get("/api/billing/ledger", (req: OwnerRequest, res) => res.json(db.listWalletLedger(req.business!.id)));

// ---- Payouts (customers pay the business by link) -----------------------------------------

apiRouter.get("/api/payouts/banks", async (_req, res) => {
  try {
    res.json(await paystack.listBanks());
  } catch (err) {
    fail(res, 502, (err as Error).message);
  }
});

apiRouter.post("/api/payouts", async (req: OwnerRequest, res) => {
  const { bankCode, accountNumber } = z.object({ bankCode: z.string().min(1), accountNumber: z.string().regex(/^\d{10}$/) }).parse(req.body);
  try {
    res.json({ accountName: await setupPayout(req.business!, bankCode, accountNumber) });
  } catch (err) {
    fail(res, 400, `Could not connect that account: ${(err as Error).message}`);
  }
});

// ---- Knowledge base -------------------------------------------------------------------------

apiRouter.get("/api/faqs", (req: OwnerRequest, res) => res.json(db.listFaqs(req.business!.id)));

apiRouter.post("/api/faqs", (req: OwnerRequest, res) => {
  const { question, answer } = z.object({ question: z.string().default(""), answer: z.string().min(1) }).parse(req.body);
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

apiRouter.patch("/api/escalations/:id", async (req: OwnerRequest, res) => {
  const b = req.business!;
  const body = z
    .object({
      status: z.enum(["open", "acknowledged", "resolved"]),
      ownerAnswer: z.string().optional(),
      // The owner's answer becomes a saved FAQ, so the AI can answer it alone next time.
      saveAsFaq: z.boolean().default(false),
      // The AI phones the customer with the answer.
      callBack: z.boolean().default(false),
    })
    .parse(req.body);
  const esc = db.getEscalation(b.id, id(req));
  if (!esc) return void fail(res, 404, "not found");
  let callback = null;
  if (body.status === "resolved" && body.ownerAnswer) {
    callback = await answerEscalation(b, esc, body.ownerAnswer, { save: body.saveAsFaq, callBack: body.callBack });
  } else {
    db.updateEscalation(b.id, esc.id, body.status, body.ownerAnswer);
  }
  res.json({ escalation: db.getEscalation(b.id, esc.id), callback });
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
  else fail(res, 404, "not found");
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

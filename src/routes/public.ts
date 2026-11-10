// Landing-page endpoints: early-access waitlist and the public config the page reads.
import { Router, type Request } from "express";
import { z } from "zod";
import { config } from "../config.js";
import * as db from "../db.js";
import { DemoUnavailable, demoAgentId, demoConfigured, startDemoCall } from "../demo.js";
import { normalizePhone } from "../phone.js";

export const publicRouter = Router();

// Simple per-IP limit so a bot can't flood the waitlist. In memory: fine for one instance.
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { start: number; count: number }>();

function allow(req: Request): boolean {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  h.count++;
  return h.count <= MAX_PER_WINDOW;
}

publicRouter.get("/public-config", (_req, res) => {
  res.json({
    signupsOpen: config.signupsOpen,
    waitlistCount: db.waitlistCount(),
    demoAvailable: demoConfigured() && !!demoAgentId(),
    demoMaxSeconds: config.demo.maxCallSeconds,
  });
});

const joinSchema = z.object({
  name: z.string().trim().min(1).max(80),
  businessName: z.string().trim().min(1).max(120),
  phone: z.string().max(30),
  category: z.string().trim().max(60).default(""),
  city: z.string().trim().max(60).default(""),
  source: z.string().trim().max(60).default(""),
  referredBy: z.coerce.number().int().positive().optional().catch(undefined),
  // Honeypot: real people never see or fill this field.
  website: z.string().optional(),
});

publicRouter.post("/waitlist", (req, res) => {
  if (!allow(req)) {
    res.status(429).json({ error: "Too many tries. Please try again later." });
    return;
  }
  const body = joinSchema.parse(req.body);
  if (body.website) {
    res.json({ position: db.waitlistCount() + 1, alreadyJoined: false });
    return;
  }
  const phone = normalizePhone(body.phone);
  if (!phone) {
    res.status(400).json({ error: "Enter a valid Nigerian phone number, e.g. 0803 123 4567." });
    return;
  }
  const result = db.joinWaitlist({
    name: body.name,
    business_name: body.businessName,
    phone,
    category: body.category,
    city: body.city,
    source: body.source.toLowerCase(),
    referred_by: body.referredBy && db.waitlistExists(body.referredBy) ? body.referredBy : null,
  });
  res.status(result.alreadyJoined ? 200 : 201).json({ ...result, shareUrl: `${config.publicUrl}/?ref=friend&by=${result.id}` });
});

/** Start a "Talk to Ada" demo call: returns a one-time URL the browser connects to. */
publicRouter.post("/demo/session", async (req, res) => {
  try {
    res.json({ signedUrl: await startDemoCall(req.ip ?? "unknown"), maxSeconds: config.demo.maxCallSeconds });
  } catch (err) {
    if (err instanceof DemoUnavailable) res.status(err.status).json({ error: err.message });
    else {
      console.error("[demo]", err);
      res.status(502).json({ error: "Ada couldn't pick up just now. Please try again in a minute." });
    }
  }
});

/** Export the waitlist: JSON by default, or CSV with ?format=csv (opens in Excel / Google Sheets). */
publicRouter.get("/admin/waitlist", (req, res) => {
  if (!config.adminKey || (req.header("x-admin-key") ?? req.query.key) !== config.adminKey) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const rows = db.listWaitlist();
  if (req.query.format !== "csv") {
    res.json(rows);
    return;
  }
  const cols = ["id", "created_at", "name", "business_name", "phone", "category", "city", "source", "referred_by", "referrals"] as const;
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  res.type("text/csv").attachment("pickam-waitlist.csv");
  res.send([cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n"));
});

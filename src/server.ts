import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { apiRouter } from "./routes/api.js";
import { publicRouter } from "./routes/public.js";
import { toolsRouter } from "./routes/tools.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { startScheduler } from "./scheduler.js";
import { ensureDemoAgent } from "./demo.js";
import { syncPoolNumbersFromConfig } from "./numbers.js";

export function createApp() {
  const app = express();
  // Railway (and most hosts) sit behind one proxy; this makes req.ip the visitor's address.
  app.set("trust proxy", 1);
  const publicDir = fileURLToPath(new URL("../public", import.meta.url));
  // Webhooks need the raw body for signature checks, so they are mounted before the JSON parser.
  app.use("/webhooks", webhooksRouter);
  app.use(express.json({ limit: "1mb" }));
  app.use("/tools", toolsRouter);
  app.use(publicRouter);
  app.use(apiRouter);
  // "/" is the landing page (public/index.html); "/app" is the owner dashboard.
  app.get("/app", (_req, res) => res.sendFile("app.html", { root: publicDir }));
  app.use(express.static(publicDir));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "invalid request", issues: err.issues });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  getDb();
  startScheduler();
  syncPoolNumbersFromConfig()
    .then((added) => added.length && console.log(`Ada's lines ready: ${added.join(", ")}`))
    .catch((err) => console.error("[numbers] could not set up POOL_NUMBERS:", err.message));
  ensureDemoAgent()
    .then((id) => id && console.log(`Website demo agent ready: ${id}`))
    .catch((err) => console.error("[demo] could not set up the website demo agent:", err.message));
  createApp().listen(config.port, () => console.log(`Pickam listening on http://localhost:${config.port}`));
}

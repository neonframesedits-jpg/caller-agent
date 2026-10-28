import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { apiRouter } from "./routes/api.js";
import { toolsRouter } from "./routes/tools.js";
import { webhooksRouter } from "./routes/webhooks.js";

export function createApp() {
  const app = express();
  // Webhooks need the raw body for signature checks, so they are mounted before the JSON parser.
  app.use("/webhooks", webhooksRouter);
  app.use(express.json({ limit: "1mb" }));
  app.use("/tools", toolsRouter);
  app.use(apiRouter);
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
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
  createApp().listen(config.port, () => console.log(`Pickam listening on http://localhost:${config.port}`));
}

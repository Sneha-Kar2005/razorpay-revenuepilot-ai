import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./lib/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { casesRouter } from "./routes/cases.js";
import { analyticsRouter } from "./routes/analytics.js";
import { auditRouter } from "./routes/audit.js";
import { demoRouter } from "./routes/demo.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { metaRouter } from "./routes/meta.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Webhook route needs the RAW body for HMAC signature verification, so it
  // is mounted with express.raw() BEFORE the global express.json() parser.
  app.use("/webhooks", express.raw({ type: "*/*", limit: "1mb" }), webhooksRouter);

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "revenuepilot-backend", time: new Date().toISOString() }));
  app.use("/api/meta", metaRouter);
  app.use("/api/recovery/cases", casesRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/demo", demoRouter);

  app.use(errorHandler);

  return app;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`RevenuePilot backend listening on http://localhost:${env.port} (mode: ${env.nodeEnv})`);
  });
}

import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "validation_error", details: err.issues });
  }
  const message = err instanceof Error ? err.message : "internal_error";
  console.error("[error]", err);
  res.status(500).json({ error: "internal_error", message: process.env.NODE_ENV === "production" ? undefined : message });
};

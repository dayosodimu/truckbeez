import type { NextFunction, Request, Response } from "express";

/**
 * DEVELOPMENT ONLY. Identifies the caller from the x-user-id / x-user-name headers.
 * Replace with real driver accounts (BR-3) before beta. Refuses to run in production.
 */
export type AuthedRequest = Request & { userId: string; userName: string };

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH !== "true") {
    return res.status(503).json({ error: "Fleet sign-in isn't configured on this server." });
  }
  const id = req.header("x-user-id");
  if (!id) return res.status(401).json({ error: "Sign in to use TruckBeez Fleet." });
  const r = req as AuthedRequest;
  r.userId = id;
  r.userName = (req.header("x-user-name") ?? "Driver").slice(0, 60);
  next();
}

export const caller = (req: Request) => req as AuthedRequest;

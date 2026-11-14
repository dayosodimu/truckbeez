import { Router, type Response } from "express";
import {
  MESSAGES,
  routeRequestSchema,
  type ApiError,
  type ApiErrorCode,
  type RouteResponse,
} from "../contracts/route.js";
import { hazmatSafetyAssumptions } from "./hazmat.js";
import { RoutingProviderError, type RoutingProvider } from "./types.js";

export type RouteLogger = Pick<Console, "warn" | "error">;

export const sendError = (res: Response, status: number, code: ApiErrorCode, message: string, details?: unknown) => {
  const body: ApiError = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  res.status(status).json(body);
};

/** `POST /api/route`: UC-03 plan a truck-safe route, UC-04 no truck-safe route available. */
export function createRouteRouter(provider: RoutingProvider, logger: RouteLogger = console): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = routeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_REQUEST", MESSAGES.invalidRequest, parsed.error.flatten());
      return;
    }

    try {
      const result = await provider.route(parsed.data);
      // Reported on success and on 422: an assumption may be why the route is longer, or missing.
      const safetyAssumptions = hazmatSafetyAssumptions(parsed.data.truck.hazmatClasses);
      if (result.kind === "no_safe_route") {
        // 422 with no geometry at all: the app must have nothing to draw.
        sendError(res, 422, "NO_SAFE_ROUTE", MESSAGES.noSafeRoute, { reasons: result.reasons, safetyAssumptions });
        return;
      }
      const body: RouteResponse = { ...result.route, safetyAssumptions };
      res.json(body);
    } catch (error) {
      if (error instanceof RoutingProviderError) {
        // Provider error messages never contain the key or the HERE response body.
        logger.warn(JSON.stringify({ msg: "routing provider error", provider: provider.name, detail: error.message }));
        sendError(res, 502, "ROUTING_PROVIDER_ERROR", MESSAGES.routingProviderError);
        return;
      }
      logger.error(JSON.stringify({ msg: "unexpected routing error", provider: provider.name }));
      sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
    }
  });

  return router;
}

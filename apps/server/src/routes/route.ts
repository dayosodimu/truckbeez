import { Router } from "express";
import { z } from "zod";
import {
  HERE_HAZARDOUS_GOODS,
  NO_SAFE_ROUTE_MESSAGE,
  TUNNEL_CATEGORIES,
} from "../lib/hereRouting.js";
import { getTruckRoute, RoutingProviderError } from "../lib/routing.js";

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const body = z.object({
  origin: latLng,
  destination: latLng,
  profile: z.object({
    heightCm: z.number().positive(),
    widthCm: z.number().positive(),
    lengthCm: z.number().positive(),
    grossWeightKg: z.number().positive(),
    axleCount: z.number().int().min(2),
    // An unknown hazmat value is rejected, never silently dropped: dropping it would
    // route the truck as if it carried nothing.
    hazmat: z.array(z.enum(HERE_HAZARDOUS_GOODS)).default([]),
    tunnelCategory: z.enum(TUNNEL_CATEGORIES).optional(),
  }),
});

export const routeRouter = Router();

routeRouter.post("/", async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { origin, destination, profile } = parsed.data;
  try {
    const outcome = await getTruckRoute(origin, destination, profile);
    if (outcome.kind === "no_safe_route") {
      // 422 with no geometry at all: the app must have nothing to draw (UC-04).
      return res
        .status(422)
        .json({ error: NO_SAFE_ROUTE_MESSAGE, code: "NO_SAFE_ROUTE", reasons: outcome.reasons });
    }
    return res.json(outcome.route);
  } catch (err) {
    if (err instanceof RoutingProviderError) {
      console.error(`routing provider error: ${err.message}`);
      return res
        .status(502)
        .json({ error: "Routing is unavailable right now. Try again.", code: "ROUTING_UNAVAILABLE" });
    }
    console.error("unexpected routing error", err);
    return res.status(500).json({ error: "Something went wrong while routing.", code: "INTERNAL" });
  }
});

import { Router } from "express";
import { z } from "zod";
import { getTruckRoute } from "../lib/routing.js";

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
    hazmat: z.array(z.string()).default([]),
  }),
});

export const routeRouter = Router();

routeRouter.post("/", async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { origin, destination, profile } = parsed.data;
    res.json(await getTruckRoute(origin, destination, profile));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

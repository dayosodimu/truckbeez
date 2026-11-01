import { Router } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { noteReportFiled } from "../fleet/store.js";
import { confirmReport, createReport, listNearby } from "../lib/store.js";
import { REPORT_TYPES } from "../types.js";

const createBody = z.object({
  type: z.enum(REPORT_TYPES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().max(140).optional(),
});

export function reportsRouter(io: Server) {
  const router = Router();

  router.get("/", (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 50);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng query parameters are required." });
    }
    res.json(listNearby({ lat, lng }, radiusKm));
  });

  router.post("/", (req, res) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { type, lat, lng, note } = parsed.data;
    const report = createReport(type, { lat, lng }, note);
    const userId = req.header("x-user-id");
    if (userId) noteReportFiled(userId); // counts toward the driver's fleet trip report
    io.emit("report:new", report);
    res.status(201).json(report);
  });

  router.post("/:id/confirm", (req, res) => {
    const report = confirmReport(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found or already expired." });
    io.emit("report:updated", report);
    res.json(report);
  });

  return router;
}

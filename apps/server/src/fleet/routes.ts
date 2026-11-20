import { Router, type NextFunction, type Request, type Response } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { caller, requireUser } from "./auth.js";
import { startCheckout } from "./billing.js";
import { PLANS } from "./plans.js";
import {
  createInvite,
  createOrg,
  FleetError,
  fleetDrivers,
  fleetReport,
  getMember,
  getOrg,
  isActive,
  joinFleet,
  leaveFleet,
  recordPosition,
  reportCsv,
  setDuty,
  tripsFor,
} from "./store.js";
import type { Member, Org } from "./types.js";

const DAY = 86_400_000;
export const orgRoom = (orgId: string) => `org:${orgId}`;

type Handler = (req: Request, res: Response) => unknown;
const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      if (err instanceof FleetError) return res.status(err.status).json({ error: err.message });
      next(err);
    });

/** Returns the schema's OUTPUT type, so `.default()` fields are required after parsing. */
const parse = <S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> => {
  const r = schema.safeParse(body);
  if (!r.success) throw new FleetError(400, r.error.issues[0]?.message ?? "Invalid request.");
  return r.data;
};

/** Owners and dispatchers with an active plan. */
function manager(req: Request): { m: Member; org: Org } {
  const m = getMember(caller(req).userId);
  if (!m || m.role === "driver") throw new FleetError(403, "Only fleet owners and dispatchers can see this.");
  const org = getOrg(m.orgId)!;
  if (!isActive(org)) throw new FleetError(402, "Your Fleet plan is inactive. Renew it to see your drivers.");
  return { m, org };
}

function owner(req: Request): { m: Member; org: Org } {
  const m = getMember(caller(req).userId);
  if (!m || m.role !== "owner") throw new FleetError(403, "Only the fleet owner can do this.");
  return { m, org: getOrg(m.orgId)! };
}

function range(q: Request["query"]) {
  const to = Number(q.to ?? Date.now());
  const from = Number(q.from ?? to - 7 * DAY);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new FleetError(400, "Invalid date range.");
  if (to - from > 92 * DAY) throw new FleetError(400, "Reports cover up to 92 days at a time.");
  return { from, to };
}

function meView(userId: string) {
  const member = getMember(userId) ?? null;
  const org = member ? getOrg(member.orgId) ?? null : null;
  return { member, org, plan: org ? PLANS[org.plan] : null, active: org ? isActive(org) : false };
}

const latLng = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) };

export function fleetRouter(io: Server) {
  const r = Router();

  r.get("/plans", (_req, res) => res.json(Object.values(PLANS)));

  r.use(requireUser);

  r.get("/me", handle((req, res) => res.json(meView(caller(req).userId))));

  r.post(
    "/orgs",
    handle((req, res) => {
      const body = parse(
        z.object({ name: z.string().trim().min(2, "Enter your company name.").max(80), plan: z.enum(["starter", "pro", "enterprise"]) }),
        req.body
      );
      const { userId, userName } = caller(req);
      createOrg(userId, userName, body.name, body.plan);
      res.status(201).json(meView(userId));
    })
  );

  r.post(
    "/invites",
    handle((req, res) => {
      const { m, org } = owner(req);
      if (!isActive(org)) throw new FleetError(402, "Your Fleet plan is inactive. Renew it to invite drivers.");
      const invite = createInvite(org.id, m.userId);
      res.status(201).json({ code: invite.code, expiresAt: invite.expiresAt });
    })
  );

  r.post(
    "/join",
    handle((req, res) => {
      const body = parse(
        z.object({
          code: z.string().trim().min(4).max(12),
          consent: z.literal(true, { errorMap: () => ({ message: "You need to agree to share your location while on duty." }) }),
        }),
        req.body
      );
      const { userId, userName } = caller(req);
      joinFleet(body.code, userId, userName);
      res.status(201).json(meView(userId));
    })
  );

  r.post(
    "/leave",
    handle((req, res) => {
      const { userId } = caller(req);
      const m = leaveFleet(userId);
      io.to(orgRoom(m.orgId)).emit("fleet:status", { driverId: userId, status: "left" });
      res.json({ ok: true });
    })
  );

  r.post(
    "/duty",
    handle((req, res) => {
      const { onDuty } = parse(z.object({ onDuty: z.boolean() }), req.body);
      const { userId } = caller(req);
      const { member, status } = setDuty(userId, onDuty);
      io.to(orgRoom(member.orgId)).emit("fleet:status", { driverId: userId, status });
      res.json(meView(userId));
    })
  );

  r.post(
    "/positions",
    handle((req, res) => {
      const body = parse(
        z.object({
          ...latLng,
          speedKph: z.number().min(0).max(250).default(0),
          heading: z.number().min(0).max(360).optional(),
          offRoute: z.boolean().optional(),
        }),
        req.body
      );
      const { userId } = caller(req);
      const { member, position, status, accepted } = recordPosition(userId, body);
      if (accepted) io.to(orgRoom(member.orgId)).emit("fleet:position", { driverId: userId, position, status });
      res.json({ ok: true, accepted });
    })
  );

  r.get(
    "/drivers",
    handle((req, res) => {
      const { org } = manager(req);
      res.json(fleetDrivers(org.id));
    })
  );

  r.get(
    "/drivers/:driverId/trips",
    handle((req, res) => {
      const { org } = manager(req);
      const driver = getMember(req.params.driverId);
      if (!driver || driver.orgId !== org.id) throw new FleetError(404, "Driver not found in your fleet.");
      const { from, to } = range(req.query);
      const withPath = req.query.path === "true" && PLANS[org.plan].features.routeReplay;
      res.json(tripsFor(org.id, driver.userId, from, to, withPath));
    })
  );

  r.get(
    "/reports/summary",
    handle((req, res) => {
      const { org } = manager(req);
      const { from, to } = range(req.query);
      res.json(fleetReport(org.id, from, to));
    })
  );

  r.get(
    "/reports/export.csv",
    handle((req, res) => {
      const { org } = manager(req);
      if (!PLANS[org.plan].features.csvExport) throw new FleetError(402, "CSV export is part of Fleet Pro.");
      const { from, to } = range(req.query);
      res.type("text/csv").attachment("truckbeez-fleet-report.csv").send(reportCsv(fleetReport(org.id, from, to)));
    })
  );

  r.post(
    "/billing/checkout",
    handle(async (req, res) => {
      const { org } = owner(req);
      const { seats } = parse(z.object({ seats: z.number().int().min(1) }), req.body);
      res.json(await startCheckout(org, seats));
    })
  );

  return r;
}

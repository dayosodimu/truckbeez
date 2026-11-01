import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { stripeWebhook } from "./fleet/billing.js";
import { fleetRouter, orgRoom } from "./fleet/routes.js";
import { getMember, pruneFleet } from "./fleet/store.js";
import { pruneExpired } from "./lib/store.js";
import { reportsRouter } from "./routes/reports.js";
import { routeRouter } from "./routes/route.js";

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: "*" } });

app.use(cors());
// Stripe needs the raw body to verify signatures, so this route comes before express.json().
app.post("/api/fleet/billing/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/route", routeRouter);
app.use("/api/reports", reportsRouter(io));
app.use("/api/fleet", fleetRouter(io));

io.on("connection", (socket) => {
  console.log(`driver connected: ${socket.id}`);

  // Fleet owners and dispatchers subscribe to their own fleet's live positions.
  // DEV ONLY: trusts the user id sent by the app until real auth lands (BR-3).
  socket.on("fleet:watch", (userId: unknown, ack?: (r: { ok: boolean }) => void) => {
    const m = typeof userId === "string" ? getMember(userId) : undefined;
    if (!m || m.role === "driver") return ack?.({ ok: false });
    socket.join(orgRoom(m.orgId));
    ack?.({ ok: true });
  });
});

setInterval(pruneExpired, 60_000);
setInterval(pruneFleet, 60 * 60_000);

const port = Number(process.env.PORT ?? 4000);
http.listen(port, () => {
  const mode = process.env.HERE_API_KEY ? "HERE truck routing" : "demo routing";
  console.log(`TruckBeez API on http://localhost:${port} (${mode})`);
});

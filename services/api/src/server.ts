import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);
const httpServer = createServer(app);

// Live-tracking channel. Real auth and fleet scoping come later (see CLAUDE.md:
// location data is sensitive, fleet visibility limited to on-duty time).
const io = new SocketServer(httpServer, { path: "/ws" });
io.on("connection", (socket) => {
  socket.emit("hello", { version: config.version });
});

httpServer.listen(config.port, () => {
  // Structured log line; never log coordinates or PII.
  console.log(JSON.stringify({ msg: "api listening", port: config.port, env: config.appEnv, version: config.version }));
});

// Graceful shutdown so rolling/blue-green deploys drain connections.
function shutdown(signal: string) {
  console.log(JSON.stringify({ msg: "shutting down", signal }));
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

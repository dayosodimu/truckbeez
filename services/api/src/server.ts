import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { initErrorReporting } from "./errorReporting/index.js";

const config = loadConfig();
// Before anything else runs, so uncaught exceptions and unhandled rejections are
// reported. A no-op unless SENTRY_DSN is set (see docs/deployment.md).
const reporter = initErrorReporting(process.env);
const app = createApp(config, { reporter });
const httpServer = createServer(app);

// Live-tracking channel. Real auth and fleet scoping come later (see CLAUDE.md:
// location data is sensitive, fleet visibility limited to on-duty time).
const io = new SocketServer(httpServer, { path: "/ws" });
io.on("connection", (socket) => {
  socket.emit("hello", { version: config.version });
});

httpServer.listen(config.port, () => {
  // Structured log line; never log coordinates or PII.
  console.log(
    JSON.stringify({
      msg: "api listening",
      port: config.port,
      env: config.appEnv,
      version: config.version,
      errorReporting: reporter.enabled,
    })
  );
});

// Graceful shutdown so rolling/blue-green deploys drain connections, and queued
// error events are sent before the container stops.
function shutdown(signal: string) {
  console.log(JSON.stringify({ msg: "shutting down", signal }));
  io.close();
  httpServer.close(() => {
    void reporter.flush(2000).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

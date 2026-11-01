import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

/**
 * Socket.IO server for live updates to drivers (road reports, BR-6) and, later, fleet
 * dashboards (BR-38). Only a connectivity check exists so far; feature events are added
 * with their stories, each with authentication and per-company scoping.
 */
export function attachRealtime(httpServer: HttpServer, corsOrigins: string[] = []): Server {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins.length > 0 ? corsOrigins : '*' },
  });

  io.on('connection', (socket) => {
    socket.on('health:check', (ack?: unknown) => {
      if (typeof ack === 'function') ack({ ok: true, serverTime: new Date().toISOString() });
    });
  });

  return io;
}

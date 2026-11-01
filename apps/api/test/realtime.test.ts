import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { attachRealtime } from '../src/realtime';

let httpServer: HttpServer | undefined;
let client: Socket | undefined;

afterEach(async () => {
  client?.disconnect();
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
});

describe('realtime', () => {
  it('accepts a Socket.IO connection and answers a health check', async () => {
    httpServer = createServer();
    const io = attachRealtime(httpServer);
    await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;

    client = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    const reply = await client.timeout(2000).emitWithAck('health:check');

    expect(reply).toMatchObject({ ok: true });
    io.close();
  });
});

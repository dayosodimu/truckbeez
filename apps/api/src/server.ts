import { createServer } from 'node:http';
import { createApp } from './app';
import { loadConfig } from './config';
import { attachRealtime } from './realtime';
import { createRoutingProvider } from './routing';

const config = loadConfig();
const routingProvider = createRoutingProvider(config);
const app = createApp({ routingProvider, corsOrigins: config.corsOrigins });
const httpServer = createServer(app);
attachRealtime(httpServer, config.corsOrigins);

httpServer.listen(config.port, () => {
  console.log(`TruckBeez API listening on :${config.port} (routing: ${routingProvider.name})`);
  if (routingProvider.name === 'demo') {
    console.warn('No HERE_API_KEY set: serving straight-line demo routes that ignore truck restrictions.');
  }
});

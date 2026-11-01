import type { Config } from '../config';
import { createDemoProvider } from './demoProvider';
import { createHereProvider } from './hereProvider';
import type { RoutingProvider } from './types';

export * from './types';

export function createRoutingProvider(config: Pick<Config, 'hereApiKey'>): RoutingProvider {
  return config.hereApiKey ? createHereProvider({ apiKey: config.hereApiKey }) : createDemoProvider();
}

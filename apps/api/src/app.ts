import cors from 'cors';
import express, { type ErrorRequestHandler, type Response } from 'express';
import { MESSAGES, routeRequestSchema, type ApiError, type ApiErrorCode, type RouteResponse } from '@truckbeez/shared';
import { RoutingProviderError, type RoutingProvider } from './routing';

export interface AppOptions {
  routingProvider: RoutingProvider;
  corsOrigins?: string[];
  logger?: Pick<Console, 'warn' | 'error'>;
}

const sendError = (res: Response, status: number, code: ApiErrorCode, message: string, details?: unknown) => {
  const body: ApiError = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  res.status(status).json(body);
};

export function createApp({ routingProvider, corsOrigins = [], logger = console }: AppOptions) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : undefined));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', routingProvider: routingProvider.name });
  });

  /** UC-03 Plan a truck-safe route / UC-04 No truck-safe route available. */
  app.post('/api/route', async (req, res) => {
    const parsed = routeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'INVALID_REQUEST', MESSAGES.invalidRequest, parsed.error.flatten());
      return;
    }

    try {
      const result = await routingProvider.route(parsed.data);
      if (result.kind === 'no_safe_route') {
        sendError(res, 422, 'NO_SAFE_ROUTE', MESSAGES.noSafeRoute, { reasons: result.reasons });
        return;
      }
      const body: RouteResponse = result.route;
      res.json(body);
    } catch (error) {
      if (error instanceof RoutingProviderError) {
        logger.warn(`[routing:${routingProvider.name}] ${error.message}`);
        sendError(res, 502, 'ROUTING_PROVIDER_ERROR', MESSAGES.routingProviderError);
        return;
      }
      throw error;
    }
  });

  app.use((_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Not found');
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if ((error as { type?: string }).type === 'entity.parse.failed') {
      sendError(res, 400, 'INVALID_REQUEST', MESSAGES.invalidRequest);
      return;
    }
    if ((error as { type?: string }).type === 'entity.too.large') {
      sendError(res, 413, 'INVALID_REQUEST', 'Request body too large');
      return;
    }
    logger.error(error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
  };
  app.use(errorHandler);

  return app;
}

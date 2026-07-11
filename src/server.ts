import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env, isProduction } from './config/env.js';
import { ApiError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { createRateLimitMiddleware } from './middleware/rateLimit.middleware.js';
import { requestContext } from './middleware/requestContext.middleware.js';
import { securityHeaders } from './middleware/securityHeaders.middleware.js';
import { appsRouter } from './routes/apps.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { sessionsRouter } from './routes/sessions.routes.js';
import { walletRouter } from './routes/wallet.routes.js';
import { runDueSessionPayouts } from './services/session.service.js';

function parseCorsOrigin(origin: string): boolean | string[] {
  if (origin === '*') return true;
  return origin.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const app = express();
if (env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(requestContext);
app.use(securityHeaders);
app.use(createRateLimitMiddleware({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_GLOBAL_MAX, keyPrefix: 'global' }));
app.use(cors({ origin: parseCorsOrigin(env.FRONTEND_ORIGIN), methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));

function sendMeta(_request: Request, response: Response): void {
  response.json({
    service: 'fiberpass-api',
    mode: 'product',
    fiber: {
      provider: env.FIBER_PROVIDER,
      network: env.FIBER_NETWORK,
      rpcConfigured: Boolean(env.FIBER_RPC_URL)
    }
  });
}

let paymentSchedulerRunning = false;
let paymentSchedulerTimer: NodeJS.Timeout | undefined;

async function runEmbeddedPaymentSchedulerTick(): Promise<void> {
  if (paymentSchedulerRunning) return;
  paymentSchedulerRunning = true;
  try {
    const scheduledPayouts = await runDueSessionPayouts({ limit: env.PAYMENT_WORKER_BATCH_SIZE });
    if (scheduledPayouts.processed > 0 || scheduledPayouts.failed > 0) {
      logger.info('api_scheduled_payouts_processed', { ...scheduledPayouts });
    }
  } catch (error) {
    logger.error('api_scheduled_payouts_failed', { error });
  } finally {
    paymentSchedulerRunning = false;
  }
}

function startEmbeddedPaymentScheduler(): void {
  if (paymentSchedulerTimer) return;
  paymentSchedulerTimer = setInterval(() => {
    void runEmbeddedPaymentSchedulerTick();
  }, env.PAYMENT_WORKER_INTERVAL_MS);
  paymentSchedulerTimer.unref?.();
  void runEmbeddedPaymentSchedulerTick();
}

app.get('/meta', sendMeta);
app.get('/v1/meta', sendMeta);

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'fiberpass-api',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    at: new Date().toISOString()
  });
});

app.use(authRouter);
app.use(appsRouter);
app.use(sessionsRouter);
app.use(walletRouter);
app.use('/v1', authRouter);
app.use('/v1', appsRouter);
app.use('/v1', sessionsRouter);
app.use('/v1', walletRouter);
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload failed validation.',
        details: isProduction ? undefined : error.issues
      }
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: isProduction ? undefined : error.details
      }
    });
    return;
  }

  logger.error('unhandled_request_error', { error });
  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected FiberPass API error.'
    }
  });
});

await mongoose.connect(env.MONGODB_URI);

const server = http.createServer(app);
server.listen(env.PORT, '0.0.0.0', () => {
  logger.info('api_listening', { port: env.PORT, fiberProvider: env.FIBER_PROVIDER, fiberNetwork: env.FIBER_NETWORK });
  startEmbeddedPaymentScheduler();
});

const shutdown = async () => {
  if (paymentSchedulerTimer) clearInterval(paymentSchedulerTimer);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await mongoose.disconnect();
};

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
});

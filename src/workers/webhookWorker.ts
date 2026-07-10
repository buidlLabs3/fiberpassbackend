import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { logWebhookWorkerResult, runWebhookWorkerOnce } from '../services/webhook.service.js';

const workerId = process.env.WEBHOOK_WORKER_ID?.trim() || 'fiberpass-webhook-worker';
let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('webhook_worker_started', { workerId, intervalMs: env.WEBHOOK_WORKER_INTERVAL_MS, batchSize: env.WEBHOOK_WORKER_BATCH_SIZE });

  while (!stopping) {
    try {
      const result = await runWebhookWorkerOnce({ workerId, limit: env.WEBHOOK_WORKER_BATCH_SIZE });
      logWebhookWorkerResult(workerId, result);
    } catch (error) {
      logger.error('webhook_worker_batch_failed', { workerId, error });
    }

    await sleep(env.WEBHOOK_WORKER_INTERVAL_MS);
  }

  await mongoose.disconnect();
  logger.info('webhook_worker_stopped', { workerId });
}

process.on('SIGINT', () => {
  stopping = true;
});

process.on('SIGTERM', () => {
  stopping = true;
});

runLoop().catch((error) => {
  logger.error('webhook_worker_crashed', { workerId, error });
  process.exit(1);
});

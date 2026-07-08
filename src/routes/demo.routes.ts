import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { chargeRandomActiveSession, chargeSession } from '../services/session.service.js';

const chargeSchema = z.object({
  sessionId: z.string().min(1),
  amount: z.coerce.number().positive().max(100000),
  type: z.string().trim().min(1).max(120).default('Demo AI/API Action')
});

export const demoRouter = Router();

demoRouter.post('/demo/charge', asyncHandler(async (request, response) => {
  const payload = chargeSchema.parse(request.body);
  response.json(await chargeSession(payload));
}));

demoRouter.post('/demo/charge/random', asyncHandler(async (_request, response) => {
  const overview = await chargeRandomActiveSession();
  if (!overview) {
    response.status(404).json({
      error: {
        code: 'NO_ACTIVE_SESSIONS',
        message: 'No active auto-charge sessions are available.'
      }
    });
    return;
  }
  response.json(overview);
}));

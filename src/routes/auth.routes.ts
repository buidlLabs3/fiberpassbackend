import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { createAuthChallenge, getWalletForAuthContext, revokeAuthToken, verifyAuthChallenge } from '../services/auth.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

const challengeSchema = z.object({
  address: z.string().trim().min(1).optional()
});

const verifySchema = z.object({
  challengeId: z.string().uuid(),
  address: z.string().trim().min(1),
  signature: z.string().trim().min(1)
});

export const authRouter = Router();

authRouter.post('/auth/challenge', asyncHandler(async (request, response) => {
  const { address } = challengeSchema.parse(request.body ?? {});
  response.json(await createAuthChallenge(address));
}));

authRouter.post('/auth/verify', asyncHandler(async (request, response) => {
  const payload = verifySchema.parse(request.body);
  response.json(await verifyAuthChallenge(payload));
}));

authRouter.get('/auth/me', requireAuth, asyncHandler(async (request, response) => {
  response.json(await getWalletForAuthContext((request as AuthenticatedRequest).auth));
}));

authRouter.post('/auth/logout', requireAuth, asyncHandler(async (request, response) => {
  const header = request.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (token) {
    await revokeAuthToken(token);
  }
  response.status(204).end();
}));

import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { getAuthContextFromToken } from '../services/auth.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

function readBearerToken(request: Request): string | null {
  const header = request.header('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  const queryToken = request.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }

  return null;
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const token = readBearerToken(request);
    if (!token) {
      throw new ApiError(401, 'AUTH_REQUIRED', 'Connect with JoyID before using FiberPass.');
    }

    (request as AuthenticatedRequest).auth = await getAuthContextFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

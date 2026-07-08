import type { Request } from 'express';

export interface AuthContext {
  walletId: string;
  address: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

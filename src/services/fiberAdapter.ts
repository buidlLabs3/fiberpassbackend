import { env } from '../config/env.js';

export interface FiberAuthorizeInput {
  sessionId: string;
  appAddress: string;
  amount: number;
  currency: string;
}

export interface FiberSettlementInput {
  sessionId: string;
  amount: number;
  currency: string;
  reason: 'revoked' | 'settled' | 'expired';
}

export class FiberAdapter {
  async authorizeCharge(input: FiberAuthorizeInput): Promise<{ authorized: true; network: string }> {
    void input;
    return { authorized: true, network: env.FIBER_NETWORK };
  }

  async settleSession(input: FiberSettlementInput): Promise<{ settled: true; network: string }> {
    void input;
    return { settled: true, network: env.FIBER_NETWORK };
  }
}

export const fiberAdapter = new FiberAdapter();

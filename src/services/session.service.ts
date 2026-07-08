import { randomUUID } from 'node:crypto';
import { FilterQuery } from 'mongoose';
import { seedSessions } from '../data/seed.js';
import { ApiError } from '../lib/errors.js';
import { liveEvents } from '../lib/liveEvents.js';
import { roundMoney, utcTimeLabel } from '../lib/time.js';
import { ICON_TYPES, SessionModel, type IconType, type SessionRecord, type SessionStatus } from '../models/session.model.js';
import { WalletModel, type WalletRecord } from '../models/wallet.model.js';
import { fiberAdapter } from './fiberAdapter.js';

export const DEMO_WALLET_ID = 'demo-wallet';
export const DEMO_WALLET_ADDRESS = '0x71C7656EC7ab88b098defB751B7401B5f6d14766';
const DEFAULT_WALLET_BALANCE = 1240.5;
const HISTORY_STATUSES: SessionStatus[] = ['settled', 'revoked', 'expired'];
const OPEN_STATUSES: SessionStatus[] = ['active', 'paused'];

interface TransactionLogDto {
  id: string;
  type: string;
  timestamp: string;
  amount: number;
}

interface SessionLike {
  ownerWalletId: string;
  publicId: string;
  name: string;
  serviceAddress: string;
  spent: number;
  limit: number;
  currency: string;
  duration: string;
  status: SessionStatus;
  iconType: IconType;
  expiryTime: string;
  autoMicroCharges: boolean;
  singleUse: boolean;
  logs: TransactionLogDto[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SessionDto {
  id: string;
  name: string;
  serviceAddress: string;
  spent: number;
  limit: number;
  currency: string;
  duration: string;
  status: SessionStatus;
  iconType: IconType;
  createdAt: string;
  expiryTime: string;
  autoMicroCharges: boolean;
  singleUse: boolean;
  logs: TransactionLogDto[];
}

export interface WalletDto {
  connected: boolean;
  address: string;
  balance: number;
  currency: string;
}

export interface SessionsOverviewDto {
  wallet: WalletDto;
  activeSessions: SessionDto[];
  historySessions: SessionDto[];
}

export interface CreateSessionInput {
  name: string;
  serviceAddress: string;
  limit: number;
  currency: string;
  duration: string;
  expiryTime: string;
  autoMicroCharges: boolean;
  singleUse: boolean;
  iconType: IconType;
}

export interface ChargeSessionInput {
  sessionId: string;
  amount: number;
  type: string;
}

export interface WalletIdentity {
  walletId: string;
  address: string;
}

function newPublicId(): string {
  const raw = randomUUID().replace(/-/g, '');
  return `0x${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function newLog(type: string, amount = 0): TransactionLogDto {
  return {
    id: `log-${Date.now()}-${randomUUID().slice(0, 8)}`,
    type,
    timestamp: utcTimeLabel(),
    amount: roundMoney(amount)
  };
}

function prependLogs(
  session: { get: (path: string) => unknown; set: (path: string, value: unknown) => void },
  ...logs: TransactionLogDto[]
): void {
  const existingLogs = (session.get('logs') as TransactionLogDto[] | undefined) ?? [];
  session.set('logs', [...logs, ...existingLogs]);
}

function toSessionDto(session: SessionLike): SessionDto {
  return {
    id: session.publicId,
    name: session.name,
    serviceAddress: session.serviceAddress,
    spent: roundMoney(session.spent),
    limit: roundMoney(session.limit),
    currency: session.currency,
    duration: session.duration,
    status: session.status,
    iconType: session.iconType,
    createdAt: (session.createdAt ?? new Date()).toISOString(),
    expiryTime: session.expiryTime,
    autoMicroCharges: session.autoMicroCharges,
    singleUse: session.singleUse,
    logs: session.logs ?? []
  };
}

function toWalletDto(wallet: WalletRecord): WalletDto {
  return {
    connected: wallet.connected,
    address: wallet.address,
    balance: roundMoney(wallet.balance),
    currency: wallet.currency
  };
}

async function publishOverview(walletId: string): Promise<void> {
  liveEvents.publish(`overview:${walletId}`, await getSessionsOverview(walletId));
}

function seedForWallet(walletId: string, useFixedIds = false): Array<Record<string, unknown>> {
  return seedSessions.map((session) => ({
    ...session,
    ownerWalletId: walletId,
    publicId: useFixedIds ? session.publicId : newPublicId()
  }));
}

export function walletIdFromAddress(address: string): string {
  return address.toLowerCase();
}

export async function ensureWalletForAddress(address: string): Promise<WalletRecord> {
  const walletId = walletIdFromAddress(address);
  const wallet = await WalletModel.findOneAndUpdate(
    { walletId },
    {
      $set: { connected: true, address },
      $setOnInsert: {
        walletId,
        balance: DEFAULT_WALLET_BALANCE,
        currency: 'USDC'
      }
    },
    { upsert: true, new: true }
  );

  return wallet.toObject();
}

export async function seedWalletDemoSessions(walletId: string): Promise<void> {
  const count = await SessionModel.countDocuments({ ownerWalletId: walletId });
  if (count === 0) {
    await SessionModel.insertMany(seedForWallet(walletId), { ordered: true });
  }
}

export async function seedDemoData(): Promise<void> {
  await WalletModel.findOneAndUpdate(
    { walletId: DEMO_WALLET_ID },
    {
      $setOnInsert: {
        walletId: DEMO_WALLET_ID,
        connected: true,
        address: DEMO_WALLET_ADDRESS,
        balance: DEFAULT_WALLET_BALANCE,
        currency: 'USDC'
      }
    },
    { upsert: true, new: true }
  );

  await SessionModel.updateMany(
    { ownerWalletId: { $exists: false } },
    { $set: { ownerWalletId: DEMO_WALLET_ID } }
  );

  const sessionCount = await SessionModel.countDocuments({ ownerWalletId: DEMO_WALLET_ID });
  if (sessionCount === 0) {
    await SessionModel.insertMany(seedForWallet(DEMO_WALLET_ID, true), { ordered: true });
  }
}

async function getWalletDocument(walletId: string) {
  const wallet = await WalletModel.findOne({ walletId });
  if (!wallet) {
    throw new ApiError(404, 'WALLET_NOT_FOUND', 'Connect with JoyID before loading FiberPass sessions.');
  }
  return wallet;
}

async function getSessionOrThrow(publicId: string, walletId?: string) {
  const session = await SessionModel.findOne({
    publicId,
    ...(walletId ? { ownerWalletId: walletId } : {})
  });
  if (!session) {
    throw new ApiError(404, 'SESSION_NOT_FOUND', 'FiberPass session was not found.');
  }
  return session;
}

export async function getSessionsOverview(walletId: string): Promise<SessionsOverviewDto> {
  const [wallet, sessions] = await Promise.all([
    getWalletDocument(walletId),
    SessionModel.find({ ownerWalletId: walletId }).sort({ createdAt: -1 }).lean<SessionLike[]>()
  ]);

  const sessionDtos = sessions.map(toSessionDto);
  return {
    wallet: toWalletDto(wallet.toObject()),
    activeSessions: sessionDtos.filter((session) => OPEN_STATUSES.includes(session.status)),
    historySessions: sessionDtos.filter((session) => HISTORY_STATUSES.includes(session.status))
  };
}

export async function createSession(input: CreateSessionInput, walletId: string): Promise<SessionsOverviewDto> {
  const limit = roundMoney(input.limit);
  const wallet = await WalletModel.findOneAndUpdate(
    { walletId, balance: { $gte: limit } },
    { $inc: { balance: -limit } },
    { new: true }
  );

  if (!wallet) {
    throw new ApiError(400, 'INSUFFICIENT_WALLET_BALANCE', 'Wallet balance is too low for this FiberPass limit.');
  }

  try {
    await SessionModel.create({
      ownerWalletId: walletId,
      publicId: newPublicId(),
      name: input.name,
      serviceAddress: input.serviceAddress,
      spent: 0,
      limit,
      currency: input.currency,
      duration: input.duration,
      status: 'active',
      iconType: input.iconType,
      expiryTime: input.expiryTime,
      autoMicroCharges: input.autoMicroCharges,
      singleUse: input.singleUse,
      logs: [newLog('Session Stream Limit Created')]
    });
  } catch (error) {
    await WalletModel.updateOne({ walletId }, { $inc: { balance: limit } });
    throw error;
  }

  const overview = await getSessionsOverview(walletId);
  liveEvents.publish(`overview:${walletId}`, overview);
  return overview;
}

export async function topUpSession(publicId: string, walletId: string, amount = 1): Promise<SessionsOverviewDto> {
  const topUpAmount = roundMoney(amount);
  if (topUpAmount <= 0) {
    throw new ApiError(400, 'INVALID_TOP_UP_AMOUNT', 'Top up amount must be greater than zero.');
  }

  const session = await getSessionOrThrow(publicId, walletId);
  if (!OPEN_STATUSES.includes(session.status as SessionStatus)) {
    throw new ApiError(409, 'SESSION_CLOSED', 'Only active or paused sessions can be topped up.');
  }

  const wallet = await WalletModel.findOneAndUpdate(
    { walletId, balance: { $gte: topUpAmount } },
    { $inc: { balance: -topUpAmount } },
    { new: true }
  );

  if (!wallet) {
    throw new ApiError(400, 'INSUFFICIENT_WALLET_BALANCE', 'Wallet balance is too low for this top up.');
  }

  session.limit = roundMoney(session.limit + topUpAmount);
  prependLogs(session, newLog('Session Allocation Top Up', topUpAmount));
  await session.save();

  const overview = await getSessionsOverview(walletId);
  liveEvents.publish(`overview:${walletId}`, overview);
  return overview;
}

export async function togglePauseSession(publicId: string, walletId: string): Promise<SessionsOverviewDto> {
  const session = await getSessionOrThrow(publicId, walletId);
  if (!OPEN_STATUSES.includes(session.status as SessionStatus)) {
    throw new ApiError(409, 'SESSION_CLOSED', 'Only active or paused sessions can be paused or resumed.');
  }

  session.status = session.status === 'paused' ? 'active' : 'paused';
  prependLogs(session, newLog(session.status === 'active' ? 'Session Stream Resumed' : 'Session Stream Paused'));
  await session.save();

  const overview = await getSessionsOverview(walletId);
  liveEvents.publish(`overview:${walletId}`, overview);
  return overview;
}

export async function revokeSession(publicId: string, walletId: string): Promise<SessionsOverviewDto> {
  const session = await getSessionOrThrow(publicId, walletId);
  if (!OPEN_STATUSES.includes(session.status as SessionStatus)) {
    throw new ApiError(409, 'SESSION_CLOSED', 'Session is already closed.');
  }

  const refundAmount = roundMoney(Math.max(0, session.limit - session.spent));
  session.status = 'revoked';
  session.expiryTime = 'Revoked by Owner';
  prependLogs(session, newLog(`Session Revoked (Refunded $${refundAmount.toFixed(2)})`));
  await session.save();

  await WalletModel.updateOne({ walletId }, { $inc: { balance: refundAmount } });
  await fiberAdapter.settleSession({ sessionId: publicId, amount: refundAmount, currency: session.currency, reason: 'revoked' });

  const overview = await getSessionsOverview(walletId);
  liveEvents.publish(`overview:${walletId}`, overview);
  return overview;
}

export async function settleSession(publicId: string, walletId: string): Promise<SessionsOverviewDto> {
  const session = await getSessionOrThrow(publicId, walletId);
  if (!OPEN_STATUSES.includes(session.status as SessionStatus)) {
    throw new ApiError(409, 'SESSION_CLOSED', 'Session is already closed.');
  }

  const refundAmount = roundMoney(Math.max(0, session.limit - session.spent));
  session.status = 'settled';
  session.expiryTime = 'Settled by User';
  prependLogs(session, newLog(`Session Settled (Refunded $${refundAmount.toFixed(2)})`));
  await session.save();

  await WalletModel.updateOne({ walletId }, { $inc: { balance: refundAmount } });
  await fiberAdapter.settleSession({ sessionId: publicId, amount: refundAmount, currency: session.currency, reason: 'settled' });

  const overview = await getSessionsOverview(walletId);
  liveEvents.publish(`overview:${walletId}`, overview);
  return overview;
}

export async function chargeSession(input: ChargeSessionInput): Promise<SessionsOverviewDto> {
  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new ApiError(400, 'INVALID_CHARGE_AMOUNT', 'Charge amount must be greater than zero.');
  }

  const session = await getSessionOrThrow(input.sessionId);
  const ownerWalletId = session.ownerWalletId as string;

  if (session.status !== 'active') {
    throw new ApiError(409, 'SESSION_NOT_CHARGEABLE', `Session is ${session.status}; charges are blocked.`);
  }

  const remaining = roundMoney(session.limit - session.spent);
  if (amount > remaining) {
    session.status = 'expired';
    session.expiryTime = 'Limit Exhausted';
    prependLogs(session, newLog('Charge Blocked - Spending Limit Exhausted'));
    await session.save();
    await fiberAdapter.settleSession({ sessionId: input.sessionId, amount: 0, currency: session.currency, reason: 'expired' });
    await publishOverview(ownerWalletId);
    throw new ApiError(402, 'SESSION_LIMIT_EXCEEDED', 'Charge exceeds the remaining FiberPass balance.');
  }

  await fiberAdapter.authorizeCharge({
    sessionId: input.sessionId,
    appAddress: session.serviceAddress,
    amount,
    currency: session.currency
  });

  const nextSpent = roundMoney(session.spent + amount);
  session.spent = nextSpent;
  prependLogs(session, newLog(input.type, amount));

  if (nextSpent >= session.limit) {
    session.status = 'expired';
    session.expiryTime = 'Limit Exhausted';
    prependLogs(session, newLog('Spending Limit Exhausted - Settled'));
    await fiberAdapter.settleSession({ sessionId: input.sessionId, amount: 0, currency: session.currency, reason: 'expired' });
  } else if (session.singleUse) {
    const refundAmount = roundMoney(Math.max(0, session.limit - session.spent));
    session.status = 'settled';
    session.expiryTime = 'Single-use charge completed';
    prependLogs(session, newLog(`Single-use Session Settled (Refunded $${refundAmount.toFixed(2)})`));
    await WalletModel.updateOne({ walletId: ownerWalletId }, { $inc: { balance: refundAmount } });
    await fiberAdapter.settleSession({ sessionId: input.sessionId, amount: refundAmount, currency: session.currency, reason: 'settled' });
  }

  await session.save();
  const overview = await getSessionsOverview(ownerWalletId);
  liveEvents.publish(`overview:${ownerWalletId}`, overview);
  return overview;
}

export async function chargeRandomActiveSession(): Promise<SessionsOverviewDto | null> {
  const query: FilterQuery<SessionRecord> = { status: 'active', autoMicroCharges: true };
  const sessions = await SessionModel.find(query).lean<SessionLike[]>();
  if (sessions.length === 0) return null;

  const target = sessions[Math.floor(Math.random() * sessions.length)];
  const logTypes = [
    'Continuous Data Stream Tick',
    'API Inference Endpoint Charge',
    'Agent Network Routing Query',
    'Sub-second Layer-3 Gas Settlement',
    'Micro-billing Stream Tick'
  ];
  const amount = roundMoney(0.01 + Math.random() * 0.04);
  const type = logTypes[Math.floor(Math.random() * logTypes.length)];

  try {
    return await chargeSession({ sessionId: target.publicId, amount, type });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 402) {
      return getSessionsOverview(target.ownerWalletId);
    }
    throw error;
  }
}

export function isValidIconType(iconType: string): iconType is IconType {
  return ICON_TYPES.includes(iconType as IconType);
}

export async function resetDemoData(): Promise<SessionsOverviewDto> {
  await Promise.all([SessionModel.deleteMany({}), WalletModel.deleteMany({})]);
  await seedDemoData();
  const overview = await getSessionsOverview(DEMO_WALLET_ID);
  liveEvents.publish(`overview:${DEMO_WALLET_ID}`, overview);
  return overview;
}

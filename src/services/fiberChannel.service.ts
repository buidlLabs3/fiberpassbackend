import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { toMinorUnits, fromMinorUnits } from '../lib/money.js';
import { writeAuditLog } from './audit.service.js';
import { fiberProvider } from './fiberProvider.js';
import { getFiberNodeReadiness } from './fiberNode.service.js';

export interface FiberPeerTargetDto {
  peerId: string;
  source: 'env' | 'connected';
  primary: boolean;
}

export interface FiberChannelStrategyDto {
  network: string;
  provider: string;
  readyForLiveTest: boolean;
  localNodePeerId?: string;
  configuredPrimaryPeer?: string;
  targetPeers: FiberPeerTargetDto[];
  testChannelAmount: number;
  testChannelAmountMinor: number;
  readiness: Awaited<ReturnType<typeof getFiberNodeReadiness>>;
  nextActions: string[];
}

export interface FiberChannelOpenResultDto {
  ok: true;
  localSessionId: string;
  peerId: string;
  amount: number;
  amountMinor: number;
  networkSessionId: string;
  status: string;
  proofId?: string;
  raw?: unknown;
}

function uniquePeerIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))];
}

function configuredTargetPeerIds(localPeerIds: Set<string>): string[] {
  return uniquePeerIds(env.FIBER_TARGET_PEER_IDS.split(',')).filter((peerId) => !localPeerIds.has(peerId));
}

function connectedTargetPeerIds(readiness: Awaited<ReturnType<typeof getFiberNodeReadiness>>, localPeerIds: Set<string>, configuredPeerIds: Set<string>): string[] {
  if (readiness.peers.status !== 'available') return [];
  return uniquePeerIds((readiness.peers.peers ?? [])
    .filter((peer) => peer.connected !== false)
    .map((peer) => peer.peerId))
    .filter((peerId) => !localPeerIds.has(peerId) && !configuredPeerIds.has(peerId));
}

function localPeerIds(readiness: Awaited<ReturnType<typeof getFiberNodeReadiness>>): Set<string> {
  return new Set(uniquePeerIds([env.FIBER_PEER_ID, readiness.node?.peerId]));
}

function targetPeerIds(readiness: Awaited<ReturnType<typeof getFiberNodeReadiness>>): FiberPeerTargetDto[] {
  const localPeers = localPeerIds(readiness);
  const configuredPeers = configuredTargetPeerIds(localPeers);
  const configuredSet = new Set(configuredPeers);
  const connectedPeers = connectedTargetPeerIds(readiness, localPeers, configuredSet);
  const peers = [
    ...configuredPeers.map((peerId) => ({ peerId, source: 'env' as const })),
    ...connectedPeers.map((peerId) => ({ peerId, source: 'connected' as const }))
  ];
  return peers.map((peer, index) => ({ ...peer, primary: index === 0 }));
}

function resolveLocalNodePeerId(readiness: Awaited<ReturnType<typeof getFiberNodeReadiness>>): string | undefined {
  return readiness.node?.peerId || env.FIBER_PEER_ID || undefined;
}

function isLocalPeer(peerId: string, readiness: Awaited<ReturnType<typeof getFiberNodeReadiness>>): boolean {
  return localPeerIds(readiness).has(peerId.trim());
}

function channelAmountMinor(amount?: number, options: { exact?: boolean } = {}): number {
  const requestedMinor = toMinorUnits(String(amount ?? env.FIBER_TEST_CHANNEL_AMOUNT_CKB), 'CKB');
  if (options.exact && amount != null) return requestedMinor;
  const configuredMinimumMinor = toMinorUnits(String(env.FIBER_TEST_CHANNEL_AMOUNT_CKB), 'CKB');
  return Math.max(requestedMinor, configuredMinimumMinor);
}

export async function getFiberChannelStrategy(): Promise<FiberChannelStrategyDto> {
  const readiness = await getFiberNodeReadiness();
  const targetPeers = targetPeerIds(readiness);
  const testChannelAmountMinor = channelAmountMinor();
  const nextActions: string[] = [];

  if (!readiness.reachable) nextActions.push('Restore Fiber RPC reachability before channel tests.');
  if (targetPeers.length === 0) nextActions.push('Set FIBER_TARGET_PEER_IDS with an external reachable testnet peer, or connect the node to a peer that exposes a peer id.');
  if (readiness.peers.status === 'available' && (readiness.peers.connectedCount ?? 0) === 0) nextActions.push('Connect the node to at least one Fiber peer.');
  if (readiness.channels.status === 'available' && (readiness.channels.activeCount ?? 0) === 0) nextActions.push('Open a test channel before live invoice payment validation.');
  if (readiness.paymentExecution.status === 'unknown') nextActions.push('Confirm peer/channel state manually with node logs or fnn-cli because this RPC does not expose full probes.');
  if (nextActions.length === 0) nextActions.push('Run a live Fiber invoice payment test with a real payment request.');

  return {
    network: env.FIBER_NETWORK,
    provider: fiberProvider.kind,
    readyForLiveTest: readiness.paymentExecution.status === 'ready' && targetPeers.length > 0,
    localNodePeerId: resolveLocalNodePeerId(readiness),
    configuredPrimaryPeer: env.FIBER_PEER_ID || undefined,
    targetPeers,
    testChannelAmount: fromMinorUnits(testChannelAmountMinor, 'CKB'),
    testChannelAmountMinor,
    readiness,
    nextActions
  };
}

export async function openFiberTestChannel(input: { peerId?: string; amount?: number; actorWalletId?: string; exactAmount?: boolean } = {}): Promise<FiberChannelOpenResultDto> {
  const readiness = await getFiberNodeReadiness();
  const peerId = input.peerId?.trim() || targetPeerIds(readiness)[0]?.peerId;
  if (!peerId) {
    throw new ApiError(400, 'FIBER_TARGET_PEER_REQUIRED', 'Provide peerId or set FIBER_TARGET_PEER_IDS to an external reachable testnet peer before opening a Fiber channel.');
  }
  if (isLocalPeer(peerId, readiness)) {
    throw new ApiError(400, 'FIBER_TARGET_PEER_IS_LOCAL', 'Channel target peer cannot be the local Fiber node peer id. Use an external peer id.');
  }

  const amountMinor = channelAmountMinor(input.amount, { exact: input.exactAmount === true });
  if (amountMinor <= 0) {
    throw new ApiError(400, 'INVALID_CHANNEL_AMOUNT', 'Fiber channel amount must be greater than zero.');
  }

  const localSessionId = 'fp_channel_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
  const result = await fiberProvider.createSession({
    localSessionId,
    walletId: input.actorWalletId ?? 'fiberpass-operator',
    appAddress: 'fiberpass-channel-test',
    amountMinor,
    currency: 'CKB',
    metadata: { fiberPeerId: peerId, purpose: 'channel_test' }
  });

  await writeAuditLog({
    actorWalletId: input.actorWalletId,
    action: 'fiber.channel_test_opened',
    targetType: 'fiber_channel',
    targetId: result.networkSessionId,
    metadata: { peerId, amountMinor, proofId: result.proofId }
  });

  return {
    ok: true,
    localSessionId,
    peerId,
    amount: fromMinorUnits(amountMinor, 'CKB'),
    amountMinor,
    networkSessionId: result.networkSessionId,
    status: result.status,
    proofId: result.proofId,
    raw: result.raw
  };
}

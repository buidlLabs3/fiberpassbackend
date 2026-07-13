import { config, helpers, type Script } from '@ckb-lumos/lumos';
import { env } from '../config/env.js';
import { fiberProvider } from './fiberProvider.js';

export interface FiberNodeReadinessDto {
  configured: boolean;
  reachable: boolean;
  provider: string;
  network: string;
  rpcUrl: string;
  apiKeyConfigured: boolean;
  peerIdConfigured: boolean;
  checkedAt: string;
  latencyMs?: number;
  node?: {
    peerId?: string;
    version?: string;
    chain?: string;
    addresses?: string[];
    fundingAddress?: string;
    fundingLock?: Script;
    rawKeys: string[];
  };
  error?: string;
}

type RpcScript = { code_hash?: unknown; codeHash?: unknown; hash_type?: unknown; hashType?: unknown; args?: unknown };

function networkConfig() {
  return env.FIBER_NETWORK.toLowerCase().includes('main') ? config.MAINNET : config.TESTNET;
}

function publicRpcUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol + '//' + url.host;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (items.length > 0) return items;
    }
    if (typeof value === 'string' && value.trim()) return [value];
  }
  return undefined;
}

function normalizeScript(value: unknown): Script | undefined {
  const script = asRecord(value) as RpcScript;
  const codeHash = typeof script.code_hash === 'string' ? script.code_hash : typeof script.codeHash === 'string' ? script.codeHash : '';
  const hashType = typeof script.hash_type === 'string' ? script.hash_type : typeof script.hashType === 'string' ? script.hashType : '';
  const args = typeof script.args === 'string' ? script.args : '';

  if (!codeHash || !hashType || !args) return undefined;
  if (!['data', 'type', 'data1', 'data2'].includes(hashType)) return undefined;

  return { codeHash, hashType: hashType as Script['hashType'], args };
}

function fundingAddressFromNodeInfo(raw: Record<string, unknown>): { fundingAddress?: string; fundingLock?: Script } {
  const fundingLock = normalizeScript(raw.default_funding_lock_script ?? raw.defaultFundingLockScript);
  if (!fundingLock) return {};

  try {
    return {
      fundingLock,
      fundingAddress: helpers.encodeToAddress(fundingLock, { config: networkConfig() })
    };
  } catch {
    return { fundingLock };
  }
}

export async function getFiberNodeReadiness(): Promise<FiberNodeReadinessDto> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  const base = {
    configured: Boolean(env.FIBER_RPC_URL),
    provider: env.FIBER_PROVIDER,
    network: env.FIBER_NETWORK,
    rpcUrl: publicRpcUrl(env.FIBER_RPC_URL),
    apiKeyConfigured: Boolean(env.FIBER_API_KEY),
    peerIdConfigured: Boolean(env.FIBER_PEER_ID),
    checkedAt
  };

  if (!env.FIBER_RPC_URL) {
    return { ...base, reachable: false, error: 'FIBER_RPC_URL is not configured.' };
  }

  try {
    const status = await fiberProvider.getStatus('node_info');
    const raw = asRecord(status.raw);
    const funding = fundingAddressFromNodeInfo(raw);

    return {
      ...base,
      reachable: true,
      latencyMs: Date.now() - startedAt,
      node: {
        peerId: pickString(raw, ['peer_id', 'peerId', 'node_id', 'nodeId', 'pubkey']),
        version: pickString(raw, ['version', 'fiber_version', 'fiberVersion']),
        chain: pickString(raw, ['chain', 'network']),
        addresses: pickStringArray(raw, ['addresses', 'listen_addrs', 'listening_addrs', 'announced_addrs']),
        fundingAddress: funding.fundingAddress,
        fundingLock: funding.fundingLock,
        rawKeys: Object.keys(raw).sort()
      }
    };
  } catch (error) {
    return {
      ...base,
      reachable: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Fiber RPC node_info failed.'
    };
  }
}

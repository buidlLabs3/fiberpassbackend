import type { IconType, SessionStatus } from '../models/session.model.js';

export interface SeedSession {
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
  logs: Array<{ id: string; type: string; timestamp: string; amount: number }>;
  createdAt: Date;
  updatedAt: Date;
}

const now = Date.now();

export const seedSessions: SeedSession[] = [
  {
    publicId: '0x9a23...bc81',
    name: 'AI Chat Assistant',
    serviceAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d14766',
    spent: 0.45,
    limit: 1,
    currency: 'USDC',
    duration: '24h',
    status: 'active',
    iconType: 'ai',
    expiryTime: '24 Hours',
    autoMicroCharges: true,
    singleUse: false,
    createdAt: new Date(now - 3600000 * 2),
    updatedAt: new Date(now - 3600000 * 2),
    logs: [
      { id: 'l1', type: 'Chat Completion Request', timestamp: '15:42:01 UTC', amount: 0.02 },
      { id: 'l2', type: 'Embeddings Computation', timestamp: '15:42:45 UTC', amount: 0.005 },
      { id: 'l3', type: 'Chat Completion Request', timestamp: '15:45:10 UTC', amount: 0.025 }
    ]
  },
  {
    publicId: '0x3f5b...aa92',
    name: 'Decentralized Storage',
    serviceAddress: '0x2a9D2f8e170068D2e113B01B5F6D147662c2A133',
    spent: 3.2,
    limit: 5,
    currency: 'USDC',
    duration: '7d',
    status: 'active',
    iconType: 'database',
    expiryTime: '7 Days',
    autoMicroCharges: true,
    singleUse: false,
    createdAt: new Date(now - 3600000 * 24),
    updatedAt: new Date(now - 3600000 * 24),
    logs: [
      { id: 'l10', type: 'Upload Shard #1 (250MB)', timestamp: '10:14:01 UTC', amount: 0.45 },
      { id: 'l11', type: 'Bandwidth Maintenance Fee', timestamp: '12:00:00 UTC', amount: 0.1 }
    ]
  },
  {
    publicId: '0x8e12...ff34',
    name: 'RPC Node Access',
    serviceAddress: '0x5F6D1476600a22a133171f337a9D2f8e170068D2',
    spent: 8.85,
    limit: 10,
    currency: 'USDC',
    duration: '24h',
    status: 'active',
    iconType: 'rpc',
    expiryTime: '24 Hours',
    autoMicroCharges: true,
    singleUse: false,
    createdAt: new Date(now - 3600000 * 5),
    updatedAt: new Date(now - 3600000 * 5),
    logs: [
      { id: 'l20', type: 'eth_call (Batch x500)', timestamp: '11:23:45 UTC', amount: 0.25 },
      { id: 'l21', type: 'eth_getLogs (Range 10k)', timestamp: '12:14:12 UTC', amount: 0.85 }
    ]
  },
  {
    publicId: '0x9f8a...3b21',
    name: 'AWS Lambda Compute',
    serviceAddress: '0x00429C001945d9e2ffb0c6ff002d6f6900057f2b',
    spent: 1,
    limit: 5,
    currency: 'USDC',
    duration: '2h 14m',
    status: 'settled',
    iconType: 'cloud',
    expiryTime: 'Expired after 2h 14m',
    autoMicroCharges: true,
    singleUse: false,
    createdAt: new Date(now - 3600000 * 48),
    updatedAt: new Date(now - 3600000 * 48),
    logs: [
      { id: 'h1', type: 'Invoke Handler Function (x10)', timestamp: '14:23:45 UTC', amount: 0.02 },
      { id: 'h2', type: 'Database Proxy Connection Tunnels', timestamp: '14:45:00 UTC', amount: 0.36 }
    ]
  },
  {
    publicId: '0xb231...7c8c',
    name: 'Decentralized RPC',
    serviceAddress: '0x005236001945d9e2ffb0c6ff00523600211317ef',
    spent: 0,
    limit: 2,
    currency: 'USDC',
    duration: '1m',
    status: 'revoked',
    iconType: 'rpc',
    expiryTime: 'Revoked by Owner',
    autoMicroCharges: true,
    singleUse: true,
    createdAt: new Date(now - 3600000 * 96),
    updatedAt: new Date(now - 3600000 * 96),
    logs: []
  },
  {
    publicId: '0x718a...88ff',
    name: 'Premium Video Stream',
    serviceAddress: '0x00311f001945d9e2ffb0c6ff00211300382417ea',
    spent: 0.5,
    limit: 1,
    currency: 'USDC',
    duration: '30m',
    status: 'expired',
    iconType: 'video',
    expiryTime: 'Expired',
    autoMicroCharges: false,
    singleUse: false,
    createdAt: new Date(now - 3600000 * 120),
    updatedAt: new Date(now - 3600000 * 120),
    logs: [
      { id: 'h20', type: 'FHD Stream Playback (10 min)', timestamp: '18:00:15 UTC', amount: 0.15 },
      { id: 'h21', type: 'Audio Stream Dolby Pass-through', timestamp: '18:30:00 UTC', amount: 0.05 }
    ]
  }
];

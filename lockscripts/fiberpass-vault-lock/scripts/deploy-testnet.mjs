#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commons, config, helpers, hd, Indexer, RPC } from '@ckb-lumos/lumos';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const crateDir = resolve(scriptDir, '..');
const workspaceRoot = resolve(crateDir, '../../..');
const defaultWalletFile = resolve(workspaceRoot, '.local-secrets/fiberpass-lockscript-deployer.testnet.json');
const defaultOutputFile = resolve(workspaceRoot, '.local-secrets/fiberpass-vault-lock-deployment.testnet.json');
const binaryPath = resolve(crateDir, 'target/riscv64imac-unknown-none-elf/release/fiberpass-vault-lock');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is required.');
  return value;
}

function readWallet() {
  const walletFile = process.env.FIBERPASS_DEPLOYER_WALLET_FILE || defaultWalletFile;
  if (!existsSync(walletFile)) {
    throw new Error('Deployer wallet file was not found: ' + walletFile);
  }
  return {
    walletFile,
    wallet: JSON.parse(readFileSync(walletFile, 'utf8'))
  };
}

function readExistingDeployment() {
  const outputFile = process.env.FIBERPASS_DEPLOYMENT_OUTPUT_FILE || defaultOutputFile;
  if (!existsSync(outputFile)) {
    throw new Error('Existing deployment file was not found: ' + outputFile);
  }
  const deployment = JSON.parse(readFileSync(outputFile, 'utf8'));
  if (!deployment.typeId) {
    throw new Error('Existing deployment file is missing typeId.');
  }
  return deployment;
}

function readBinary() {
  if (!existsSync(binaryPath)) {
    throw new Error('Build the release binary first with npm run vault:build');
  }
  return new Uint8Array(readFileSync(binaryPath));
}

async function main() {
  const rpcUrl = requiredEnv('CKB_TESTNET_RPC_URL');
  const indexerUrl = process.env.CKB_TESTNET_INDEXER_URL || rpcUrl;
  const broadcast = process.env.BROADCAST !== 'false';
  const requestedMode = process.env.FIBERPASS_VAULT_DEPLOY_MODE || '';
  const upgradeExisting = process.env.FIBERPASS_VAULT_UPGRADE === 'true' || requestedMode === 'type-id-upgrade';
  const deployMode = requestedMode || (upgradeExisting ? 'type-id-upgrade' : 'type-id');
  const { walletFile, wallet } = readWallet();
  const scriptBinary = readBinary();

  if (!wallet.privateKey || !wallet.address?.startsWith('ckt')) {
    throw new Error('Wallet file must contain a testnet address and private key.');
  }

  const indexer = new Indexer(indexerUrl, rpcUrl);
  const rpc = new RPC(rpcUrl);
  const existingDeployment = upgradeExisting ? readExistingDeployment() : undefined;
  const deployResult = deployMode === 'data2'
    ? await commons.deploy.generateDeployWithDataTx({
        cellProvider: indexer,
        scriptBinary,
        fromInfo: wallet.address,
        config: config.TESTNET
      })
    : upgradeExisting
      ? await commons.deploy.generateUpgradeTypeIdDataTx({
          cellProvider: indexer,
          scriptBinary,
          fromInfo: wallet.address,
          typeId: existingDeployment.typeId,
          config: config.TESTNET
        })
      : await commons.deploy.generateDeployWithTypeIdTx({
          cellProvider: indexer,
          scriptBinary,
          fromInfo: wallet.address,
          config: config.TESTNET
        });

  let txSkeleton = commons.secp256k1Blake160.prepareSigningEntries(deployResult.txSkeleton, {
    config: config.TESTNET
  });

  const signingEntries = txSkeleton.get('signingEntries').toArray();
  const signatures = signingEntries.map((entry) => hd.key.signRecoverable(entry.message, wallet.privateKey));
  const tx = helpers.sealTransaction(txSkeleton, signatures);
  const txHash = broadcast ? await rpc.sendTransaction(tx, 'passthrough') : undefined;
  const deployment = {
    network: 'ckb-testnet',
    deployedAt: new Date().toISOString(),
    broadcast,
    deployerAddress: wallet.address,
    walletFile,
    txHash: txHash ?? '<dry-run-not-broadcast>',
    mode: deployMode,
    previousTxHash: existingDeployment?.txHash,
    scriptConfig: deployResult.scriptConfig,
    typeId: deployMode === 'data2' ? undefined : deployResult.typeId ?? existingDeployment?.typeId,
    env: {
      FIBERPASS_VAULT_CODE_HASH: deployResult.scriptConfig.CODE_HASH,
      FIBERPASS_VAULT_HASH_TYPE: deployResult.scriptConfig.HASH_TYPE,
      FIBERPASS_VAULT_CELL_DEP_TX_HASH: deployResult.scriptConfig.TX_HASH,
      FIBERPASS_VAULT_CELL_DEP_INDEX: deployResult.scriptConfig.INDEX,
      FIBERPASS_VAULT_CELL_DEP_TYPE: deployResult.scriptConfig.DEP_TYPE,
      FIBERPASS_OPERATOR_LOCK_HASH: process.env.FIBERPASS_OPERATOR_LOCK_HASH || '<set operator lock hash>'
    }
  };

  const outputFile = process.env.FIBERPASS_DEPLOYMENT_OUTPUT_FILE || defaultOutputFile;
  mkdirSync(dirname(outputFile), { recursive: true, mode: 0o700 });
  writeFileSync(outputFile, JSON.stringify(deployment, null, 2), { mode: 0o600 });

  console.log('deployer=' + wallet.address);
  console.log('mode=' + deployment.mode);
  console.log('broadcast=' + String(broadcast));
  console.log('tx_hash=' + deployment.txHash);
  console.log('code_hash=' + deployResult.scriptConfig.CODE_HASH);
  console.log('hash_type=' + deployResult.scriptConfig.HASH_TYPE);
  console.log('cell_dep=' + deployResult.scriptConfig.TX_HASH + ':' + deployResult.scriptConfig.INDEX);
  console.log('deployment_file=' + outputFile);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

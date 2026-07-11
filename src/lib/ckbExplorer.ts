export function ckbExplorerBaseUrl(network: string): string {
  return network.toLowerCase().includes('main')
    ? 'https://explorer.nervos.org'
    : 'https://pudge.explorer.nervos.org';
}

export function ckbTransactionExplorerUrl(txHash: string | undefined, network: string): string | undefined {
  const hash = txHash?.trim();
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return undefined;
  return ckbExplorerBaseUrl(network) + '/transaction/' + hash;
}

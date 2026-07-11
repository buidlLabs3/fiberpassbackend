# FiberPass Vault Lock Testnet Deployment

Network: CKB testnet
Status: committed and active

## Active Vault Lock

- Deployment date: 2026-07-11
- Deployment transaction hash: `0x56b03e0c3e486d7fc2b096679e685b10b3090568d7e6c58f3bfb05dfa9022004`
- Explorer: https://pudge.explorer.nervos.org/transaction/0x56b03e0c3e486d7fc2b096679e685b10b3090568d7e6c58f3bfb05dfa9022004
- Code cell outpoint: `0x56b03e0c3e486d7fc2b096679e685b10b3090568d7e6c58f3bfb05dfa9022004:0x0`
- Code hash: `0x648f9adc3c6eae148e8c7480eb6c8780cd7829a06212c9ae84172d80ba0eec2b`
- Hash type: `data2`
- Cell dep type: `code`
- Deployer address: `ckt1qyqyl3dk9qxmaqs8f7lxqj97slcwtwmutkws7ns0mj`
- Operator lock hash: `0x593325d587ddee3d804f1d18766dcb09a4e923491a0832d2630929c177a9f1d4`

## Backend Env

```bash
FIBERPASS_VAULT_CODE_HASH=0x648f9adc3c6eae148e8c7480eb6c8780cd7829a06212c9ae84172d80ba0eec2b
FIBERPASS_VAULT_HASH_TYPE=data2
FIBERPASS_VAULT_CELL_DEP_TX_HASH=0x56b03e0c3e486d7fc2b096679e685b10b3090568d7e6c58f3bfb05dfa9022004
FIBERPASS_VAULT_CELL_DEP_INDEX=0x0
FIBERPASS_VAULT_CELL_DEP_TYPE=code
FIBERPASS_OPERATOR_LOCK_HASH=0x593325d587ddee3d804f1d18766dcb09a4e923491a0832d2630929c177a9f1d4
```

## Notes

- This `data2` deployment is the only active vault lock for beta testing.
- Older Type ID deployment records were removed from this active deployment document because those cells are retired and must not be used for payouts.
- Payout fee selection must only use plain empty operator cells, never vault code cells or typed cells.
- The local private deployer wallet remains outside the repos under `.local-secrets/` and must not be committed.

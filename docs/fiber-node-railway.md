# FiberPass Railway Fiber Node

FiberPass now runs a public testnet Fiber Network Node on Railway.

## Railway Service

- Project: `fiberpass-fiber-node`
- Service: `fiber-node`
- Persistent volume: `/fiber`
- Fiber version: `0.9.0-rc7`
- Runtime image: `nervos/fiber:0.9.0-rc7`
- RPC proxy: Nginx inside the container, protected by `FIBER_RPC_PROXY_TOKEN`
- Fiber RPC inside container: `127.0.0.1:8227`
- Fiber P2P inside container: `8228/tcp`

## Public Endpoints

- Authenticated RPC URL: `https://fiber-node-production.up.railway.app`
- Health URL: `https://fiber-node-production.up.railway.app/health`
- Public Fiber P2P multiaddr: `/dns4/tokaido.proxy.rlwy.net/tcp/33283/p2p/Qmad2gpZPeMt3P3Ke2CN5BEUgYDpPdTtgXZVrfT5uuzoxE`
- Peer pubkey: `03447f0facecaa5de47e4c93fadc0889856ef7874db4dd3e16eb6283b365b3f696`

## Funding Address

Fund this testnet address when the node needs CKB for Fiber channel operations:

```txt
ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqf28s9d3v5hjmrw06hepvr69xagcydkm6ccanvdu
```

The address is derived from `node_info.default_funding_lock_script`. Do not commit or print the private key. The node key is stored in the Railway `/fiber` volume.

## Backend Wiring

The Vercel backend should use:

```txt
FIBER_RPC_URL=https://fiber-node-production.up.railway.app
FIBER_API_KEY=<Railway FIBER_RPC_PROXY_TOKEN>
```

Current production status endpoint:

```txt
https://fiberpassbackend.vercel.app/fiber/node/status
```

Expected status:

- `reachable: true`
- `apiKeyConfigured: true`
- `node.version: 0.9.0-rc7`
- `node.addresses` includes the Railway TCP multiaddr
- `node.fundingAddress` is present

## Verified On

- Date: 2026-07-13
- Public RPC health returned `ok`
- Public RPC rejected unauthenticated `node_info` with `401`
- Public RPC returned authenticated `node_info`
- Vercel backend `/fiber/node/status` returned `reachable: true`

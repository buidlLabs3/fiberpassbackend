#!/bin/sh
set -eu

FIBER_HOME="${FIBER_HOME:-/fiber}"
PORT="${PORT:-8080}"
FIBER_P2P_PORT="${FIBER_P2P_PORT:-8228}"
FIBER_ANNOUNCED_NODE_NAME="${FIBER_ANNOUNCED_NODE_NAME:-FiberPass Railway Testnet Node}"
CKB_TESTNET_RPC_URL="${CKB_TESTNET_RPC_URL:-https://testnet.ckb.dev/}"

if [ -z "${FIBER_SECRET_KEY_PASSWORD:-}" ]; then
  echo "FIBER_SECRET_KEY_PASSWORD is required." >&2
  exit 1
fi

if [ -z "${FIBER_RPC_PROXY_TOKEN:-}" ]; then
  echo "FIBER_RPC_PROXY_TOKEN is required." >&2
  exit 1
fi

mkdir -p "$FIBER_HOME/ckb" /etc/nginx/conf.d /run/nginx /var/log/nginx

if [ -n "${FIBER_NODE_CKB_PRIVATE_KEY:-}" ]; then
  printf '%s\n' "${FIBER_NODE_CKB_PRIVATE_KEY#0x}" > "$FIBER_HOME/ckb/key"
  chmod 600 "$FIBER_HOME/ckb/key"
fi

if [ ! -s "$FIBER_HOME/ckb/key" ]; then
  echo "Generating a new Fiber node CKB key in the persistent volume." >&2
  umask 077
  if command -v openssl >/dev/null 2>&1; then
    printf "%s\n" "$(openssl rand -hex 32)" > "$FIBER_HOME/ckb/key"
  else
    printf "%s\n" "$(od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]')" > "$FIBER_HOME/ckb/key"
  fi
  chmod 600 "$FIBER_HOME/ckb/key"
fi

if [ -n "${FIBER_PUBLIC_MULTIADDR:-}" ]; then
  ANNOUNCED_ADDRS="
    - \"${FIBER_PUBLIC_MULTIADDR}\""
else
  ANNOUNCED_ADDRS=" []"
fi

cat > "$FIBER_HOME/config.yml" <<EOF_CONFIG
# Generated at container boot by fiberpass-railway-entrypoint.sh.
fiber:
  listening_addr: "/ip4/0.0.0.0/tcp/${FIBER_P2P_PORT}"
  announced_node_name: "${FIBER_ANNOUNCED_NODE_NAME}"
  bootnode_addrs:
    - "/ip4/54.179.226.154/tcp/8228/p2p/Qmes1EBD4yNo9Ywkfe6eRw9tG1nVNGLDmMud1xJMsoYFKy"
    - "/ip4/16.163.7.105/tcp/8228/p2p/QmdyQWjPtbK4NWWsvy8s69NGJaQULwgeQDT5ZpNDrTNaeV"
  announce_listening_addr: true
  announced_addrs:${ANNOUNCED_ADDRS}
  chain: testnet
  scripts:
    - name: FundingLock
      script:
        code_hash: 0x6c67887fe201ee0c7853f1682c0b77c0e6214044c156c7558269390a8afa6d7c
        hash_type: type
        args: 0x
      cell_deps:
        - type_id:
            code_hash: 0x00000000000000000000000000000000000000000000000000545950455f4944
            hash_type: type
            args: 0x3cb7c0304fe53f75bb5727e2484d0beae4bd99d979813c6fc97c3cca569f10f6
        - cell_dep:
            out_point:
              tx_hash: 0x12c569a258dd9c5bd99f632bb8314b1263b90921ba31496467580d6b79dd14a7
              index: 0x0
            dep_type: code
    - name: CommitmentLock
      script:
        code_hash: 0x740dee83f87c6f309824d8fd3fbdd3c8380ee6fc9acc90b1a748438afcdf81d8
        hash_type: type
        args: 0x
      cell_deps:
        - type_id:
            code_hash: 0x00000000000000000000000000000000000000000000000000545950455f4944
            hash_type: type
            args: 0xf7e458887495cf70dd30d1543cad47dc1dfe9d874177bf19291e4db478d5751b
        - cell_dep:
            out_point:
              tx_hash: 0x12c569a258dd9c5bd99f632bb8314b1263b90921ba31496467580d6b79dd14a7
              index: 0x0
            dep_type: code

rpc:
  listening_addr: "127.0.0.1:8227"

ckb:
  rpc_url: "${CKB_TESTNET_RPC_URL}"
  udt_whitelist:
    - name: RUSD
      script:
        code_hash: 0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a
        hash_type: type
        args: 0x878fcc6f1f08d48e87bb1c3b3d5083f23f8a39c5d5c764f253b55b998526439b
      cell_deps:
        - type_id:
            code_hash: 0x00000000000000000000000000000000000000000000000000545950455f4944
            hash_type: type
            args: 0x97d30b723c0b2c66e9cb8d4d0df4ab5d7222cbb00d4a9a2055ce2e5d7f0d8b0f
      auto_accept_amount: 1000000000

services:
  - fiber
  - rpc
  - ckb
EOF_CONFIG

envsubst '$PORT $FIBER_RPC_PROXY_TOKEN' \
  < /etc/nginx/templates/fiberpass.conf.template \
  > /etc/nginx/conf.d/default.conf

fnn -c "$FIBER_HOME/config.yml" -d "$FIBER_HOME" &
fiber_pid="$!"

trap 'kill "$fiber_pid" 2>/dev/null || true' INT TERM

sleep 3

nginx -g 'daemon off;' &
nginx_pid="$!"

(
  wait "$fiber_pid"
  fiber_status="$?"
  echo "Fiber node exited with status $fiber_status." >&2
  kill "$nginx_pid" 2>/dev/null || true
  exit "$fiber_status"
) &
watcher_pid="$!"

wait "$nginx_pid"
nginx_status="$?"
kill "$fiber_pid" 2>/dev/null || true
kill "$watcher_pid" 2>/dev/null || true
exit "$nginx_status"

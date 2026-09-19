#!/usr/bin/env bash
# Nexora — Monad Testnet deployment runbook script.
#
# Deploys NexoraRegistry + NexoraEscrow to Monad Testnet (chainId 10143) and
# writes config/deployment.json, which the app resolves automatically.
#
# SECURITY: this script NEVER contains private keys. You supply three
# throwaway TESTNET-ONLY keys you generated yourself (see DEPLOYMENT.md):
#   • the deployer key    — funds and deploys the two contracts
#   • the verifier key    — becomes the escrow's on-chain verifier operator
#                           (signs settle() + verification receipts)
#   • the seller agent key— the demo "seller agent" wallet (signs submitWork)
#
# Wallets needed afterwards (Monad reserve-balance rule — each EOA keeps a
# ≥ 10 MON floor or transactions throttle to ~1 per 1.2 s):
#   • deployer   ≥ 0.3 MON   (2 contract deploys)
#   • verifier   ≥ 10 MON    (settle transactions during demos)
#   • seller     ≥ 10 MON    (one-time registerAgent + submitWork)
#   • your browser wallet (the buyer) ≥ escrow amount + gas per demo
# Fund everything from https://faucet.monad.xyz (GitHub login).
# Freshly-funded accounts need ~1.2 s (3 blocks) before they can send.
#
# Usage:
#   bash scripts/deploy-testnet.sh            # keys read from the env vars below
#
# Required environment:
#   DEPLOYER_PRIVATE_KEY     0x…  funded deployer key
#   VERIFIER_PRIVATE_KEY     0x…  settlement operator key (testnet only!)
#   SELLER_AGENT_PRIVATE_KEY 0x…  demo seller agent key (testnet only!)
#
# Optional environment:
#   NEXORA_RPC   default https://testnet-rpc.monad.xyz

set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$PATH:$HOME/.foundry/bin:/home/z/.foundry/bin"

RPC="${NEXORA_RPC:-https://testnet-rpc.monad.xyz}"
EXPLORER="https://testnet.monadscan.com"

# ── keys (required — no defaults, no fallbacks, no hardcoded dev keys) ──────
need() {
  if [ -z "${!1:-}" ]; then
    echo "✗ $1 is not set."
    echo "  Generate a throwaway testnet key:"
    echo "    cast wallet new"
    echo "  Then export it and re-run:"
    echo "    export $1=0x…"
    exit 1
  fi
}
need DEPLOYER_PRIVATE_KEY
need VERIFIER_PRIVATE_KEY
need SELLER_AGENT_PRIVATE_KEY

command -v forge >/dev/null 2>&1 || { echo "✗ Foundry not found — curl -L https://foundry.paradigm.xyz | bash && foundryup"; exit 1; }

DEPLOYER_ADDR=$(cast wallet address "$DEPLOYER_PRIVATE_KEY")
VERIFIER_ADDR=$(cast wallet address "$VERIFIER_PRIVATE_KEY")
SELLER_ADDR=$(cast wallet address "$SELLER_AGENT_PRIVATE_KEY")

echo "▶ Nexora → Monad Testnet"
echo "  rpc      : $RPC"
echo "  explorer : $EXPLORER"
echo "  deployer : $DEPLOYER_ADDR"
echo "  verifier : $VERIFIER_ADDR"
echo "  seller   : $SELLER_ADDR"

# ── deployer balance check ──────────────────────────────────────────────────
BAL=$(cast balance "$DEPLOYER_ADDR" --rpc-url "$RPC" 2>/dev/null || echo "0")
BALANCE_MON=$(python3 -c "print(float('$BAL'))" 2>/dev/null || echo 0)
echo "  deployer balance: $BALANCE_MON MON"
if python3 -c "exit(0 if $BALANCE_MON < 0.3 else 1)"; then
  echo "✗ deployer needs ≥ 0.3 MON. Fund it at https://faucet.monad.xyz and re-run."
  exit 1
fi
if python3 -c "exit(0 if $BALANCE_MON > 10_000_000 else 1)"; then
  echo "✗ This looks like MAINNET — refusing. Monad Testnet balances are small."
  exit 1
fi

# refuse any chain other than Monad Testnet 10143
CHAIN=$(cast chain-id --rpc-url "$RPC")
if [ "$CHAIN" != "10143" ]; then
  echo "✗ RPC chain id is $CHAIN — Nexora deploys ONLY to Monad Testnet (10143)."
  exit 1
fi

# ── deploy (forge script writes config/deployment.json itself) ──────────────
echo
echo "▶ Deploying NexoraRegistry + NexoraEscrow…"
PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
VERIFIER_ADDRESS="$VERIFIER_ADDR" \
forge script script/Deploy.s.sol \
  --rpc-url "$RPC" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --verifier-address "$VERIFIER_ADDR" \
  --broadcast -vv

# ── sanity: the deployment record must exist and point at 10143 ─────────────
python3 - <<'PY'
import json, sys
d = json.load(open("config/deployment.json"))
assert d["chainId"] == 10143, f"chainId {d['chainId']} ≠ 10143"
for k in ("registry", "escrow"):
    assert d[k] and d[k].startswith("0x"), f"{k} missing in deployment record"
print(f"✓ deployment record OK: escrow={d['escrow']} registry={d['registry']}")
PY

# ── register the demo seller agent (one tx from the seller key) ─────────────
echo
echo "▶ Registering the demo seller agent in NexoraRegistry…"
ESCROW=$(python3 -c "import json; print(json.load(open('config/deployment.json'))['escrow'])")
REGISTRY=$(python3 -c "import json; print(json.load(open('config/deployment.json'))['registry'])")

# only register if not already active
ACTIVE=$(cast call "$REGISTRY" "getAgent(address)(address,string,string,uint256,bool)" "$SELLER_ADDR" --rpc-url "$RPC" 2>/dev/null | tail -1 || echo "false")
if echo "$ACTIVE" | grep -qi "true"; then
  echo "  seller already registered and active — skipping."
else
  cast send "$REGISTRY" \
    "registerAgent(string,string,uint256)" \
    "Nexora-Demo-Seller" "security-assessment" 0 \
    --private-key "$SELLER_AGENT_PRIVATE_KEY" \
    --rpc-url "$RPC"
fi

cat <<SUMMARY


▶ Deployment complete.
  escrow   : $ESCROW
  registry : $REGISTRY
  verifier : $VERIFIER_ADDR   (settle operator — keep its key server-side)

Next steps:
  1. Commit the updated config/deployment.json (public data, no secrets).
  2. Publish the contract sources:  bash scripts/verify-contracts.sh
  3. Set your runtime environment (see .env.example):
       VERIFIER_PRIVATE_KEY, SELLER_AGENT_PRIVATE_KEY, GEMINI_API_KEY
  4. Run the app locally (bun run dev) or deploy to Vercel (DEPLOYMENT.md).
  5. Open the dashboard, connect your funded browser wallet (the buyer),
     and run the green demo, then the prompt-injection demo.

Every address above is public on-chain data. Never commit any private key.
SUMMARY

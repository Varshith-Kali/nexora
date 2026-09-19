#!/bin/bash
# Nexora — verify contract source code on Monad Testnet (chain 10143).
#
# Publishes the source of NexoraRegistry + NexoraEscrow so judges and users
# can read + recompile the contracts on the block explorers ("verified ✓"
# badge). Verified source is a judging requirement — keep it working.
#
# PRIMARY route (per monskills / blitz resources): the devnads verification
#   API — ONE call verifies the contract on ALL Monad explorers
#   (MonadVision, Socialscan, Monadscan) at once.
#     POST https://agents.devnads.com/v1/verify
#     { chainId, contractAddress, contractName, compilerVersion,
#       standardJsonInput, foundryMetadata, constructorArgs? }
#
# FALLBACK routes (only if the API is down — one success is enough):
#   1. Sourcify  — https://sourcify-api-monad.blockvision.org/  (chain 10143)
#   2. Blockscout — https://testnet.monadvision.com/api         (MonadVision)
#
# Prereq: contracts already deployed (config/deployment.json says chainId 10143
#         — run scripts/deploy-testnet.sh first).
# Prereq: Foundry v1.8+ (`forge --version`).
#
# Usage:
#   bash scripts/verify-contracts.sh

set -uo pipefail
cd "$(dirname "$0")/.."

export PATH="$PATH:/home/z/.foundry/bin:$HOME/.foundry/bin"

EXPLORER="https://testnet.monadscan.com"
VERIFY_API="https://agents.devnads.com/v1/verify"
SOURCIFY_URL="https://sourcify-api-monad.blockvision.org/"

if [ ! -f config/deployment.json ]; then
  echo "✗ config/deployment.json not found — deploy first (scripts/deploy-testnet.sh)."
  exit 1
fi

CHAIN_ID=$(python3 -c "import json; print(json.load(open('config/deployment.json'))['chainId'])")
if [ "$CHAIN_ID" != "10143" ]; then
  echo "✗ deployment.json chainId is $CHAIN_ID (expected 10143 = Monad Testnet)."
  echo "  Run bash scripts/deploy-testnet.sh first."
  exit 1
fi

REGISTRY=$(python3 -c "import json; print(json.load(open('config/deployment.json'))['registry'])")
ESCROW=$(python3 -c "import json; print(json.load(open('config/deployment.json'))['escrow'])")
VERIFIER=$(python3 -c "import json; print(json.load(open('config/deployment.json'))['verifier'])")

echo "▶ Verifying Nexora contracts on Monad Testnet (chain 10143)"
echo "  registry : $REGISTRY"
echo "  escrow   : $ESCROW"
echo "  primary  : devnads verification API (verifies all explorers at once)"
echo "  explorer : $EXPLORER"
echo

# Fresh artifacts (metadata must match the deployed bytecode exactly)
forge build 2>/dev/null || { echo "✗ forge build failed"; exit 1; }

# NexoraEscrow constructor args: (address _registry, address _verifier)
ESCROW_ARGS=$(cast abi-encode "constructor(address,address)" "$REGISTRY" "$VERIFIER" 2>/dev/null || true)

# ---------------------------------------------------------------------------
# Primary: devnads verification API — all explorers, one call
# ---------------------------------------------------------------------------
verify_via_api() { # $1 = address, $2 = contract path:name, $3 = ctor args (may be empty)
  local addr="$1" name="$2" ctor="$3"

  # 1) standard JSON input (all sources + settings, exactly as compiled)
  local std_json
  std_json=$(forge verify-contract "$addr" "$name" --chain 10143 --show-standard-json-input 2>/dev/null) || return 1

  # 2) foundry metadata from the compilation output
  local artifact
  artifact="out/$(basename "${name%%:*}" .sol).sol/$(basename "${name#*:}").json"
  [ -f "$artifact" ] || artifact="out/${name%%:*}/${name#*:}.json"
  [ -f "$artifact" ] || return 1
  local meta compiler
  meta=$(jq '.metadata' "$artifact") || return 1
  compiler="v$(jq -r '.compiler.version' <<<"$meta")"

  # 3) assemble + POST (python3 keeps the JSON strictly correct)
  ADDR="$addr" NAME="$name" COMPILER="$compiler" CTOR="$ctor" \
  STD_JSON="$std_json" META="$meta" API="$VERIFY_API" python3 - <<'PYEOF'
import json, os, urllib.request, urllib.error

payload = {
    "chainId": 10143,
    "contractAddress": os.environ["ADDR"],
    "contractName": os.environ["NAME"],
    "compilerVersion": os.environ["COMPILER"],
    "standardJsonInput": json.loads(os.environ["STD_JSON"]),
    "foundryMetadata": json.loads(os.environ["META"]),
}
if os.environ.get("CTOR"):
    payload["constructorArgs"] = os.environ["CTOR"].removeprefix("0x")

req = urllib.request.Request(
    os.environ["API"],
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=90) as res:
        body = res.read().decode()
        print(f"    API HTTP {res.status}: {body[:300]}")
        raise SystemExit(0 if res.status == 200 else 1)
except urllib.error.HTTPError as e:
    print(f"    API HTTP {e.code}: {e.read().decode()[:300]}")
    raise SystemExit(1)
except Exception as e:
    print(f"    API request failed: {e}")
    raise SystemExit(1)
PYEOF
}

# ---------------------------------------------------------------------------
# Fallback: forge verify-contract (sourcify, then blockscout)
# ---------------------------------------------------------------------------
verify_fallback() { # $1 = address, $2 = contract name, $3 = extra args
  local addr="$1" name="$2" extra="$3"

  echo "  [fallback 1/2] Sourcify…"
  forge verify-contract "$addr" "$name" \
    --chain 10143 \
    --verifier sourcify \
    --verifier-url "$SOURCIFY_URL" \
    $extra 2>&1 | sed 's/^/       /'

  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    echo "  [fallback 2/2] Blockscout (MonadVision)…"
    forge verify-contract "$addr" "$name" \
      --chain 10143 \
      --verifier blockscout \
      --verifier-url "https://testnet.monadvision.com/api" \
      $extra 2>&1 | sed 's/^/       /'
  else
    echo "  [fallback 2/2] skipped — Sourcify already succeeded."
  fi
}

verify_one() { # $1 = address, $2 = path:name, $3 = short name, $4 = ctor args
  local addr="$1" fq="$2" short="$3" ctor="$4"
  echo "── $short ($addr) ──"
  echo "  [primary] devnads verification API…"
  if verify_via_api "$addr" "$fq" "$ctor"; then
    echo "  ✓ submitted via verification API (all explorers)"
  else
    echo "  ⚠ API route failed — falling back to forge routes"
    verify_fallback "$addr" "$short" "$([ -n "$ctor" ] && echo "--constructor-args $ctor")"
  fi
  echo
}

verify_one "$REGISTRY" "contracts/NexoraRegistry.sol:NexoraRegistry" "NexoraRegistry" ""
verify_one "$ESCROW" "contracts/NexoraEscrow.sol:NexoraEscrow" "NexoraEscrow" "$ESCROW_ARGS"

echo "✓ Verification submitted. Check the badges (give the explorers ~1 minute):"
echo "  Monadscan:   $EXPLORER/address/$REGISTRY#code"
echo "               $EXPLORER/address/$ESCROW#code"
echo "  MonadVision: https://testnet.monadvision.com/address/$REGISTRY#code"
echo "               https://testnet.monadvision.com/address/$ESCROW#code"
echo
echo "Sanity-check the deployed bytecode matches (should print a 0x… string, not 0x):"
echo "  cast code $ESCROW --rpc-url https://testnet-rpc.monad.xyz"
echo
echo "If every route failed, update Foundry and retry:"
echo "  curl -L https://foundry.paradigm.xyz | bash && foundryup"

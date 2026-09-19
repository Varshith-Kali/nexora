# Nexora — Deployment Runbook (you drive, step by step)

Everything runs on **Monad Testnet only** (chainId `10143`). Faucet MON is
free; nothing here can touch mainnet — the app hard-refuses any chain but
10143 at settlement time, and the deploy script aborts on a non-10143 RPC.

You will do five things yourself: fund wallets, deploy contracts, verify
sources, configure environment, deploy the website. Estimated time: ~15
minutes excluding faucet waits.

---

## 1. Requirements

| Tool | Check | Install |
|---|---|---|
| Node ≥ 20 (or bun ≥ 1.1) | `node -v` | <https://nodejs.org> |
| Foundry (forge + cast) | `forge --version` | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Python 3 (deploy helpers) | `python3 --version` | — |
| Git | `git --version` | — |
| A browser wallet (MetaMask…) | — | — |
| Google AI Studio key | — | <https://aistudio.google.com/apikey> |

## 2. Environment variables (what each is for)

Copy `.env.example` → `.env.local` for local runs; set the same names on
Vercel later.

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | for real AI | server-side Gemini calls. Without it the app runs **DEMO MOCK MODE** (clearly labeled — never silently faked) |
| `GEMINI_MODEL` | no | default `gemini-3.1-flash-lite` |
| `VERIFIER_PRIVATE_KEY` | for settlement | signs receipts + `settle()`. Its address MUST be the `VERIFIER_ADDRESS` you pass at deploy time (the escrow's registered verifier) |
| `SELLER_AGENT_PRIVATE_KEY` | for submit step | the demo seller agent wallet |
| `MONAD_TESTNET_RPC_URL` / `MONAD_TESTNET_CHAIN_ID` | no | override the defaults (official public RPC) |
| `MONAD_ESCROW_ADDRESS` / `MONAD_REGISTRY_ADDRESS` / `MONAD_VERIFIER_ADDRESS` | no | override `config/deployment.json` (useful on Vercel) |
| `POLICY_PASS_THRESHOLD` / `POLICY_CONFIDENCE_THRESHOLD` | no | policy tuning (80 / 0.7) |

**Never** commit any key. Never use a key that holds real funds — generate
throwaway testnet keys with `cast wallet new`.

## 3. Install & test

```bash
git clone https://github.com/<your-user>/nexora && cd nexora
npm install            # or bun install
npm test               # 63 vitest tests — policy, injection, schema, receipts, API
npm run contracts:test # 22 forge tests — lifecycle, auth, reentrancy
npm run typecheck && npm run lint
```

All must pass before you deploy. If they don't, stop and fix.

## 4. Generate & fund the wallets

Three throwaway **testnet** keys (deployer, verifier operator, seller agent)
plus your browser wallet as the buyer:

```bash
cast wallet new   # → deployer    fund ≥ 0.3 MON
cast wallet new   # → verifier    fund ≥ 10 MON
cast wallet new   # → seller      fund ≥ 10 MON
```

Fund all of them (and your browser wallet) at
<https://faucet.monad.xyz> — GitHub login, free.

> Monad reserve-balance rule: each EOA keeps a **10 MON floor**; below it,
> transactions throttle to ~1 per 1.2 s and settles can fail. Freshly funded
> accounts need ~1.2 s (3 blocks) before their first send.

## 5. Deploy the contracts

```bash
export DEPLOYER_PRIVATE_KEY=0x…      # your generated deployer key
export VERIFIER_PRIVATE_KEY=0x…      # settlement operator key
export SELLER_AGENT_PRIVATE_KEY=0x…  # demo seller agent key

bash scripts/deploy-testnet.sh
```

The script: checks balances, refuses non-10143 chains, deploys
`NexoraRegistry` + `NexoraEscrow` via `script/Deploy.s.sol`, writes
`config/deployment.json`, registers the demo seller agent, and prints the
addresses. **Commit the updated `config/deployment.json`** — it is public
on-chain data (chainId, addresses, deployer, block) and the app reads it.

## 6. Verify the contract sources

```bash
bash scripts/verify-contracts.sh
```

Publishes the Solidity source via the devnads verification API (verifies on
all Monad explorers at once), with Sourcify/Blockscout fallbacks. After ~1
minute the “verified ✓” badge appears at
`https://testnet.monadscan.com/address/<escrow>#code`.

## 7. Configure & run locally

```bash
cp .env.example .env.local
# edit .env.local: GEMINI_API_KEY, VERIFIER_PRIVATE_KEY, SELLER_AGENT_PRIVATE_KEY
npm run dev      # → http://localhost:3000
```

Pre-demo health check: open <http://localhost:3000/api/health> — confirm
`contracts.configured: true`, `network.testnetOnly: true`,
`agents.verifierSignerMatchesOnChain: true`, `ai.mockMode: false`.

## 8. Deploy to Vercel (free)

```bash
git push origin main     # repo must be public for judges to read the source
```

Then on <https://vercel.com>: **Add New → Project → Import** your `nexora`
repo (framework auto-detected: Next.js; no build settings needed). Set
**Environment Variables** (Production + Preview):

```
GEMINI_API_KEY=…
VERIFIER_PRIVATE_KEY=…
SELLER_AGENT_PRIVATE_KEY=…
GEMINI_MODEL=gemini-3.1-flash-lite
```

Deploy. (Since `config/deployment.json` is committed, no address overrides
are needed; optionally also set `MONAD_ESCROW_ADDRESS` /
`MONAD_REGISTRY_ADDRESS`.)

## 9. Smoke-test the deployment

1. Open the live URL → header chips should show **Monad Testnet**, contracts
   configured, and the AI provider (Gemini, not mock).
2. Connect wallet → the dashboard shows your address + MON balance; if on the
   wrong network it says “Switch to Monad Testnet”.
3. Run the **green demo** end-to-end (below) → click the settle tx link →
   it must open a real transaction on Monadscan.
4. Run the **prompt-injection demo** → REFUND tx on Monadscan.

### Green path (successful demo)

Load “Successful demo” → **Create & fund job** (confirm in wallet) →
**Submit work** → **Verify with Gemini** (PASS, score 100, policy RELEASE) →
**Release** → click the tx hash → Monadscan shows the transfer to the seller.

### Red path (prompt-injection demo)

Load “Prompt-injection demo” → same four steps → the verdict FAILs with
injection signals, policy REFUND → **Refund** → Monadscan shows the buyer
getting their MON back.

## 10. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Header says **DEMO MOCK MODE** | `GEMINI_API_KEY` unset on the server (or misspelled) |
| `verifierSignerMatchesOnChain: false` | `VERIFIER_PRIVATE_KEY` doesn't match the address passed as `VERIFIER_ADDRESS` at deploy → redeploy or fix the key |
| Settle tx reverts “not verifier” | same mismatch, on-chain: the escrow only accepts its constructor-registered verifier |
| settle/submit txs timing out | seller/verifier wallet fell below the **10 MON reserve floor** → top up at the faucet, wait ~1.2 s |
| “Job #N is already Released/Refunded” | idempotency at work — reload the demo state, start a new job |
| Gemini 429s | free-tier rate limit — wait a minute; the policy fails closed (REVIEW), funds stay in escrow |
| faucet refuses | GitHub account required; wait for cooldown |

## 11. Pre-demo checklist

- [ ] `npm test`, `forge test`, `npm run build` all pass
- [ ] `/api/health` → configured, testnet-only, signer matches, **Gemini (not mock)**
- [ ] Buyer wallet funded (≥ escrow + gas), verifier & seller ≥ 10 MON
- [ ] Contract sources show “verified ✓” on Monadscan
- [ ] Green demo settles with a real tx on Monadscan
- [ ] Red demo refunds with a real tx on Monadscan
- [] Live Vercel URL works from a fresh browser (incognito)
- [ ] Repo pushed; README “Live demo & contracts” table updated with the URL + addresses

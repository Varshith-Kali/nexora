# Nexora — Cleanup Report

What changed during the AgentPay → **Nexora** refactor: inspected first,
removed only what was confirmed unused or harmful to the target architecture,
preserved the working blockchain/escrow core.

## REMOVED

| Item | Why |
|---|---|
| `bots/` (buyerAgent, sellerAgent, shared, own package.json) | continuous transaction loops; replaced by explicit, user-triggered demo actions (the judge triggers every step; a page load never spends MON) |
| `mini-services/verifier-service/` (socket.io server, fraudRules, job store, own package.json) | converted into request-driven Next.js API routes + `src/lib/nexora/*`; no separate backend hosting, no always-on process |
| WebSocket infrastructure (socket.io client hook `use-agentpay-feed.ts`, `:4000/:4001` ports) | on-demand architecture: fetch on action, receipt polling only while a tx is in flight |
| `src/app/api/chain/state` (hammered a dead local anvil RPC, caused the “1 Issue” dev overlay) | replaced by read-only `/api/health` + `/api/job-state` with soft-fail probes |
| Old dashboard components (feed tables, stats, charts, Presentation-Mode animation engine) | replaced by the focused demo console (Job → Escrow → Work → Verification → Policy → Settlement) |
| ~24 unused shadcn/ui components (carousel, chart, command, form, sidebar, toast, …) + 2 unused after audit (alert, separator) | dependency-graph audit: never imported |
| Local data/log persistence (`data/`, job store, `*.log`) | request-scoped, stateless — Vercel-compatible, no filesystem assumptions |
| `config/monad.testnet.json`, `config/agents.json` | superseded by the single `config/deployment.json` record + one central chain module |
| Sandbox/deploy template files (`.zscripts/`, `Caddyfile`, `.gitmodules`, `db/`, python/runtime test scripts) | not part of the product |
| Hardcoded anvil deterministic private keys in `deploy-testnet.sh` | security audit: scripts now REQUIRE user-supplied throwaway testnet keys; no defaults, no fallbacks |
| `scripts/faucet-devnads.sh`, demo-orchestration scripts | obsolete with the bot removal (funding is a documented manual step at faucet.monad.xyz) |
| `public/logo.svg` (old branding) | replaced by `public/nexora.svg` |

## RENAMED / REBRANDED

| From | To | Note |
|---|---|---|
| AgentPay (product) | Nexora | throughout UI, docs, package metadata |
| `AgentRegistry.sol` | `NexoraRegistry.sol` | safe: contracts were **not yet deployed** when renamed — no ABI/address breakage |
| `AgentEscrow.sol` | `NexoraEscrow.sol` | same |
| test files | `test/Nexora*.t.sol` | updated to the new contract names |

## KEPT (working functionality preserved)

| Item | Why |
|---|---|
| Escrow contract design (job state machine, verifier-only settle, CEI + reentrancy guard, custom errors) | audited sound; 22 Foundry tests still pass unchanged in spirit |
| Registry contract + agent registration flow | the buyer's `openJob` still targets a registered seller |
| Hash-on-chain / content-off-chain pattern (`keccak256` of submission) | core trust anchor — now also enforced at verification time (hash-match policy check) |
| wagmi/viem wallet integration | buyer = judge's browser wallet, wrong-network handling, auto-add Monad Testnet |
| Deterministic fraud gate concepts (empty/lazy/injection detection) | evolved into the 3-layer verifier (regex + Gemini + policy) |
| Foundry setup (`foundry.toml`, forge-std, `script/Deploy.s.sol`) | same deploy flow, now writing the single deployment record |
| Dark “technical, credible, minimal” visual language | master prompt §69; trimmed of fake analytics/activity feeds |

## REFACTORED

| Area | Change |
|---|---|
| Verification | heuristic fraud rules → server-side **Gemini** (strict structured output, one call) + zod runtime validation + labeled mock fallback |
| Authorization | “verifier service decides” → **deterministic policy engine** with thresholds in code, injection override, REVIEW state, fail-closed everywhere |
| Settlement | bots/settle loops → policy-gated `/api/settle` with signed expiring receipts, testnet-only guard, idempotency |
| Config | scattered chain IDs/RPCs → `src/lib/nexora/chain.ts` (env → deployment.json precedence) + `src/config/contracts.ts` (client) |
| Testing | 22 forge tests kept + **63 vitest tests added** (policy, injection, schema, receipts, API fail-closed paths) |
| Docs | all six docs rewritten for the final architecture (README, DEPLOYMENT, ARCHITECTURE, SECURITY, DEMO, this file) |

## Resulting runtime footprint

- **One** Next.js app (Vercel- deployable), zero background services, zero
  databases, zero websockets, zero continuous polling.
- **Three** transactions per demo path — all explicit, all user-confirmed.
- Money moves in exactly one place: `/api/settle`, after seven fail-closed
  checks.

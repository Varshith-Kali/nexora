# Nexora — Architecture

**AI-Verified Agent Commerce.** One Next.js application, two Solidity
contracts, one AI provider, zero background infrastructure. On-demand by
design: every state change is an explicit, user-triggered action.

```
                         ┌────────────────────────────┐
                         │   Next.js app (Vercel)     │
                         │  ─ browser (client)        │
                         │    wallet · demo console   │
                         │  ─ server routes           │
                         │    /api/jobs /submit-work  │
                         │    /verify /settle /health │
                         └─────────────┬──────────────┘
              browser wallet (buyer)  │  server keys (seller, verifier)
                    openJob() ┌───────┴───────┐ submitWork()  settle()
                              ▼               ▼
                    ┌─────────────────────────────────┐
                    │  Monad Testnet 10143            │
                    │  NexoraRegistry · NexoraEscrow  │
                    └─────────────────────────────────┘
                              │ receipt-signed authorization
                    ┌─────────▼────────────────────────┐
                    │ Gemini (server-side, one call)   │
                    │ + deterministic policy engine    │
                    └──────────────────────────────────┘
```

## Components

| Layer | Files | Responsibility |
|---|---|---|
| Escrow contract | `contracts/NexoraEscrow.sol` | custody, job state machine, settlement enforcement |
| Registry contract | `contracts/NexoraRegistry.sol` | public directory of agent wallets |
| Chain config | `src/lib/nexora/chain.ts` | the ONE place chainId / RPC / addresses resolve (env → deployment.json) |
| On-chain actions | `src/lib/nexora/agents.ts` | server-side signing of `submitWork` (seller key), `settle` (verifier key) |
| AI provider | `src/lib/nexora/gemini.ts` | Gemini REST call, strict responseSchema, labeled mock fallback |
| Injection detector | `src/lib/nexora/injection.ts` | layer-1 regex scan + substance checks (deterministic) |
| Schema validation | `src/lib/nexora/schema.ts` | zod validation of model output + API inputs; deterministic scoring |
| Policy engine | `src/lib/nexora/policy.ts` | THE authorization boundary — decides RELEASE / REFUND / MANUAL_REVIEW |
| Receipts | `src/lib/nexora/receipt.ts` | signed, expiring, job-bound attestations between verify and settle |
| Verification pipeline | `src/lib/nexora/verify.ts` | orchestrates input → integrity → AI → schema → policy → receipt |
| API routes | `src/app/api/*` | thin, rate-limited, fail-closed HTTP surface |
| Demo console | `src/hooks/use-nexora.ts` + `src/components/nexora/*` | the explicit state machine and UI |

## Trust boundaries (the whole security model in one table)

| Boundary | Rule |
|---|---|
| Seller → system | submission is **untrusted data** — evaluated, never obeyed |
| Gemini → system | model JSON is **untrusted output** — zod-validated, score recomputed deterministically |
| Policy → chain | only the policy engine can produce a settlement receipt; injection ⇒ release impossible regardless of verdict |
| API → chain | `/api/settle` re-verifies signature, expiry, job binding, chain id, escrow state, balance before signing |
| Chain → funds | the contract's own state machine reverts anything invalid — idempotent double-settles |
| Keys | buyer = browser wallet; seller + verifier = server env vars; Gemini holds no key |

## Verification flow (POST /api/verify — off-chain, zero MON)

1. **Input validation** — zod on `jobId / jobSpec / acceptanceCriteria / submission`.
2. **On-chain lookup** — job must exist and be `Submitted`.
3. **Integrity** — `keccak256(submission)` must equal the on-chain `outputHash`
   (the text being evaluated is provably what the seller committed).
4. **Layer-1 pre-scan** — substance checks + injection regex signals.
   Empty/placeholder work fails here without spending a Gemini call.
5. **One Gemini call** — server-side, strict `responseSchema`, temperature 0.1.
   The submission is framed as UNTRUSTED DATA in the system instruction.
6. **Schema validation** — zod parse; malformed ⇒ `REVIEW` (fail-closed).
7. **Policy engine** — deterministic decision from the inputs above.
8. **Receipt** — for RELEASE/REFUND only, signed by the verifier key
   (job-bound, 10-minute TTL, unique nonce).

Provider failure at any point ⇒ `REVIEW` with “No funds were released.”
Retry allowed; escrow untouched.

## Settlement flow (POST /api/settle — the only money-moving route)

1. zod input validation (`jobId`, `action`, `receipt`).
2. Receipt binding: `jobId` and `decision` must match the request.
3. Receipt verification: signature recovers to the configured verifier
   operator; not expired.
4. **Testnet-only guard**: configured chain must be 10143 — mainnet refused
   by design.
5. On-chain state: job exists, is `Submitted` (already settled ⇒ idempotent
   response, no new tx), receipt `submissionHash` matches `outputHash`.
6. Escrow accounting: contract balance covers the job amount.
7. Exactly then: `settle(approved)` signed by the verifier key, receipt
   polled (starts/stops — no infinite polling), result + explorer URL
   returned. The contract's state machine makes double settlement impossible.

## Failure flow

```
Gemini unavailable ──▶ REVIEW ──▶ no settlement, retry allowed
Malformed AI JSON ──▶ REVIEW ──▶ no settlement
Hash mismatch     ──▶ MANUAL_REVIEW ──▶ no settlement
Injection + PASS  ──▶ MANUAL_REVIEW (deterministic override) ──▶ no release
Injection + FAIL  ──▶ REFUND ──▶ buyer protected
Timeout after tx  ──▶ treated pessimistically (reverted)
```

Default behavior when uncertain: **do not release.**

## Data flow & hashing

The chain stores identifiers and settlement facts, not content:

- `outputHash` = `keccak256(submission text)` — committed by `submitWork()`
- `verificationHash` = `keccak256({verdict, score, policy, jobId})` — inside the signed receipt
- The full job spec, criteria, submission and AI reasoning live off-chain
  (request-scoped; nothing persisted server-side, no database)

This demonstrates *what* was evaluated, *what* settled and *when*, without
bloating the chain.

## Frontend

A single page (`src/app/page.tsx`): hero answering WHAT/WHY/HOW in 20
seconds, then the live demo console. Every action is a button with a
confirmation; the wallet signs the buyer leg in-browser. No websockets, no
polling loops — the only waiting is viem's `waitForTransactionReceipt`,
which starts when a tx is submitted and stops when the receipt lands.
localStorage remembers the current demo job id across refreshes (read-only
lookup on load — never a transaction).

## What is deliberately NOT here

Bots, background loops, websockets, databases, queues, indexers, Docker,
extra services. The judge triggers every important action; a page load never
spends MON. See CLEANUP_REPORT.md for what was removed and why.

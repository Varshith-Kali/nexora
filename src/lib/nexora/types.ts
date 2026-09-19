/**
 * Nexora — shared types for the verification & settlement pipeline.
 *
 * Trust model (see ARCHITECTURE.md):
 *   Gemini          = intelligence layer (off-chain, server-side)
 *   Policy engine   = authorization boundary (deterministic, in code)
 *   Smart contract  = settlement enforcement (on Monad Testnet)
 *
 * Gemini NEVER controls funds. The policy engine NEVER custodies funds.
 */

/** Verdict of the AI verification layer. */
export type Verdict = "PASS" | "FAIL" | "REVIEW";

/** Final action authorized by the deterministic policy engine. */
export type PolicyDecision = "RELEASE" | "REFUND" | "MANUAL_REVIEW";

/** What the user asks /api/settle to execute (must match the receipt). */
export type SettlementAction = "RELEASE" | "REFUND";

/** Per-criterion evaluation produced by the AI verifier. */
export interface CriterionResult {
  name: string;
  status: "PASS" | "FAIL";
  evidence: string;
}

/** Raw (schema-validated) result coming out of the AI provider. */
export interface AIVerification {
  verdict: Verdict;
  score: number; // model self-assessment, informational only
  confidence: number;
  criteria: CriterionResult[];
  violations: string[];
  promptInjectionDetected: boolean;
  missingRequirements: string[];
  reason: string;
}

/**
 * The complete verification result returned by POST /api/verify.
 * Everything the UI needs to explain WHY funds moved or did not move.
 */
export interface VerificationResult {
  jobId: number;
  provider: "gemini" | "mock";
  model: string;
  /** Integrity: keccak256(submission) vs the on-chain outputHash. */
  submissionHash: string;
  onChainHash: string;
  hashMatches: boolean;
  /** Deterministic pre-checks (run before the AI call). */
  preChecks: { name: string; passed: boolean; detail: string }[];
  /** Combined injection flag: AI detection OR deterministic signals. */
  promptInjectionDetected: boolean;
  injectionSignals: string[];
  verdict: Verdict;
  /** Deterministic score recomputed from criterion statuses (weights in policy.ts). */
  score: number;
  confidence: number;
  criteria: CriterionResult[];
  violations: string[];
  missingRequirements: string[];
  reason: string;
  policy: PolicyResult;
  /** Signed attestation enabling a later /api/settle call (RELEASE/REFUND only). */
  receipt: VerificationReceipt | null;
}

export interface PolicyResult {
  decision: PolicyDecision;
  checks: { name: string; passed: boolean; detail: string }[];
  reason: string;
}

/** EOA-signed attestation produced by the verifier operator key. */
export interface VerificationReceipt {
  jobId: number;
  decision: Exclude<PolicyDecision, "MANUAL_REVIEW">;
  submissionHash: string;
  verificationHash: string;
  expiresAt: number; // unix seconds
  nonce: string; // random hex — makes each receipt unique
  signature: string; // hex, by VERIFIER_PRIVATE_KEY over keccak(payload)
}

/** On-chain job shape returned by NexoraEscrow.getJob(). */
export interface OnChainJob {
  buyer: string;
  seller: string;
  amount: bigint;
  outputHash: string;
  status: "Open" | "Submitted" | "Released" | "Refunded";
  createdAt: bigint;
}

/** Result of a settlement transaction (real values only — never fabricated). */
export interface SettlementResult {
  jobId: number;
  action: SettlementAction;
  txHash: string;
  blockNumber: number | null;
  status: "success" | "reverted";
  recipient: string;
  amountMon: string;
  explorerUrl: string;
  alreadySettled?: boolean;
}

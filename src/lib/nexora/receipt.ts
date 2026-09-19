/**
 * Nexora — signed verification receipts (server-side only).
 *
 * /api/verify never touches the chain. When the policy engine authorizes a
 * settlement (RELEASE or REFUND), it signs an attestation with the verifier
 * operator key (VERIFIER_PRIVATE_KEY — the same address the NexoraEscrow
 * constructor registered as `verifier`). /api/settle later verifies this
 * signature and only then submits the on-chain settle() transaction.
 *
 * Why stateless: Vercel serverless functions cannot rely on in-memory state
 * between requests. A signed receipt is portable, replay-resistant and
 * auditable:
 *   - expiry     — receipts live 10 minutes (configurable)
 *   - nonce      — unique per receipt
 *   - job binding — jobId + submissionHash tie it to one exact job state
 *   - chain-of-trust — signature must recover to the configured verifier
 *   - double-settle is still impossible: the contract's own state machine
 *     reverts any second settle() (idempotency at the settlement root).
 */
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  toHex,
  verifyMessage,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type VerificationReceipt } from "./types";
import { chainId, monadTestnet, rpcUrl } from "./chain";

const RECEIPT_TTL_SECONDS = Number(process.env.RECEIPT_TTL_SECONDS ?? 600);

/** Address of the configured verifier operator key (null when unset). */
export function verifierAccountAddress(): `0x${string}` | null {
  const pk = process.env.VERIFIER_PRIVATE_KEY?.trim();
  if (!pk) return null;
  try {
    return privateKeyToAccount(normalizePrivateKey(pk) as `0x${string}`).address;
  } catch {
    return null;
  }
}

function normalizePrivateKey(pk: string): string {
  const hex = pk.startsWith("0x") ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("invalid verifier private key format");
  return `0x${hex}`;
}

function verifierAccount() {
  const pk = process.env.VERIFIER_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("VERIFIER_PRIVATE_KEY is not configured");
  return privateKeyToAccount(normalizePrivateKey(pk) as `0x${string}`);
}

/** Canonical payload string — the exact bytes being signed/verified. */
function receiptPayload(r: Omit<VerificationReceipt, "signature">): string {
  return [
    "nexora-verification-receipt-v1",
    `jobId:${r.jobId}`,
    `decision:${r.decision}`,
    `submissionHash:${r.submissionHash}`,
    `verificationHash:${r.verificationHash}`,
    `expiresAt:${r.expiresAt}`,
    `nonce:${r.nonce}`,
    `chainId:${chainId()}`,
  ].join("|");
}

function payloadDigest(payload: string): `0x${string}` {
  return keccak256(toBytes(payload));
}

/** Sign a receipt for an authorized (non-REVIEW) policy decision. */
export async function signReceipt(params: {
  jobId: number;
  decision: "RELEASE" | "REFUND";
  submissionHash: string;
  verificationHash: string;
}): Promise<VerificationReceipt | null> {
  if (!process.env.VERIFIER_PRIVATE_KEY?.trim()) return null;
  const account = verifierAccount();
  const core = {
    jobId: params.jobId,
    decision: params.decision,
    submissionHash: params.submissionHash,
    verificationHash: params.verificationHash,
    expiresAt: Math.floor(Date.now() / 1000) + RECEIPT_TTL_SECONDS,
    nonce: toHex(toBytes(`0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`).slice(0, 16)) as string,
  };
  const digest = payloadDigest(receiptPayload(core));
  const signature = await account.signMessage({ message: { raw: digest } });
  return { ...core, signature };
}

export interface ReceiptCheck {
  valid: boolean;
  error?: string;
  receipt: VerificationReceipt;
}

/** Full receipt verification — used by /api/settle before any transaction. */
export async function verifyReceipt(receipt: VerificationReceipt): Promise<ReceiptCheck> {
  const verifier = verifierAccountAddress();
  if (!verifier) return { valid: false, error: "VERIFIER_NOT_CONFIGURED", receipt };
  if (receipt.expiresAt < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: "RECEIPT_EXPIRED", receipt };
  }
  const core = {
    jobId: receipt.jobId,
    decision: receipt.decision,
    submissionHash: receipt.submissionHash,
    verificationHash: receipt.verificationHash,
    expiresAt: receipt.expiresAt,
    nonce: receipt.nonce,
  };
  const digest = payloadDigest(receiptPayload(core));
  let ok = false;
  try {
    ok = await verifyMessage({
      address: verifier,
      message: { raw: digest },
      signature: receipt.signature as `0x${string}`,
    });
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, error: "RECEIPT_SIGNATURE_INVALID", receipt };
  return { valid: true, receipt };
}

/** Server-side public client (read-only; used by all API routes). */
export function publicClient(): PublicClient {
  return createPublicClient({
    chain: { ...monadTestnet, id: chainId(), rpcUrls: { default: { http: [rpcUrl()] } } },
    transport: http(rpcUrl(), { timeout: 15_000 }),
  }) as PublicClient;
}

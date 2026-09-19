/**
 * POST /api/settle — policy-gated settlement on Monad Testnet.
 *
 * Input: { jobId, action: RELEASE|REFUND, receipt }
 *
 * Defense-in-depth before ANY transaction is signed (all checks fail closed):
 *   1. input schema (zod)
 *   2. receipt signature recovers to the configured verifier operator
 *   3. receipt unexpired, jobId + action match
 *   4. configured chain IS Monad Testnet (mainnet refused by design)
 *   5. on-chain: job exists, is Submitted, escrow funded
 *   6. receipt submissionHash === on-chain outputHash
 *   7. escrow balance covers the job amount
 *
 * Idempotency: if the job is already Released/Refunded, return the current
 * state WITHOUT creating a new transaction. The contract's own state machine
 * would revert a double-settle anyway — this makes the API polite about it.
 */
import { NextResponse } from "next/server";
import { type Abi } from "viem";
import {
  ESCROW_ABI,
  chainId,
  escrowAddress,
  explorerAddress,
  explorerTx,
} from "@/lib/nexora/chain";
import { publicClient, verifyReceipt } from "@/lib/nexora/receipt";
import { settleOnChain } from "@/lib/nexora/agents";
import { settleInputSchema } from "@/lib/nexora/schema";
import { rateLimit, clientKey } from "@/lib/nexora/ratelimit";
import type { OnChainJob, SettlementResult } from "@/lib/nexora/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function readJob(jobId: number): Promise<OnChainJob | null> {
  const escrow = escrowAddress();
  if (!escrow) return null;
  try {
    const raw = (await publicClient().readContract({
      address: escrow as `0x${string}`,
      abi: ESCROW_ABI as Abi,
      functionName: "getJob",
      args: [BigInt(jobId)],
    })) as [string, string, bigint, string, number, bigint];
    if (raw[0] === "0x0000000000000000000000000000000000000000") return null;
    const statuses = ["Open", "Submitted", "Released", "Refunded"] as const;
    return {
      buyer: raw[0],
      seller: raw[1],
      amount: raw[2],
      outputHash: raw[3],
      status: statuses[Number(raw[4])] ?? "Open",
      createdAt: raw[5],
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const limit = rateLimit(`settle:${clientKey(req)}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests — retry shortly." },
      { status: 429 },
    );
  }

  // ── 1. input validation ────────────────────────────────────────────────
  const body = await req.json().catch(() => null);
  const input = settleInputSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Required: jobId, action (RELEASE|REFUND), receipt." },
      { status: 400 },
    );
  }
  const { jobId, action, receipt } = input.data;

  if (!escrowAddress()) {
    return NextResponse.json(
      { error: "DEPLOYMENT_NOT_CONFIGURED", message: "Escrow address not configured." },
      { status: 503 },
    );
  }

  // ── 2/3. receipt verification (signature, expiry, binding) ─────────────
  if (receipt.jobId !== jobId || receipt.decision !== action) {
    return NextResponse.json(
      {
        error: "RECEIPT_MISMATCH",
        message: "Receipt does not match this job or the requested action.",
      },
      { status: 400 },
    );
  }
  const receiptCheck = await verifyReceipt(receipt);
  if (!receiptCheck.valid) {
    return NextResponse.json(
      {
        error: receiptCheck.error,
        message:
          receiptCheck.error === "RECEIPT_EXPIRED"
            ? "The verification receipt has expired. Re-run verification, then settle."
            : "Verification receipt is invalid — settlement refused. No funds moved.",
      },
      { status: 403 },
    );
  }

  // ── 4. testnet-only guard (refuses mainnet by design) ──────────────────
  if (chainId() !== 10143) {
    return NextResponse.json(
      {
        error: "NOT_TESTNET",
        message: `Refusing to settle: configured chain is ${chainId()}, not Monad Testnet (10143).`,
      },
      { status: 409 },
    );
  }

  // ── 5. on-chain state ──────────────────────────────────────────────────
  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "JOB_NOT_FOUND", message: `Job #${jobId} does not exist.` },
      { status: 404 },
    );
  }

  if (job.status !== "Submitted") {
    // Idempotent response for already-settled jobs — no duplicate transaction.
    return NextResponse.json({
      jobId,
      action,
      alreadySettled: true,
      status: job.status,
      message: `Job #${jobId} is already ${job.status}. No new transaction was created.`,
    });
  }

  // ── 6. hash binding ────────────────────────────────────────────────────
  if (receipt.submissionHash.toLowerCase() !== job.outputHash.toLowerCase()) {
    return NextResponse.json(
      {
        error: "SUBMISSION_HASH_MISMATCH",
        message: "Receipt does not bind to this job's on-chain output hash — settlement refused.",
      },
      { status: 409 },
    );
  }

  // ── 7. escrow accounting ───────────────────────────────────────────────
  try {
    const bal = (await publicClient().readContract({
      address: escrowAddress() as `0x${string}`,
      abi: ESCROW_ABI as Abi,
      functionName: "escrowBalance",
    })) as bigint;
    if (bal < job.amount) {
      return NextResponse.json(
        {
          error: "ESCROW_UNDERFUNDED",
          message: "Escrow balance does not cover the job amount — settlement refused.",
        },
        { status: 409 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "RPC_READ_FAILED", message: "Could not verify escrow balance — settlement refused." },
      { status: 502 },
    );
  }

  // ── the one, policy-authorized transaction ─────────────────────────────
  try {
    const approved = action === "RELEASE";
    const tx = await settleOnChain({ jobId, approved });

    const result: SettlementResult = {
      jobId,
      action,
      txHash: tx.txHash,
      blockNumber: tx.blockNumber,
      status: tx.status,
      recipient: approved ? job.seller : job.buyer,
      amountMon: (Number(job.amount) / 1e18).toFixed(4),
      explorerUrl: explorerTx(tx.txHash),
    };

    console.log(
      JSON.stringify({
        event: "settlement.executed",
        jobId,
        action,
        txHash: tx.txHash,
        blockNumber: tx.blockNumber,
        recipient: result.recipient,
        ts: new Date().toISOString(),
      }),
    );

    return NextResponse.json(result, { status: tx.status === "success" ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "settle transaction failed";
    return NextResponse.json(
      {
        error: "SETTLE_TX_FAILED",
        message: `Transaction failed. Escrow state was not changed. ${message}`,
      },
      { status: 502 },
    );
  }
}

/**
 * POST /api/submit-work — the demo seller agent delivers its work on-chain.
 *
 * Signs submitWork(jobId, keccak256(submission)) from SELLER_AGENT_PRIVATE_KEY
 * (testnet demo key). Pre-checks on-chain state first (job exists, is Open,
 * targets this agent) so mistakes fail fast without spending gas.
 *
 * The clear-text submission NEVER touches the chain — only its keccak256
 * hash, which the verifier later re-derives from the exact text the user
 * sees (hash-on-chain / content-off-chain).
 */
import { NextResponse } from "next/server";
import { type Abi } from "viem";
import { ESCROW_ABI, escrowAddress, explorerTx } from "@/lib/nexora/chain";
import { publicClient } from "@/lib/nexora/receipt";
import { sellerAgentAddress, submitWorkOnChain, submissionHash } from "@/lib/nexora/agents";
import { submitWorkInputSchema } from "@/lib/nexora/schema";
import { rateLimit, clientKey } from "@/lib/nexora/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limit = rateLimit(`submit:${clientKey(req)}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests — retry shortly." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const input = submitWorkInputSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "jobId (positive int) and submission (text) are required." },
      { status: 400 },
    );
  }

  const escrow = escrowAddress();
  if (!escrow) {
    return NextResponse.json(
      { error: "DEPLOYMENT_NOT_CONFIGURED", message: "Escrow address not configured." },
      { status: 503 },
    );
  }
  if (!sellerAgentAddress()) {
    return NextResponse.json(
      { error: "SELLER_AGENT_NOT_CONFIGURED", message: "SELLER_AGENT_PRIVATE_KEY is not set." },
      { status: 503 },
    );
  }

  const { jobId, submission } = input.data;
  const hash = submissionHash(submission);

  // On-chain pre-checks (read-only — no gas spent on doomed transactions).
  try {
    const raw = (await publicClient().readContract({
      address: escrow as `0x${string}`,
      abi: ESCROW_ABI as Abi,
      functionName: "getJob",
      args: [BigInt(jobId)],
    })) as [string, string, bigint, string, number, bigint];

    if (raw[0] === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json(
        { error: "JOB_NOT_FOUND", message: `Job #${jobId} does not exist.` },
        { status: 404 },
      );
    }
    const status = ["Open", "Submitted", "Released", "Refunded"][Number(raw[4])];
    if (status !== "Open") {
      return NextResponse.json(
        {
          error: "JOB_NOT_OPEN",
          message: `Job #${jobId} is already ${status}.`,
          status,
        },
        { status: 409 },
      );
    }
    const jobSeller = raw[1].toLowerCase();
    if (jobSeller !== sellerAgentAddress()!.toLowerCase()) {
      return NextResponse.json(
        {
          error: "SELLER_MISMATCH",
          message: `Job #${jobId} targets a different seller (${raw[1]}). This demo agent cannot submit for it.`,
        },
        { status: 409 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "RPC read failed";
    return NextResponse.json(
      { error: "RPC_READ_FAILED", message: `Could not read job state: ${message}` },
      { status: 502 },
    );
  }

  // The single, explicit, user-triggered transaction of this route.
  try {
    const tx = await submitWorkOnChain({ jobId, hash });
    console.log(
      JSON.stringify({
        event: "work.submitted",
        jobId,
        submissionHash: hash,
        txHash: tx.txHash,
        status: tx.status,
        ts: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      {
        jobId,
        submissionHash: hash,
        txHash: tx.txHash,
        blockNumber: tx.blockNumber,
        status: tx.status,
        explorerUrl: explorerTx(tx.txHash),
      },
      { status: tx.status === "success" ? 200 : 502 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "submitWork transaction failed";
    return NextResponse.json(
      { error: "SUBMIT_TX_FAILED", message: `Transaction failed. Escrow state was not changed. ${message}` },
      { status: 502 },
    );
  }
}

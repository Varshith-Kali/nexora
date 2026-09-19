/**
 * GET /api/job-state?jobId=N — read-only on-chain job lookup.
 *
 * A thin RPC passthrough so the browser never needs the server's RPC config.
 * eth_call only: zero transactions, zero MON, zero signing. Safe to call on
 * page load (used to restore a persisted demo job after a refresh).
 */
import { NextResponse } from "next/server";
import { type Abi } from "viem";
import { ESCROW_ABI, escrowAddress } from "@/lib/nexora/chain";
import { publicClient } from "@/lib/nexora/receipt";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = Number.parseInt(url.searchParams.get("jobId") ?? "", 10);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json(
      { job: null, error: "INVALID_JOB_ID" },
      { status: 400 },
    );
  }

  const escrow = escrowAddress();
  if (!escrow) {
    return NextResponse.json({ job: null, error: "DEPLOYMENT_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    // viem decodes a named tuple as an object, NOT a positional array.
    const raw = (await publicClient().readContract({
      address: escrow as `0x${string}`,
      abi: ESCROW_ABI as Abi,
      functionName: "getJob",
      args: [BigInt(jobId)],
    })) as any;

    const buyer = (raw?.buyer ?? raw?.[0]) as string;
    if (!buyer || buyer === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ job: null, error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const statuses = ["Open", "Submitted", "Released", "Refunded"] as const;
    const rawStatus = raw.status !== undefined ? raw.status : raw[4];
    return NextResponse.json({
      job: {
        buyer,
        seller: (raw.seller ?? raw[1]) as string,
        amount: (Number(raw.amount ?? raw[2]) / 1e18).toFixed(4),
        amountRaw: (raw.amount ?? raw[2]).toString(),
        outputHash: (raw.outputHash ?? raw[3]) as string,
        status: statuses[Number(rawStatus)] ?? "Open",
        createdAt: Number(raw.createdAt ?? raw[5]),
      },
    });

  } catch {
    return NextResponse.json({ job: null, error: "RPC_READ_FAILED" }, { status: 502 });
  }
}

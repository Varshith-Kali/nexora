/**
 * POST /api/jobs — prepare a demo job (server-side prep only).
 *
 * Ensures the demo seller agent is registered & active in NexoraRegistry so
 * that the buyer's wallet can open a job against it. This is the ONLY thing
 * this route does; the openJob() transaction itself is signed by the USER's
 * connected wallet in the browser (the buyer always pays and always
 * confirms). One-time registration is itself an explicit, user-triggered
 * transaction from the seller agent key.
 */
import { NextResponse } from "next/server";
import { ensureSellerRegistered, sellerAgentAddress } from "@/lib/nexora/agents";
import {
  chainId,
  escrowAddress,
  explorerAddress,
  isConfigured,
} from "@/lib/nexora/chain";
import { rateLimit, clientKey } from "@/lib/nexora/ratelimit";

export const dynamic = "force-dynamic";

export async function POST() {
  const limit = rateLimit(`jobs:${clientKey(new Request("http://local"))}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests — retry shortly." },
      { status: 429 },
    );
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: "DEPLOYMENT_NOT_CONFIGURED",
        message:
          "Contracts are not deployed/configured yet. Run the deployment steps in DEPLOYMENT.md first.",
      },
      { status: 503 },
    );
  }

  const seller = sellerAgentAddress();
  if (!seller) {
    return NextResponse.json(
      {
        error: "SELLER_AGENT_NOT_CONFIGURED",
        message: "SELLER_AGENT_PRIVATE_KEY is not set in the server environment.",
      },
      { status: 503 },
    );
  }

  try {
    const registration = await ensureSellerRegistered();
    return NextResponse.json({
      ready: registration.registered,
      seller: seller,
      sellerExplorerUrl: explorerAddress(seller),
      justRegistered: registration.justRegistered,
      registrationTxHash: registration.txHash ?? null,
      escrow: escrowAddress(),
      chainId: chainId(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "seller agent preparation failed";
    console.log(
      JSON.stringify({ event: "jobs.prepare_error", error: message, ts: new Date().toISOString() }),
    );
    return NextResponse.json(
      { error: "SELLER_AGENT_PREP_FAILED", message },
      { status: 502 },
    );
  }
}

/**
 * GET /api/health — deployment readiness probe. Read-only, no transactions,
 * no secrets. Used by the dashboard status chips and by the pre-demo
 * checklist. Never fabricates: anything not configured reports as such.
 */
import { NextResponse } from "next/server";
import { type Abi } from "viem";
import {
  MONAD_FAUCET_URL,
  MONAD_TESTNET_CHAIN_ID,
  MONADSCAN_URL,
  chainId,
  escrowAddress,
  isConfigured,
  registryAddress,
  verifierAddress,
  rpcUrl,
  ESCROW_ABI,
} from "@/lib/nexora/chain";
import { verifierAccountAddress } from "@/lib/nexora/receipt";
import { sellerAgentAddress, verifierSignerAddress } from "@/lib/nexora/agents";
import { geminiModel, providerName } from "@/lib/nexora/gemini";
import { publicClient } from "@/lib/nexora/receipt";

export const dynamic = "force-dynamic";

export async function GET() {
  const escrow = escrowAddress();
  const registry = registryAddress();

  let rpcReachable = false;
  let blockNumber: number | null = null;
  let escrowBalance: string | null = null;
  let verifierMatchesSigner: boolean | null = null;

  // Best-effort read-only RPC probe (fails soft — never throws).
  if (isConfigured()) {
    try {
      const client = publicClient();
      blockNumber = Number(await client.getBlockNumber());
      rpcReachable = true;
      if (escrow) {
        const bal = (await client.readContract({
          address: escrow as `0x${string}`,
          abi: ESCROW_ABI as Abi,
          functionName: "escrowBalance",
        })) as bigint;
        escrowBalance = (Number(bal) / 1e18).toFixed(4);
      }
    } catch {
      rpcReachable = false;
    }
  }

  const onChainVerifier = verifierAddress();
  const signer = verifierAccountAddress();
  if (onChainVerifier && signer) {
    verifierMatchesSigner = onChainVerifier.toLowerCase() === signer.toLowerCase();
  }

  return NextResponse.json({
    app: "Nexora",
    network: {
      chainId: chainId(),
      expectedChainId: MONAD_TESTNET_CHAIN_ID,
      testnetOnly: chainId() === MONAD_TESTNET_CHAIN_ID,
      rpc: rpcUrl(),
      rpcReachable,
      blockNumber,
      explorer: MONADSCAN_URL,
      faucet: MONAD_FAUCET_URL,
    },
    contracts: {
      configured: isConfigured(),
      escrow: escrow ?? "TBD",
      registry: registry ?? "TBD",
      onChainVerifier: onChainVerifier ?? "TBD",
      escrowBalanceMon: escrowBalance,
    },
    agents: {
      sellerAgentConfigured: sellerAgentAddress() !== null,
      sellerAgent: sellerAgentAddress() ?? "TBD",
      verifierSignerConfigured: verifierSignerAddress() !== null,
      verifierSigner: verifierSignerAddress() ?? "TBD",
      verifierSignerMatchesOnChain: verifierMatchesSigner,
    },
    ai: {
      provider: providerName(),
      model: geminiModel(),
      // mock mode is reported explicitly — never silently faked
      mockMode: providerName() === "mock",
    },
  });
}

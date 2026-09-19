/**
 * Nexora — server-side on-chain agent actions (SERVER-SIDE ONLY).
 *
 * Two testnet operator keys live in environment secrets:
 *
 *   SELLER_AGENT_PRIVATE_KEY — the demo "seller agent" wallet. Signs
 *     submitWork() only. Simulates the work-producing autonomous agent.
 *
 *   VERIFIER_PRIVATE_KEY — the settlement operator wallet (the address the
 *     NexoraEscrow constructor registered as `verifier`). Signs settle()
 *     ONLY after /api/settle verified a policy-authorized receipt. Gemini
 *     itself never holds a key — the deterministic policy engine is the
 *     authorization boundary between the AI verdict and this signer.
 *
 * Both are TESTNET-ONLY demo keys created and funded by the deployer. They
 * are never committed to the repository.
 */
import {
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  toBytes,
  type Abi,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  ESCROW_ABI,
  REGISTRY_ABI,
  assertTestnetOnly,
  chainId,
  escrowAddress,
  explorerTx,
  monadTestnet,
  registryAddress,
  rpcUrl,
} from "./chain";
import { publicClient } from "./receipt";

function loadKey(envName: string): PrivateKeyAccount {
  const pk = process.env[envName]?.trim();
  if (!pk) throw new Error(`${envName} is not configured`);
  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${envName} has an invalid format`);
  }
  return privateKeyToAccount(hex as `0x${string}`);
}

export function sellerAgentAddress(): `0x${string}` | null {
  try {
    return loadKey("SELLER_AGENT_PRIVATE_KEY").address;
  } catch {
    return null;
  }
}

export function verifierSignerAddress(): `0x${string}` | null {
  try {
    return loadKey("VERIFIER_PRIVATE_KEY").address;
  } catch {
    return null;
  }
}

function walletClient(account: PrivateKeyAccount) {
  return createWalletClient({
    account,
    chain: { ...monadTestnet, id: chainId() },
    transport: http(rpcUrl(), { timeout: 20_000 }),
  });
}

/** keccak256 of the submission text — identical to the contract's outputHash. */
export function submissionHash(submission: string): `0x${string}` {
  return keccak256(toBytes(submission));
}

async function sendAndAwait(
  account: PrivateKeyAccount,
  tx: Parameters<ReturnType<typeof walletClient>["sendTransaction"]>[0],
): Promise<{ txHash: string; blockNumber: number | null; status: "success" | "reverted" }> {
  const client = walletClient(account);
  const txHash = (await client.sendTransaction(tx)) as string;
  // Short receipt polling — starts and STOPS. No continuous polling loop.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const receipt = await fetchReceipt(txHash);
    if (receipt) {
      return {
        txHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === "reverted" ? "reverted" : "success",
      };
    }
    await new Promise((r) => setTimeout(r, 1_200));
  }
  return { txHash, blockNumber: null, status: "reverted" }; // unknown after timeout — treat pessimistically
}

async function fetchReceipt(
  txHash: string,
): Promise<{ blockNumber: number | null; status: string } | null> {
  try {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
    });
    const data = (await res.json()) as { result?: { blockNumber?: string; status?: string } | null };
    if (!data.result || data.result.blockNumber === null) return null;
    return {
      blockNumber: data.result.blockNumber ? Number.parseInt(data.result.blockNumber, 16) : null,
      status: data.result.status === "0x1" ? "success" : "reverted",
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- registration
/** Ensure the demo seller agent is registered & active in NexoraRegistry. */
export async function ensureSellerRegistered(): Promise<{
  registered: boolean;
  justRegistered: boolean;
  txHash?: string;
  seller: string | null;
}> {
  const seller = sellerAgentAddress();
  const registry = registryAddress();
  if (!seller || !registry) return { registered: false, justRegistered: false, seller };

  const client = publicClient();
  const agent = (await client.readContract({
    address: registry as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getAgent",
    args: [seller],
  })) as { wallet: string; active: boolean };

  if (agent.wallet !== "0x0000000000000000000000000000000000000000" && agent.active) {
    return { registered: true, justRegistered: false, seller };
  }

  const account = loadKey("SELLER_AGENT_PRIVATE_KEY");
  const result = await sendAndAwait(account, {
    to: registry as `0x${string}`,
    data: encodeRegisterAgentCalldata(
      "Nexora-Demo-Seller",
      "security-assessment",
      0n,
    ),
    gas: 200_000n,
  });
  return { registered: result.status === "success", justRegistered: true, txHash: result.txHash, seller };
}

// ------------------------------------------------------------- submit work
export async function submitWorkOnChain(params: {
  jobId: number;
  hash: `0x${string}`;
}): Promise<{ txHash: string; blockNumber: number | null; status: "success" | "reverted"; explorerUrl: string }> {
  const escrow = escrowAddress();
  if (!escrow) throw new Error("Escrow contract address is not configured");
  assertTestnetOnly();
  const account = loadKey("SELLER_AGENT_PRIVATE_KEY");
  const result = await sendAndAwait(account, {
    to: escrow as `0x${string}`,
    data: encodeSubmitWork(params.jobId, params.hash),
    gas: 120_000n,
  });
  return { ...result, explorerUrl: explorerTx(result.txHash) };
}

// ---------------------------------------------------------------- settlement
export async function settleOnChain(params: {
  jobId: number;
  approved: boolean;
}): Promise<{ txHash: string; blockNumber: number | null; status: "success" | "reverted"; explorerUrl: string }> {
  const escrow = escrowAddress();
  if (!escrow) throw new Error("Escrow contract address is not configured");
  assertTestnetOnly();
  const account = loadKey("VERIFIER_PRIVATE_KEY");
  const result = await sendAndAwait(account, {
    to: escrow as `0x${string}`,
    data: encodeSettle(params.jobId, params.approved),
    gas: 120_000n,
  });
  return { ...result, explorerUrl: explorerTx(result.txHash) };
}

function encodeSubmitWork(jobId: number, hash: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_ABI as Abi,
    functionName: "submitWork",
    args: [BigInt(jobId), hash],
  });
}

function encodeSettle(jobId: number, approved: boolean): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_ABI as Abi,
    functionName: "settle",
    args: [BigInt(jobId), approved],
  });
}

export function encodeRegisterAgentCalldata(name: string, serviceType: string, pricePerUnit: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: REGISTRY_ABI as Abi,
    functionName: "registerAgent",
    args: [name, serviceType, pricePerUnit],
  });
}

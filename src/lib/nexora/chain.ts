/**
 * Nexora — ONE central blockchain configuration module.
 *
 * Every chain ID / RPC URL / contract address in the codebase is resolved
 * here. Testnet only: the settlement API hard-refuses anything that is not
 * Monad Testnet (chain 10143). Never Monad Mainnet.
 *
 * Precedence: environment variables → config/deployment.json (written by
 * `forge script script/Deploy.s.sol`) → unset (deployment not configured yet).
 */
import deploymentJson from "../../../config/deployment.json";
import registryAbiJson from "../../../config/abis/NexoraRegistry.json";
import escrowAbiJson from "../../../config/abis/NexoraEscrow.json";
import type { Abi } from "viem";

// ---------------------------------------------------------------- constants
/** Monad Testnet — the ONLY chain Nexora will ever settle on. */
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
export const MONADSCAN_URL = "https://testnet.monadscan.com";
export const MONAD_FAUCET_URL = "https://faucet.monad.xyz";

export const REGISTRY_ABI = registryAbiJson as unknown as Abi;
export const ESCROW_ABI = escrowAbiJson as unknown as Abi;

// ------------------------------------------------------- deployment record
export interface DeploymentRecord {
  chainId: number | null;
  registry: string | null;
  escrow: string | null;
  verifier: string | null;
  deployer: string | null;
  deployedAt: number | null;
  blockNumber: number | null;
}

const deployment = deploymentJson as unknown as DeploymentRecord;

function isSet(v: string | null | undefined): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

// ------------------------------------------------------------- resolution
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Effective chain id. Settlement refuses anything ≠ 10143. */
export function chainId(): number {
  const fromEnv = env("MONAD_TESTNET_CHAIN_ID");
  if (fromEnv) return Number.parseInt(fromEnv, 10);
  return deployment.chainId ?? MONAD_TESTNET_CHAIN_ID;
}

/** Server-side RPC endpoint. */
export function rpcUrl(): string {
  return env("MONAD_TESTNET_RPC_URL") ?? MONAD_TESTNET_RPC_URL;
}

export function escrowAddress(): string | null {
  return env("MONAD_ESCROW_ADDRESS") ?? (isSet(deployment.escrow) ? deployment.escrow : null);
}

export function registryAddress(): string | null {
  return env("MONAD_REGISTRY_ADDRESS") ?? (isSet(deployment.registry) ? deployment.registry : null);
}

/** On-chain verifier operator address (constructor arg of NexoraEscrow). */
export function verifierAddress(): string | null {
  return env("MONAD_VERIFIER_ADDRESS") ?? (isSet(deployment.verifier) ? deployment.verifier : null);
}

/** True when a full deployment record / env override is present. */
export function isConfigured(): boolean {
  return isSet(escrowAddress()) && isSet(registryAddress());
}

/** Monad Testnet chain definition for wagmi/viem (client & server safe). */
export const monadTestnet = {
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_TESTNET_RPC_URL] } },
  blockExplorers: { default: { name: "Monadscan", url: MONADSCAN_URL } },
  testnet: true,
} as const;

// ------------------------------------------------------------------ links
export function explorerTx(txHash: string): string {
  return `${MONADSCAN_URL}/tx/${txHash}`;
}
export function explorerAddress(address: string): string {
  return `${MONADSCAN_URL}/address/${address}`;
}

// ---------------------------------------------------------------- guards
/** Guard used before ANY settlement transaction. Fails closed. */
export function assertTestnetOnly(): void {
  const id = chainId();
  if (id !== MONAD_TESTNET_CHAIN_ID) {
    throw new Error(
      `Refusing to transact: configured chain ${id} is not Monad Testnet (${MONAD_TESTNET_CHAIN_ID}).`,
    );
  }
}

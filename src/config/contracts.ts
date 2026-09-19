/**
 * Nexora — client-side contract bindings.
 *
 * Addresses come from config/deployment.json (written by the deploy script)
 * and can be overridden at build time with NEXT_PUBLIC_ env vars. ABIs come
 * from config/abis/ (kept in sync by scripts/sync-abis.ts after forge build).
 * Chain metadata lives in ONE place: lib/nexora/chain.ts constants below.
 */
import deploymentJson from "../../config/deployment.json";
import escrowAbiJson from "../../config/abis/NexoraEscrow.json";
import registryAbiJson from "../../config/abis/NexoraRegistry.json";
import type { Abi } from "viem";

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONADSCAN_URL = "https://testnet.monadscan.com";
export const MONAD_FAUCET_URL = "https://faucet.monad.xyz";

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

function publicEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const ESCROW_ADDRESS: string | null =
  publicEnv("NEXT_PUBLIC_ESCROW_ADDRESS") ?? (isSet(deployment.escrow) ? deployment.escrow : null);
export const REGISTRY_ADDRESS: string | null =
  publicEnv("NEXT_PUBLIC_REGISTRY_ADDRESS") ?? (isSet(deployment.registry) ? deployment.registry : null);

export const escrowAbi = escrowAbiJson as unknown as Abi;
export const registryAbi = registryAbiJson as unknown as Abi;

export const isDeployed = isSet(ESCROW_ADDRESS) && isSet(REGISTRY_ADDRESS);

export function explorerTx(txHash: string): string {
  return `${MONADSCAN_URL}/tx/${txHash}`;
}
export function explorerAddress(address: string): string {
  return `${MONADSCAN_URL}/address/${address}`;
}

/** The job status enum order must mirror NexoraEscrow.JobStatus. */
export const JOB_STATUSES = ["Open", "Submitted", "Released", "Refunded"] as const;
export type JobStatusName = (typeof JOB_STATUSES)[number];

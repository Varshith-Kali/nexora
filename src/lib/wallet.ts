"use client";

/**
 * Nexora — wallet configuration (wagmi + viem).
 *
 * The buyer role is always the judge's OWN wallet (MetaMask or any injected
 * provider) on Monad Testnet. Nexora never asks for private keys, seed
 * phrases or wallet passwords — the connected wallet signs openJob() and
 * confirms every transaction it creates. The seller agent and the settlement
 * operator are server-side testnet keys (see lib/nexora/agents.ts).
 */
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

/** Monad Testnet as a viem/wagmi chain definition. */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http("https://testnet-rpc.monad.xyz", { timeout: 15_000 }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

/** Monad Testnet add-to-wallet parameters. */
export const MONAD_ADDCHAIN_PARAMS = {
  chainId: "0x279f" as const, // 10143
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadscan.com"],
};

/** Ensure Monad Testnet exists in the injected wallet (auto-add, non-fatal). */
export async function ensureMonadNetwork(): Promise<boolean> {
  const eth = (window as unknown as Record<string, any>)?.ethereum;
  if (!eth?.request) return false;
  try {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [MONAD_ADDCHAIN_PARAMS],
    });
    return true;
  } catch {
    return false;
  }
}

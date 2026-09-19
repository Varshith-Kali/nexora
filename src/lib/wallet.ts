"use client";

/**
 * Nexora — wallet configuration (wagmi + viem).
 *
 * The buyer role is always the judge's OWN wallet (MetaMask or any injected
 * provider) on Monad Testnet. Nexora never asks for private keys, seed
 * phrases or wallet passwords — the connected wallet signs openJob() and
 * confirms every transaction it creates. The seller agent and the settlement
 * operator are server-side testnet keys (see lib/nexora/agents.ts).
 *
 * Default chain: Monad Testnet (10143). On connect, MetaMask is prompted to
 * add this chain automatically via wallet_addEthereumChain — no manual setup.
 */
import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
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
  // Only Monad Testnet — prevents any accidental mainnet interactions.
  chains: [monadTestnet],
  connectors: [
    // MetaMask explicit connector (shows MetaMask name/icon in prompts).
    metaMask(),
    // Generic injected fallback for Rabby, Coinbase Wallet, etc.
    injected({ target: "metaMask" }),
  ],
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

/** Monad Testnet add-to-wallet parameters (EIP-3085). */
export const MONAD_ADDCHAIN_PARAMS = {
  chainId: "0x279f" as const, // 10143
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadscan.com"],
};

/**
 * Prompts MetaMask (or any EIP-3085 wallet) to add Monad Testnet and switch
 * to it. wallet_addEthereumChain is idempotent — if the chain is already
 * added, the wallet silently switches to it. Non-fatal on rejection.
 */
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
    // User rejected the prompt — non-fatal, they can still try switchToMonad.
    return false;
  }
}

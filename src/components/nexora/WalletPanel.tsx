"use client";

/**
 * Nexora — WalletPanel: buyer-side connection surface.
 *
 * Three states:
 *   1. Disconnected   → "Connect MetaMask" + Monad Testnet info card
 *   2. Wrong network  → "Add / Switch to Monad Testnet" (calls wallet_addEthereumChain)
 *   3. Connected + right network → address chip + MON balance
 *
 * Nexora NEVER asks for private keys, seed phrases or passwords.
 * The buyer wallet only signs openJob() and confirms every tx explicitly.
 */

import { Button } from "@/components/ui/button";
import { Wallet, AlertTriangle, ExternalLink, CheckCircle2 } from "lucide-react";
import { MONAD_ADDCHAIN_PARAMS, ensureMonadNetwork } from "@/lib/wallet";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Monad Testnet info card shown when disconnected ───────────────────────────
function MonadNetworkCard() {
  return (
    <div className="mt-3 rounded-xl border border-[#836EF9]/20 bg-[#836EF9]/[0.05] p-3">
      <div className="ap-label mb-2 text-[#A78BFA]">Monad Testnet — auto-configured</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-white/45 sm:grid-cols-3">
        <span><span className="text-white/25">Chain ID </span>10143</span>
        <span><span className="text-white/25">Currency </span>MON</span>
        <span><span className="text-white/25">RPC </span>testnet-rpc.monad.xyz</span>
        <span><span className="text-white/25">Explorer </span>
          <a
            href="https://testnet.monadscan.com"
            target="_blank"
            rel="noreferrer"
            className="text-[#38BDF8] hover:underline"
          >
            Monadscan ↗
          </a>
        </span>
        <span><span className="text-white/25">Faucet </span>
          <a
            href="https://faucet.monad.xyz"
            target="_blank"
            rel="noreferrer"
            className="text-[#38BDF8] hover:underline"
          >
            faucet.monad.xyz ↗
          </a>
        </span>
      </div>
      <p className="mt-2 text-[10px] text-white/30">
        When you connect, MetaMask will prompt you to add Monad Testnet
        automatically — no manual setup needed.
      </p>
    </div>
  );
}

/** Buyer-side wallet panel. Nexora never asks for keys — only a signature. */
export function WalletPanel({ nx }: { nx: Nx }) {
  return (
    <div className="ap-card rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#A78BFA]" />
          <span className="ap-label">Buyer wallet (you)</span>
        </div>

        {/* ── Disconnected ───────────────────────────────────────────── */}
        {!nx.isConnected && (
          <Button
            onClick={() => void nx.connect()}
            size="sm"
            className="gap-2 bg-[#836EF9] hover:bg-[#957FFB] shadow-lg shadow-[#836EF9]/25"
          >
            <Wallet className="h-3.5 w-3.5" />
            Connect MetaMask
          </Button>
        )}

        {/* ── Connected but wrong network ───────────────────────────── */}
        {nx.isConnected && nx.wrongNetwork && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-1 text-xs text-[#FBBF24]">
              <AlertTriangle className="h-3.5 w-3.5" />
              Wrong network — switch to Monad Testnet
            </span>
            <Button
              onClick={() => void nx.switchToMonad()}
              size="sm"
              className="gap-1.5 bg-[#836EF9] hover:bg-[#957FFB]"
            >
              Add &amp; Switch
            </Button>
          </div>
        )}

        {/* ── Connected + correct network ──────────────────────────── */}
        {nx.isConnected && !nx.wrongNetwork && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#34D399]" />
              <span className="rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-1 text-[11px] text-[#34D399]">
                Monad Testnet
              </span>
            </span>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-white/80">
              {nx.address ? short(nx.address) : "—"}
            </span>
            <span className="rounded-md border border-[#836EF9]/30 bg-[#836EF9]/10 px-2 py-1 font-mono text-[#A78BFA]">
              {nx.walletBalanceMon !== null ? `${nx.walletBalanceMon} MON` : "checking…"}
            </span>
          </div>
        )}
      </div>

      {/* Show Monad Testnet details when not connected */}
      {!nx.isConnected && <MonadNetworkCard />}

      {/* Show wrong-network guidance */}
      {nx.isConnected && nx.wrongNetwork && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-relaxed text-white/40">
            Click <strong className="text-white/65">Add &amp; Switch</strong> to
            automatically add Monad Testnet (chain 10143) and switch to it. MetaMask
            will show a confirmation prompt.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-white/35 sm:grid-cols-3">
            <span>Chain ID: <span className="text-white/55">10143</span></span>
            <span>RPC: <span className="text-white/55">testnet-rpc.monad.xyz</span></span>
            <span>Currency: <span className="text-white/55">MON</span></span>
          </div>
          {/* Manual add button as fallback */}
          <button
            className="inline-flex items-center gap-1 text-[10px] text-[#38BDF8] hover:underline"
            onClick={async () => { await ensureMonadNetwork(); }}
          >
            <ExternalLink className="h-3 w-3" />
            Or manually add via wallet_addEthereumChain
          </button>
        </div>
      )}

      {/* Show address + faucet link when connected */}
      {nx.isConnected && !nx.wrongNetwork && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-white/30">
            Buyer wallet connected. Nexora never asks for keys — only explicit
            transaction signatures.
          </p>
          <a
            href="https://faucet.monad.xyz"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-[#38BDF8] hover:underline"
          >
            Need MON? Get from faucet <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}
    </div>
  );
}

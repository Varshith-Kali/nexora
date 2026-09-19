"use client";

import { Button } from "@/components/ui/button";
import { Wallet, AlertTriangle } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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

        {!nx.isConnected ? (
          <Button onClick={() => void nx.connect()} size="sm" className="bg-[#836EF9] hover:bg-[#957FFB]">
            Connect wallet
          </Button>
        ) : nx.wrongNetwork ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-1 text-xs text-[#FBBF24]">
              <AlertTriangle className="h-3.5 w-3.5" /> Wrong network — switch to Monad Testnet
            </span>
            <Button onClick={() => void nx.switchToMonad()} size="sm" variant="outline">
              Switch
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-white/80">
              {nx.address ? short(nx.address) : "—"}
            </span>
            <span className="rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-1 font-mono text-[#34D399]">
              {nx.walletBalanceMon !== null ? `${nx.walletBalanceMon} MON` : "Monad Testnet"}
            </span>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/35">
        The buyer always signs and confirms escrow funding from their own wallet.
        Nexora never asks for private keys or seed phrases. Server-side keys are
        used only for the demo seller agent and the policy-gated settlement
        operator.
      </p>
    </div>
  );
}

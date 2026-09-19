"use client";

/**
 * Nexora dashboard — AI-verified escrow on Monad.
 * Hero → Live demo console. No auto-transactions, no websockets.
 */

import { motion } from "framer-motion";
import {
  ArrowDown,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Lock,
  Coins,
  Package,
} from "lucide-react";
import { useNexora } from "@/hooks/use-nexora";
import { StatusChips } from "@/components/nexora/StatusChips";
import { WalletPanel } from "@/components/nexora/WalletPanel";
import { DemoPanel } from "@/components/nexora/DemoPanel";
import { Stepper } from "@/components/nexora/Stepper";
import { ActionPanel } from "@/components/nexora/ActionPanel";
import { VerificationCard } from "@/components/nexora/VerificationCard";
import { VerificationFlow } from "@/components/nexora/VerificationFlow";
import { SettlementCard } from "@/components/nexora/SettlementCard";
import { JobCard } from "@/components/nexora/JobCard";

const ESCROW_ADDRESS = "0x16041c31040049a185b66d28dcbdaa6ca55682e9";

export default function NexoraDashboard() {
  const nx = useNexora();

  return (
    <div className="relative min-h-screen bg-[#0A0A12] text-white">
      {/* ambient blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="ap-blob-a absolute -top-[30%] left-[10%] h-[60vh] w-[45vw] rounded-full bg-[#836EF9]/[0.07] blur-3xl" />
        <div className="ap-blob-b absolute top-[30%] right-[-10%] h-[50vh] w-[40vw] rounded-full bg-[#38BDF8]/[0.05] blur-3xl" />
        <div className="ap-grid absolute inset-0" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-10 sm:px-7">
        {/* header */}
        <header className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <img src="/nexora.svg" alt="Nexora" className="h-9 w-9" />
            <div>
              <div className="text-lg font-semibold tracking-tight">NEXORA</div>
              <div className="text-[11px] text-white/40">AI-Verified Agent Commerce</div>
            </div>
          </div>
          <StatusChips health={nx.health} />
        </header>

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="mb-8">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mx-auto max-w-3xl text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
          >
            Did the AI agent do the job?{" "}
            <span className="bg-gradient-to-r from-[#A78BFA] to-[#836EF9] bg-clip-text text-transparent">
              Gemini verifies first.
            </span>
          </motion.h1>

          <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-white/50">
            Lock MON → agent does work → Gemini checks it → pay or refund.{" "}
            <span className="text-white/70">Real transactions, live on Monad.</span>
          </p>

          {/* 3 stat chips */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Chip icon={<Package className="h-3.5 w-3.5" />} label="Package Tracking Demo" />
            <Chip icon={<Lock className="h-3.5 w-3.5" />} label="Min 0.004 MON escrow" />
            <Chip icon={<Sparkles className="h-3.5 w-3.5" />} label="Gemini AI Verifier" />
            <a
              href={`https://testnet.monadscan.com/address/${ESCROW_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-[11px] text-[#34D399] transition hover:bg-[#10B981]/20"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34D399]" />
              Contract live ↗
            </a>
          </div>

          <div className="mt-5 flex justify-center">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full bg-[#836EF9] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#836EF9]/25 transition hover:bg-[#957FFB]"
            >
              TRY LIVE DEMO <ArrowDown className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* ── DEMO CONSOLE ─────────────────────────────────────────────── */}
        <main id="demo" className="flex flex-1 flex-col gap-4 scroll-mt-6">
          <div className="ap-label">Live flow — every action is on-chain</div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* left (wide) */}
            <div className="flex flex-col gap-4 lg:col-span-2">
              <WalletPanel nx={nx} />
              <DemoPanel nx={nx} />
              <Stepper nx={nx} />
              <ActionPanel nx={nx} />
              {(nx.stage === "submitted" ||
                nx.stage === "verified" ||
                nx.stage === "settled" ||
                nx.busy === "verify") && <VerificationFlow nx={nx} />}
              {nx.verification && <VerificationCard verification={nx.verification} />}
              {nx.settlement && <SettlementCard settlement={nx.settlement} />}
            </div>

            {/* right sidebar */}
            <aside className="flex flex-col gap-4" aria-label="Job status">
              <JobCard nx={nx} />
            </aside>
          </div>
        </main>

        {/* footer */}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-[11px] text-white/25">
          <span>
            Nexora · Monad Testnet · Gemini AI · 3 tx per flow
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" /> hash on-chain
            </span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> 1 Gemini call
            </span>
            <span className="flex items-center gap-1">
              <Coins className="h-3 w-3" /> settle = real MON
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50">
      {icon}
      {label}
    </span>
  );
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return <ExternalLink className={className ?? "h-3.5 w-3.5"} />;
}

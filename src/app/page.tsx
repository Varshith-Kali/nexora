"use client";

/**
 * Nexora — AI-Verified Agent Commerce dashboard.
 *
 * One page, two zones:
 *   HERO      — what / why / how, answered in 20 seconds
 *   CONSOLE   — the live, on-demand demo: every blockchain action is an
 *               explicit, user-confirmed button. Page loads never spend MON.
 *
 * There are no background loops, no websockets, no auto-transactions.
 */

import { motion } from "framer-motion";
import {
  ArrowDown,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Lock,
  FileSearch,
  Scale,
  Coins,
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

export default function NexoraDashboard() {
  const nx = useNexora();

  return (
    <div className="relative min-h-screen bg-[#0A0A12] text-white">
      {/* ambient background — static gradients only, no looping animation
          unless motion is allowed */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="ap-blob-a absolute -top-[30%] left-[10%] h-[60vh] w-[45vw] rounded-full bg-[#836EF9]/[0.07] blur-3xl" />
        <div className="ap-blob-b absolute top-[30%] right-[-10%] h-[50vh] w-[40vw] rounded-full bg-[#38BDF8]/[0.05] blur-3xl" />
        <div className="ap-grid absolute inset-0" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-10 sm:px-7">
        {/* ── header ─────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <img src="/nexora.svg" alt="Nexora logo" className="h-9 w-9" />
            <div>
              <div className="text-lg font-semibold tracking-tight">NEXORA</div>
              <div className="text-[11px] text-white/40">AI-Verified Agent Commerce</div>
            </div>
          </div>
          <StatusChips health={nx.health} />
        </header>

        {/* ── hero ───────────────────────────────────────────────────── */}
        <section className="mb-8">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-3xl text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
          >
            Verify the work.{" "}
            <span className="bg-gradient-to-r from-[#A78BFA] to-[#836EF9] bg-clip-text text-transparent">
              Then settle.
            </span>
          </motion.h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-white/55">
            AI agents can transact. Nexora verifies the work before escrow is
            released — Gemini evaluates the submission against explicit
            requirements, a deterministic policy engine decides, and Monad
            settles. <span className="text-white/75">Gemini never controls funds.</span>
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <HeroCard
              icon={<FileSearch className="h-4 w-4 text-[#A78BFA]" />}
              title="WHAT"
              body="AI-verified escrow for agent-to-agent work."
            />
            <HeroCard
              icon={<ShieldCheck className="h-4 w-4 text-[#F43F5E]" />}
              title="WHY"
              body="Agents should not get paid automatically for incorrect, incomplete or manipulated work."
            />
            <HeroCard
              icon={<Scale className="h-4 w-4 text-[#10B981]" />}
              title="HOW"
              body="Gemini verifies against requirements → the policy engine authorizes → Monad settles the escrow."
            />
          </div>

          <div className="mt-6 flex justify-center">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full bg-[#836EF9] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#836EF9]/25 transition hover:bg-[#957FFB]"
            >
              TRY LIVE DEMO <ArrowDown className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* ── demo console ───────────────────────────────────────────── */}
        <main id="demo" className="flex flex-1 flex-col gap-5 scroll-mt-6">
          <div className="ap-label">Live demo console — every action is explicit</div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* left column (wide) */}
            <div className="flex flex-col gap-5 lg:col-span-2">
              <WalletPanel nx={nx} />
              <DemoPanel nx={nx} />
              <Stepper nx={nx} />
              <ActionPanel nx={nx} />
              {/* ── Verification flow: 4-layer visualization (always shown from submitted stage) */}
              {(nx.stage === "submitted" || nx.stage === "verified" || nx.stage === "settled" || nx.busy === "verify") && (
                <VerificationFlow nx={nx} />
              )}
              {/* ── Verification detail card: supplementary evidence (shown after verification) */}
              {nx.verification && <VerificationCard verification={nx.verification} />}
              {nx.settlement && <SettlementCard settlement={nx.settlement} />}
            </div>

            {/* right column */}
            <aside className="flex flex-col gap-5" aria-label="Job and settlement status">
              <JobCard nx={nx} />
            </aside>
          </div>
        </main>

        {/* ── footer ─────────────────────────────────────────────────── */}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5 text-[11px] text-white/30">
          <span>
            Nexora — escrow on Monad Testnet · AI verification by Gemini ·
            deterministic policy gate
          </span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> hash-on-chain, content off-chain
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> one AI call per verification
            </span>
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3" /> 3 tx per demo path
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}

function HeroCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="ap-card rounded-xl p-4"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="ap-label">{title}</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-white/65">{body}</p>
    </motion.div>
  );
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return <ExternalLink className={className ?? "h-3.5 w-3.5"} />;
}

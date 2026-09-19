"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ShieldAlert, RotateCcw, PencilLine } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";
import { DEMO_SCENARIOS } from "@/lib/nexora/demoData";

type Nx = ReturnType<typeof useNexora>;

/**
 * Demo control panel: load a scenario, inspect and edit every field, then
 * trigger each step explicitly. Loading a scenario NEVER sends a
 * transaction — it only fills the console.
 */
export function DemoPanel({ nx }: { nx: Nx }) {
  return (
    <div className="ap-card rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PencilLine className="h-4 w-4 text-[#A78BFA]" />
          <span className="ap-label">Demo mode — job &amp; submission</span>
        </div>
        <Button
          onClick={nx.reset}
          size="sm"
          variant="ghost"
          className="h-7 text-white/50 hover:text-white/80"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Reset demo
        </Button>
      </div>

      {/* scenario picker */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ScenarioButton
          active={nx.scenario?.id === "green"}
          onClick={() => nx.loadScenario("green")}
          tone="green"
          title="Successful Demo"
          sub="Legitimate security assessment → PASS → RELEASE"
        />
        <ScenarioButton
          active={nx.scenario?.id === "injection"}
          onClick={() => nx.loadScenario("injection")}
          tone="red"
          title="Prompt-Injection Demo"
          sub="Adversarial submission → injection detected → REFUND"
        />
      </div>

      {nx.scenario && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Escrow amount (MON)</Label>
              <Input
                value={nx.escrowAmount}
                onChange={(e) => nx.setEscrowAmount(e.target.value)}
                inputMode="decimal"
                className="h-9 w-32 font-mono text-sm"
                aria-label="Escrow amount in MON"
              />
            </div>
            <div className="flex items-end">
              <Badge variant="outline" className="mb-1.5 border-white/10 text-white/40">
                expected: {nx.scenario.expectedVerdict} → {nx.scenario.expectedAction}
              </Badge>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">
              Job specification (buyer requirement)
            </Label>
            <Textarea
              value={nx.jobSpec}
              onChange={(e) => nx.setJobSpec(e.target.value)}
              rows={3}
              className="text-[13px] leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">
              Acceptance criteria ({nx.criteria.length})
            </Label>
            <ol className="space-y-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[12px] leading-relaxed text-white/60">
              {nx.criteria.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-[#836EF9]">{i + 1}.</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">
              Seller submission —{" "}
              <span className="text-[#FB7185]">untrusted data (editable)</span>
            </Label>
            <Textarea
              value={nx.submission}
              onChange={(e) => nx.setSubmission(e.target.value)}
              rows={7}
              className="font-mono text-[12px] leading-relaxed"
            />
            <p className="text-[11px] text-white/30">
              Everything in this box is treated as untrusted data. The verifier
              never obeys instructions found here — it evaluates them.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioButton({
  active,
  onClick,
  tone,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  tone: "green" | "red";
  title: string;
  sub: string;
}) {
  const green = tone === "green";
  return (
    <button
      onClick={onClick}
      className={`group rounded-lg border p-3 text-left transition ${
        active
          ? green
            ? "border-[#10B981]/50 bg-[#10B981]/10"
            : "border-[#F43F5E]/50 bg-[#F43F5E]/10"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      }`}
    >
      <div className="flex items-center gap-2">
        {green ? (
          <CheckCircle2 className="h-4 w-4 text-[#34D399]" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-[#FB7185]" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/45">{sub}</div>
    </button>
  );
}

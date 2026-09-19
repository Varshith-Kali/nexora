"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ShieldAlert, RotateCcw, Package } from "lucide-react";
import type { useNexora } from "@/hooks/use-nexora";

type Nx = ReturnType<typeof useNexora>;

export function DemoPanel({ nx }: { nx: Nx }) {
  return (
    <div className="ap-card rounded-xl p-4">
      {/* header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[#A78BFA]" />
          <span className="ap-label">Demo — choose a scenario</span>
        </div>
        <Button
          onClick={nx.reset}
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-white/40 hover:text-white/70"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Reset
        </Button>
      </div>

      {/* scenario picker */}
      <div className="grid gap-2 sm:grid-cols-2">
        <ScenarioButton
          active={nx.scenario?.id === "green"}
          onClick={() => nx.loadScenario("green")}
          tone="green"
          title="📦 Real Tracking Report"
          sub="Accurate data → PASS → Seller gets paid"
        />
        <ScenarioButton
          active={nx.scenario?.id === "injection"}
          onClick={() => nx.loadScenario("injection")}
          tone="red"
          title="🚨 Fake Data + Injection"
          sub="Malicious input → FAIL → Buyer refunded"
        />
      </div>

      {nx.scenario && (
        <div className="mt-4 flex flex-col gap-3">
          {/* amount + expected */}
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-white/50">Escrow (MON)</Label>
              <Input
                value={nx.escrowAmount}
                onChange={(e) => nx.setEscrowAmount(e.target.value)}
                inputMode="decimal"
                className="h-8 w-28 font-mono text-sm"
              />
            </div>
            <Badge
              variant="outline"
              className="mt-5 border-white/10 text-[11px] text-white/40"
            >
              expect: {nx.scenario.expectedVerdict} → {nx.scenario.expectedAction}
            </Badge>
          </div>

          {/* job spec */}
          <div className="space-y-1">
            <Label className="text-[11px] text-white/50">Job spec</Label>
            <Textarea
              value={nx.jobSpec}
              onChange={(e) => nx.setJobSpec(e.target.value)}
              rows={2}
              className="text-[12px] leading-relaxed"
            />
          </div>

          {/* criteria */}
          <div className="space-y-1">
            <Label className="text-[11px] text-white/50">
              Criteria ({nx.criteria.length})
            </Label>
            <ol className="space-y-0.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/55">
              {nx.criteria.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-[#836EF9]">{i + 1}.</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* submission */}
          <div className="space-y-1">
            <Label className="text-[11px] text-white/50">
              Agent report{" "}
              <span className="text-[#FB7185]">← untrusted, Gemini evaluates this</span>
            </Label>
            <Textarea
              value={nx.submission}
              onChange={(e) => nx.setSubmission(e.target.value)}
              rows={6}
              className="font-mono text-[11px] leading-relaxed"
              placeholder="Paste any content here — try injecting instructions to see if Gemini blocks them…"
            />
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
      className={`rounded-lg border p-3 text-left transition ${
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
      <div className="mt-1 text-[11px] text-white/40">{sub}</div>
    </button>
  );
}

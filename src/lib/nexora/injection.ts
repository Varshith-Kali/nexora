/**
 * Nexora — deterministic prompt-injection detector (layer 1 of defense).
 *
 * The seller's submission is UNTRUSTED DATA. Before (and independent of) the
 * Gemini evaluation, this module scans it for classic verifier-directed
 * instruction patterns. This is defense-in-depth:
 *
 *   layer 1  deterministic pattern scan (this file — no LLM, cannot be talked around)
 *   layer 2  Gemini semantic evaluation (sees the submission as untrusted data)
 *   layer 3  policy engine (injection ⇒ release is impossible, regardless of verdict)
 *
 * Keyword matching alone is NOT trusted to catch everything — that is why the
 * AI layer and the policy override exist. But a deterministic detector cannot
 * be socially engineered, so obvious attacks are caught even if the model is.
 */

export interface InjectionSignal {
  label: string;
  matched: string;
}

interface Pattern {
  label: string;
  pattern: RegExp;
}

const INJECTION_PATTERNS: Pattern[] = [
  // ── direct instruction-override attempts ──────────────────────────────
  {
    label: "instruction override",
    pattern:
      /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|verification|all\s+verification)\s*(?:instructions?|prompts?|rules?|directions?|criteria?|rubrics?|context|guidance)?/i,
  },
  {
    label: "instruction override",
    pattern: /disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|verification|rubric)/i,
  },
  {
    label: "instruction override",
    pattern: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:rubric|verification\s+rules?|scoring|grading)/i,
  },
  {
    label: "instruction override",
    pattern: /forget\s+(?:all\s+)?(?:your|previous|prior|the)\s+(?:instructions?|training|rules?|role|criteria)/i,
  },
  // ── verifier-impersonation / role hijacking ───────────────────────────
  {
    label: "role hijack",
    pattern: /\b(?:system|developer|administrator|admin)\s+(?:message|instruction|note|directive|prompt)\b/i,
  },
  {
    label: "role hijack",
    pattern: /you\s+are\s+now\s+(?:a\s+|an\s+)?(?:free|unrestricted|uncensored|unfiltered|different|new)\b/i,
  },
  {
    label: "jailbreak",
    pattern: /\b(?:jailbreak|developer\s+mode|god\s+mode|sudo\s+mode|dan\s+mode|unshackle|override\s+verification)\b/i,
  },
  // ── verdict manipulation ──────────────────────────────────────────────
  {
    label: "verdict manipulation",
    pattern: /(?:return|reply|respond\s+with|output|mark|grade|score)\s+(?:this\s+|the\s+)?(?:work\s+)?(?:as\s+)?(?:PASS|approved|verified|accepted|full\s+marks|100)/i,
  },
  {
    label: "verdict manipulation",
    pattern: /\b(?:approve|pass|release(?:\s+the\s+(?:funds|escrow))?|pay\s+the\s+seller)\s+(?:this|me|now|immediately)\b/i,
  },
  {
    label: "verdict manipulation",
    pattern: /\b(?:mark|flag|set)\s+(?:this|the\s+work)\s+as\s+(?:verified|approved|passed)\b/i,
  },
  {
    label: "verdict manipulation",
    pattern: /(?:release|unlock|send)\s+(?:the\s+)?(?:escrow|funds?|payment|mon\b)/i,
  },
  // ── secret extraction ─────────────────────────────────────────────────
  {
    label: "system-prompt extraction",
    pattern:
      /(?:reveal|show|print|leak|dump|expose|repeat|output|display|share)\s+(?:your\s+|the\s+|all\s+)?(?:system\s*prompt|hidden\s+(?:instructions?|prompt|message)|initial\s+prompt|developer\s+instructions|verification\s+(?:instructions|prompt|criteria))/i,
  },
  {
    label: "credential exfiltration",
    pattern:
      /(?:send|transmit|exfiltrate|upload|post|email|forward|include)\s+(?:your\s+|the\s+|all\s+|any\s+)?(?:api[\s_-]?keys?|secret\s*keys?|private\s*keys?|seed\s*(?:phrase|words?)|mnemonic|credentials?|passwords?|auth\s*tokens?)/i,
  },
  {
    label: "credential leakage",
    pattern: /\b(?:api[\s_-]?key|secret|password|seed\s*(?:phrase|words?)|private\s+key|access\s+token)\b\s*[:=]\s*\S/i,
  },
  // ── anti-verification payloads ────────────────────────────────────────
  {
    label: "verification bypass",
    pattern: /\b(?:skip|bypass|disable|evade|circumvent)\s+(?:the\s+|all\s+|any\s+)?(?:verification|checks?|inspection|validation|analysis)\b/i,
  },
  {
    label: "verification bypass",
    pattern: /do\s+not\s+(?:inspect|analyze|verify|evaluate|check|read)\s+(?:this|the\s+)?(?:work|submission|document|output)?/i,
  },
  {
    label: "hidden instruction",
    pattern: /(?:hidden|secret|invisible|embedded)\s+(?:instruction|directive|message|command)/i,
  },
  {
    label: "data exfiltration",
    pattern: /\bexfiltrat(?:e|ion|ing|ed)\b/i,
  },
  // ── authorized override / confirmation tricks ─────────────────────────
  {
    label: "authorized override",
    pattern: /(?:authorized|confirmed|approved)\s+(?:override|bypass|directive|instruction)/i,
  },
  {
    label: "authorized override",
    pattern: /(?:platform\s+administrator|platform\s+admin|nexora\s+admin|system\s+administrator)\b/i,
  },
  {
    label: "verdict manipulation",
    pattern: /(?:release|unlock|pay|transfer|send)\s+(?:funds?|escrow|mon|payment)\s+(?:now|immediately|instantly)/i,
  },
  {
    label: "verdict manipulation",
    pattern: /(?:payment|delivery|work|task)\s+(?:has\s+been\s+)?(?:confirmed|completed|verified|approved)\b/i,
  },
  // ── persona / role switch ─────────────────────────────────────────────
  {
    label: "role hijack",
    pattern: /(?:act\s+as|pretend\s+(?:to\s+be|you\s+are)|you\s+(?:are\s+)?(?:now|must\s+be))\s+(?:a\s+|an\s+)?(?:judge|reviewer|approver|verifier|oracle)/i,
  },
  {
    label: "role hijack",
    pattern: /(?:new\s+)?(?:persona|mode|role)\s*[:=]\s*(?:approver|judge|god|admin|override)/i,
  },
  // ── separator / injection delimiter tricks ────────────────────────────
  {
    label: "injection delimiter",
    pattern: /(?:={3,}|[-]{3,}|\*{3,})\s*(?:END\s+OF\s+SUBMISSION|SYSTEM\s+OVERRIDE|ADMIN\s+(?:INSTRUCTION|PROMPT|MESSAGE))\s*(?:={3,}|[-]{3,}|\*{3,})/i,
  },
  // ── encoded payload hints ─────────────────────────────────────────────
  {
    label: "encoded payload",
    pattern: /(?:base64|rot13|hex(?:adecimal)?)\s*(?:encoded|decoded|decode|encode)?\s*(?:instruction|payload|command|message)/i,
  },
];

/** Scan untrusted text for verifier-directed manipulation. */
export function detectInjection(text: string): InjectionSignal[] {
  const t = text ?? "";
  const signals: InjectionSignal[] = [];
  const seen = new Set<string>();
  for (const { label, pattern } of INJECTION_PATTERNS) {
    const m = t.match(pattern);
    if (m) {
      const matched = m[0].slice(0, 64);
      const key = `${label}:${matched.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        signals.push({ label, matched });
      }
    }
  }
  return signals;
}

export interface SubstanceCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Deterministic substance pre-checks. Run BEFORE the AI call so that empty
 * or placeholder work fails fast without spending a Gemini request.
 */
export function substanceChecks(submission: string): SubstanceCheck[] {
  const trimmed = (submission ?? "").trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return [
    {
      name: "Non-empty submission",
      passed: trimmed.length > 0,
      detail: trimmed.length ? `${trimmed.length} chars received` : "no output delivered",
    },
    {
      name: "Minimum substance",
      passed: trimmed.length >= 30 && words >= 5,
      detail: `${words} words / ${trimmed.length} chars`,
    },
  ];
}

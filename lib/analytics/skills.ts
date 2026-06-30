// Shared analytics helpers for math-skill attribution.
//
// Used by both the per-student analytics page and the class analytics page so
// the two views stay consistent. Pure functions only — no data fetching here.
// Each caller resolves a response's math context (its lesson or its step's
// goal) into a { is_correct, standard, text } shape, then hands the list off.

// ─── CCSS math domains ──────────────────────────────────────────────────────
// Domain token (the letters between grade and cluster in a code like
// "3.NBT.2" or "3.OA.A.1") → friendly name.
export const MATH_DOMAINS: Record<string, string> = {
  CC: "Counting & Cardinality",
  OA: "Operations & Algebraic Thinking",
  NBT: "Number & Base Ten",
  NF: "Fractions",
  MD: "Measurement & Data",
  G: "Geometry",
  RP: "Ratios & Proportions",
  NS: "The Number System",
  EE: "Expressions & Equations",
  SP: "Statistics & Probability",
  F: "Functions",
};

// Pull the domain token out of a CCSS code. Handles "3.NBT.2", "3.OA.A.1",
// "K.CC.1", "HSF.IF.1", "CCSS.MATH.3.NF.1", etc. Returns null if no known
// math domain is present.
export function parseMathDomain(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  // Find the first alphabetic token that is a known math domain.
  const tokens = upper.split(/[.\s_-]+/).filter(Boolean);
  for (const t of tokens) {
    if (MATH_DOMAINS[t]) return t;
  }
  return null;
}

// Keyword-based domain inference for content with no usable standard code.
const DOMAIN_KEYWORDS: { domain: string; re: RegExp }[] = [
  { domain: "NF", re: /fraction|numerator|denominator/i },
  { domain: "OA", re: /multipl|divi|array|times|product|quotient|equation|expression/i },
  { domain: "NBT", re: /place value|round|regroup|carry|borrow|base ?ten|add|subtract|sum|difference/i },
  { domain: "MD", re: /measur|length|volume|mass|perimeter|area|time|clock|graph|data/i },
  { domain: "G", re: /geometr|shape|angle|polygon|triangle|quadrilateral|symmetr/i },
];

function inferDomain(standard: string | null, text: string): string | null {
  const fromCode = parseMathDomain(standard);
  if (fromCode) return fromCode;
  for (const k of DOMAIN_KEYWORDS) {
    if (k.re.test(text)) return k.domain;
  }
  return null;
}

// ─── Curated promotional (gatekeeper) skills ────────────────────────────────
// These are the headline skills teachers care about for promotion. Matched by
// keyword against a response's text + standard, independent of domain bucketing.
export const CURATED_MATH_SKILLS: { label: string; re: RegExp }[] = [
  {
    label: "Addition & Subtraction",
    re: /\badd(ition|ing|s)?\b|\bsubtract(ion|ing|s)?\b|\bsum\b|\bdifference\b|\bplus\b|\bminus\b|\bnbt\b/i,
  },
  {
    label: "Multiplication & Division",
    re: /multipl|divi|\barray\b|\btimes\b|\bproduct\b|\bquotient\b|\boa\b/i,
  },
  {
    label: "Fractions",
    re: /fraction|numerator|denominator|\bnf\b/i,
  },
  {
    label: "Place Value",
    re: /place ?value|round(ing)?|regroup|base ?ten|tens|hundreds|thousands/i,
  },
];

export interface MathResponse {
  is_correct: boolean | null;
  standard: string | null;
  text: string;
}

export interface SkillBar {
  label: string;
  pct: number;
  total: number;
  hasData: boolean;
}

export interface MathSkillsResult {
  curated: SkillBar[];
  domains: SkillBar[];
  totalResponses: number;
}

function toBar(label: string, correct: number, total: number): SkillBar {
  return {
    label,
    pct: total > 0 ? Math.round((correct / total) * 100) : 0,
    total,
    hasData: total > 0,
  };
}

// Compute curated promotional skills + a CCSS-domain breakdown from a list of
// math-only responses. Curated bars are always returned (so teachers see the
// full promotional checklist, with "No data yet" where untouched). Domain bars
// are only returned for domains that actually have data, ordered by volume.
export function computeMathSkills(responses: MathResponse[]): MathSkillsResult {
  const curatedAgg: Record<string, { correct: number; total: number }> = {};
  CURATED_MATH_SKILLS.forEach((s) => (curatedAgg[s.label] = { correct: 0, total: 0 }));

  const domainAgg: Record<string, { correct: number; total: number }> = {};

  responses.forEach((r) => {
    const haystack = `${r.text} ${r.standard ?? ""}`;
    // Curated (a response can count toward multiple promotional skills).
    CURATED_MATH_SKILLS.forEach((s) => {
      if (s.re.test(haystack)) {
        curatedAgg[s.label].total++;
        if (r.is_correct) curatedAgg[s.label].correct++;
      }
    });
    // Domain (single bucket per response).
    const domain = inferDomain(r.standard, r.text);
    const key = domain ?? "OTHER";
    if (!domainAgg[key]) domainAgg[key] = { correct: 0, total: 0 };
    domainAgg[key].total++;
    if (r.is_correct) domainAgg[key].correct++;
  });

  const curated = CURATED_MATH_SKILLS.map((s) =>
    toBar(s.label, curatedAgg[s.label].correct, curatedAgg[s.label].total)
  );

  const domains = Object.entries(domainAgg)
    .map(([key, v]) =>
      toBar(key === "OTHER" ? "Other Math" : MATH_DOMAINS[key] ?? key, v.correct, v.total)
    )
    .filter((b) => b.hasData)
    .sort((a, b) => b.total - a.total);

  return { curated, domains, totalResponses: responses.length };
}

// ─── Student-facing skill levels ────────────────────────────────────────────
// Encouraging, non-judgmental labels for the student dashboard (Phase 2). Kept
// here so teacher + student views share the same thresholds.
export type SkillLevel = "Learning" | "Practicing" | "Strong";

export function skillLevel(pct: number, total: number): { level: SkillLevel; color: string } {
  if (total === 0) return { level: "Learning", color: "#94A3B8" };
  if (pct >= 80) return { level: "Strong", color: "#028090" };
  if (pct >= 55) return { level: "Practicing", color: "#D97706" };
  return { level: "Learning", color: "#7C3AED" };
}

// ─── Subject colors (shared chips) ──────────────────────────────────────────
export const SUBJECT_COLORS: Record<string, string> = {
  Math: "#028090",
  Reading: "#7C3AED",
  Writing: "#DB2777",
  Science: "#0EA5E9",
  History: "#D97706",
  Spelling: "#16A34A",
};

export function subjectColor(subject: string | null | undefined): string {
  if (!subject) return "#64748B";
  return SUBJECT_COLORS[subject] ?? "#64748B";
}

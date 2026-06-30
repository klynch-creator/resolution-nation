// Continuous adaptive-difficulty model for the lesson engine.
//
// Difficulty is a single grade-equivalent `level` (a number): 0 = Kindergarten,
// 1 = Grade 1 … 12 = Grade 12, 13+ = college. There is no hard ceiling (we clamp
// only to keep prompts sane). The level is HIDDEN from students; teachers and
// parents see it as a friendly grade label. The legacy below/at/above `tier`
// is derived from level vs the student's enrolled grade and is used only for
// lesson length + analytics labels.
//
// The goal: every student settles where they pass at ~80% (70–90% is the happy
// band). After each lesson the level nudges so the next one lands there.

import type { LessonTier } from "@/types";

export const MAX_LEVEL = 20; // ~grad school; effectively "no cap" for K-12
export const MIN_LEVEL = 0; // Kindergarten floor

// Parse profiles.grade ("K", "3", "Grade 5", "10") into a numeric level.
export function gradeToLevel(grade: string | null | undefined): number {
  if (!grade) return 3; // sensible default when grade is unknown
  const g = grade.toString().trim().toLowerCase();
  if (g === "k" || g.includes("kinder")) return 0;
  if (g.includes("pre")) return 0;
  const m = g.match(/\d+/);
  if (m) return clampLevel(parseInt(m[0], 10));
  return 3;
}

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
}

// Friendly label for teachers/parents (never shown to students).
export function levelToGradeLabel(level: number): string {
  const l = Math.round(level * 10) / 10;
  if (l < 0.5) return "Kindergarten";
  if (l >= 13) return l >= 16 ? "College+" : "College";
  const whole = Math.floor(l);
  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  // e.g. 4.6 → "4th–5th grade"; 4.0 → "4th grade"
  const frac = l - whole;
  if (frac < 0.25) return `${ord(whole)} grade`;
  if (frac > 0.75) return `${ord(whole + 1)} grade`;
  return `${ord(whole)}–${ord(whole + 1)} grade`;
}

// Derive the legacy tier from the absolute level vs the student's grade.
export function deriveTier(level: number, grade: string | null | undefined): LessonTier {
  const g = gradeToLevel(grade);
  if (level <= g - 1) return "below";
  if (level >= g + 1) return "above";
  return "at";
}

// Lesson length by tier — short & responsive when struggling, never huge.
export const QUESTION_PLAN: Record<
  LessonTier,
  { total: number; easy: number; medium: number; hard: number }
> = {
  below: { total: 6, easy: 3, medium: 2, hard: 1 },
  at: { total: 8, easy: 2, medium: 4, hard: 2 },
  above: { total: 10, easy: 2, medium: 4, hard: 4 },
};

// ── Star + level math (mirrors the complete_lesson RPC; RPC is authoritative) ──

// Stars awarded by SCORE band. The adaptive difficulty equalizes acquisition by
// keeping students near ~80%.
export function starsForScore(scorePct: number): number {
  if (scorePct >= 100) return 8;
  if (scorePct >= 71) return 6;
  if (scorePct >= 41) return 4;
  return 2;
}
export const MAX_LESSON_STARS = 8;

// How far to move the level after a lesson, in grade-equivalents, based on how
// the score compares to the ~80% target band. Bigger nudges while we're still
// calibrating (the student's first few lessons).
export function levelDelta(scorePct: number, lessonsCompleted: number): number {
  let d: number;
  if (scorePct >= 95) d = 0.8;
  else if (scorePct >= 85) d = 0.4;
  else if (scorePct >= 71) d = 0.1; // in the sweet spot — drift up gently
  else if (scorePct >= 55) d = -0.4;
  else if (scorePct >= 41) d = -0.8;
  else d = -1.2;
  const calibrating = lessonsCompleted < 3;
  return d * (calibrating ? 1.75 : 1);
}

// ── Difficulty descriptions fed to the generator ──────────────────────────────
// These translate a numeric level into concrete, level-true guidance so the AI
// produces genuinely Kindergarten/phonics content at the low end and genuinely
// college-level rigor at the high end.

export function describeReadingLevel(level: number): { guidance: string; passageWords: string } {
  if (level < 1)
    return {
      guidance:
        "KINDERGARTEN / emergent reader. Use a VERY short decodable text with simple CVC words (cat, run, big) and common sight words (the, is, a, see). One concrete idea, present tense, short sentences (3–6 words). Questions test letter–sound, sight words, and literal recall ('Who is in the story?', 'What did the dog do?'). No inference.",
      passageWords: "40–70 words",
    };
  if (level < 2)
    return {
      guidance:
        "1st grade. Short decodable + high-frequency words, simple blends and digraphs. Simple sentences, one clear event. Questions: literal recall, basic sequence, simple main idea (what is it mostly about).",
      passageWords: "60–110 words",
    };
  if (level < 3)
    return {
      guidance:
        "2nd grade. Simple connected text with everyday vocabulary. Begin light inference and key details. Short, clear paragraphs.",
      passageWords: "110–180 words",
    };
  if (level < 5)
    return {
      guidance:
        "3rd–4th grade. State-test style informational or literary passage. Main idea, key details, inference, vocabulary-in-context. Grade-appropriate academic vocabulary.",
      passageWords: "180–300 words",
    };
  if (level < 7)
    return {
      guidance:
        "5th–6th grade. Richer structure, multiple paragraphs, text features. Inference, author's purpose, text structure, vocabulary-in-context.",
      passageWords: "250–400 words",
    };
  if (level < 9)
    return {
      guidance:
        "7th–8th grade. Denser informational/literary text with academic vocabulary, central idea + supporting evidence, analysis of structure and word choice.",
      passageWords: "350–500 words",
    };
  if (level < 13)
    return {
      guidance:
        "High school (9th–12th). Complex syntax and abstract ideas, rhetorical analysis, citing textual evidence, nuance and tone. Test like the SAT/state Regents.",
      passageWords: "450–650 words",
    };
  return {
    guidance:
      "College level. Sophisticated academic prose, dense argumentation, abstract/technical vocabulary, analysis of rhetoric, assumptions, and inference. Rigor of a college reading exam.",
    passageWords: "500–750 words",
  };
}

export function describeMathLevel(level: number): string {
  if (level < 1)
    return "KINDERGARTEN math. Counting and cardinality to 20, number recognition, comparing more/fewer, simple addition/subtraction within 10 with pictures or simple words. Keep numbers tiny and concrete.";
  if (level < 2)
    return "1st grade math. Addition/subtraction within 20, place value to 100 (tens & ones), simple word problems, basic shapes.";
  if (level < 3)
    return "2nd grade math. Addition/subtraction within 100–1000, place value, intro to arrays/repeated addition, money, time, simple measurement.";
  if (level < 5)
    return "3rd–4th grade math. Multiplication/division facts, multi-digit operations, fractions (compare, equivalent), area/perimeter, multi-step word problems.";
  if (level < 7)
    return "5th–6th grade math. Operations with fractions and decimals, ratios, percentages, the coordinate plane, volume, intro to expressions.";
  if (level < 9)
    return "7th–8th grade math. Proportional reasoning, integers and rational numbers, linear equations, the Pythagorean theorem, functions, basic statistics.";
  if (level < 13)
    return "High school math. Algebra I/II and geometry: quadratics, systems, polynomials, functions, proofs, trigonometry. Multi-step reasoning, test like the SAT/Regents.";
  return "College math. Pre-calculus/calculus and beyond: limits, derivatives, advanced algebra/trig, rigorous multi-step problem solving.";
}

export function describeSpellingLevel(level: number): string {
  if (level < 1)
    return "KINDERGARTEN spelling. CVC words (cat, dog, sit), beginning/ending sounds, a few sight words. Very simple.";
  if (level < 2)
    return "1st grade spelling. CVC, blends/digraphs (sh, ch, th), short-vowel patterns, common sight words.";
  if (level < 3)
    return "2nd grade spelling. Long-vowel patterns, common suffixes (-ed, -ing, -s), contractions, frequent sight words.";
  if (level < 5)
    return "3rd–4th grade spelling. Multisyllabic words, prefixes/suffixes, vowel teams, homophones, common irregular words.";
  if (level < 7)
    return "5th–6th grade spelling. Greek/Latin roots, more affixes, harder homophones, content-area vocabulary.";
  if (level < 9)
    return "7th–8th grade spelling. Advanced roots/affixes, commonly confused words, academic vocabulary.";
  if (level < 13)
    return "High school spelling/vocabulary. Sophisticated academic and domain words, nuanced spellings.";
  return "College vocabulary. Advanced, technical, and academic terms.";
}

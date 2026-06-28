// ============================================================
// Reading-fluency scoring.
//
// Aligns the words a student actually read (from speech-to-text) against the
// reference passage, then derives the metrics teachers care about:
//   - WCPM   (words correct per minute) -> compared to ORF norms elsewhere
//   - accuracy %
//   - miscues (substitutions, omissions, insertions)
//
// Conventions (kept deliberately close to standard ORF scoring):
//   * Errors counted = substitutions + omissions. Insertions / repetitions are
//     surfaced for the teacher but NOT counted as errors, so a child who
//     self-corrects or repeats a word is not penalized.
//   * Reference words after the furthest point the reader reached are treated as
//     "not reached" (the child ran out of passage/time), not as omissions.
//
// Pure functions only — no I/O — so this is unit-testable.
// ============================================================

export interface SttWord {
  word: string;
  /** seconds from start of audio */
  start: number;
  /** seconds from start of audio */
  end: number;
}

export type MiscueType = "substitution" | "omission" | "insertion";

export interface Miscue {
  type: MiscueType;
  /** the passage word that was expected (omission/substitution) */
  expected?: string;
  /** the word the student actually said (substitution/insertion) */
  heard?: string;
  /** index into the reference passage tokens, for ordering in the UI */
  refIndex: number;
}

export interface FluencyScore {
  wordsCorrect: number;
  wordsRead: number; // correct + substitutions + omissions reached
  passageWordCount: number;
  substitutions: number;
  omissions: number;
  insertions: number;
  errors: number; // substitutions + omissions
  durationSeconds: number;
  wcpm: number;
  accuracyPct: number; // 0-100
  /** fraction of the passage the reader reached, 0-100 */
  completionPct: number;
  miscues: Miscue[];
}

/** Lowercase, strip surrounding punctuation, collapse internal apostrophes. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "'") // smart quotes -> straight
    .replace(/[^a-z0-9']/g, "") // drop punctuation
    .replace(/^'+|'+$/g, ""); // trim stray apostrophes
}

/** Split text into normalized, non-empty word tokens. */
export function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);
}

type Op = "match" | "sub" | "del" | "ins";

/**
 * Needleman-Wunsch global alignment between reference and hypothesis tokens.
 * Returns the edit operations in reading order.
 *   del = a reference word with no hypothesis match (omission)
 *   ins = a hypothesis word with no reference match (insertion/repetition)
 */
function align(ref: string[], hyp: string[]): Array<{ op: Op; r: number; h: number }> {
  const n = ref.length;
  const m = hyp.length;
  const MATCH = 0;
  const MISMATCH = 1;
  const GAP = 1;

  // cost[i][j] = min cost to align ref[0..i) with hyp[0..j)
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) cost[i][0] = i * GAP;
  for (let j = 0; j <= m; j++) cost[0][j] = j * GAP;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = cost[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? MATCH : MISMATCH);
      const del = cost[i - 1][j] + GAP;
      const ins = cost[i][j - 1] + GAP;
      cost[i][j] = Math.min(sub, del, ins);
    }
  }

  // Backtrace.
  const ops: Array<{ op: Op; r: number; h: number }> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const matched = ref[i - 1] === hyp[j - 1];
      const subCost = cost[i - 1][j - 1] + (matched ? MATCH : MISMATCH);
      if (cost[i][j] === subCost) {
        ops.push({ op: matched ? "match" : "sub", r: i - 1, h: j - 1 });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && cost[i][j] === cost[i - 1][j] + GAP) {
      ops.push({ op: "del", r: i - 1, h: -1 });
      i--;
      continue;
    }
    ops.push({ op: "ins", r: -1, h: j - 1 });
    j--;
  }
  ops.reverse();
  return ops;
}

export interface ScoreInput {
  passage: string;
  /** Word-level STT output. If timestamps are absent, pass durationSeconds. */
  words: SttWord[];
  /** Total reading time in seconds. If omitted, derived from word timestamps. */
  durationSeconds?: number;
  /** cap on miscues returned (keeps payload small) */
  maxMiscues?: number;
}

export function scoreReading(input: ScoreInput): FluencyScore {
  const ref = tokenize(input.passage);
  const hypTokens = input.words.map((w) => normalizeWord(w.word)).filter((w) => w.length > 0);

  // Duration: prefer explicit value, else span of word timestamps.
  let durationSeconds = input.durationSeconds ?? 0;
  if (!durationSeconds && input.words.length > 0) {
    const starts = input.words.map((w) => w.start).filter((s) => Number.isFinite(s));
    const ends = input.words.map((w) => w.end).filter((s) => Number.isFinite(s));
    if (starts.length && ends.length) {
      durationSeconds = Math.max(0, Math.max(...ends) - Math.min(...starts));
    }
  }
  durationSeconds = Math.max(durationSeconds, 0.001); // avoid divide-by-zero

  const ops = align(ref, hypTokens);

  // Furthest reference index the reader actually reached (last match or sub).
  let lastReached = -1;
  for (const o of ops) {
    if ((o.op === "match" || o.op === "sub") && o.r > lastReached) lastReached = o.r;
  }

  let wordsCorrect = 0;
  let substitutions = 0;
  let omissions = 0;
  let insertions = 0;
  const miscues: Miscue[] = [];
  const maxMiscues = input.maxMiscues ?? 60;

  for (const o of ops) {
    if (o.op === "match") {
      wordsCorrect++;
    } else if (o.op === "sub") {
      substitutions++;
      if (miscues.length < maxMiscues)
        miscues.push({
          type: "substitution",
          expected: ref[o.r],
          heard: hypTokens[o.h],
          refIndex: o.r,
        });
    } else if (o.op === "del") {
      // Only count omissions before the furthest point reached; trailing
      // reference words were never reached, not skipped.
      if (o.r <= lastReached) {
        omissions++;
        if (miscues.length < maxMiscues)
          miscues.push({ type: "omission", expected: ref[o.r], refIndex: o.r });
      }
    } else {
      insertions++;
      if (miscues.length < maxMiscues)
        miscues.push({
          type: "insertion",
          heard: hypTokens[o.h],
          refIndex: Math.max(0, lastReached),
        });
    }
  }

  const wordsRead = wordsCorrect + substitutions + omissions;
  const errors = substitutions + omissions;
  const minutes = durationSeconds / 60;
  const wcpm = Math.round(wordsCorrect / minutes);
  const accuracyPct = wordsRead > 0 ? Math.round((wordsCorrect / wordsRead) * 1000) / 10 : 0;
  const completionPct = ref.length > 0 ? Math.round(((lastReached + 1) / ref.length) * 100) : 0;

  return {
    wordsCorrect,
    wordsRead,
    passageWordCount: ref.length,
    substitutions,
    omissions,
    insertions,
    errors,
    durationSeconds: Math.round(durationSeconds * 10) / 10,
    wcpm,
    accuracyPct,
    completionPct,
    miscues,
  };
}

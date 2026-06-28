// ============================================================
// Oral Reading Fluency (ORF) norms + grade-level classification
// Source: Hasbrouck, J. & Tindal, G. (2017). An update to compiled ORF
// norms (Technical Report No. 1702). Behavioral Research and Teaching,
// University of Oregon. Values are WCPM (Words Correct Per Minute).
//
// We use the 25th and 50th percentiles to band a reader:
//   on          -> WCPM >= 50th percentile (at or above benchmark)
//   approaching  -> 25th percentile <= WCPM < 50th percentile
//   below        -> WCPM < 25th percentile
//
// Norms are published for grades 1-6 only. ORF rate plateaus by grade 6, so
// for grades 7-12 we benchmark against grade 6 (flagged via `normSource`).
// Kindergarten has no ORF norm; we record WCPM but do not assign a band.
// ============================================================

export type FluencyLevel = "below" | "approaching" | "on";
export type OrfSeason = "fall" | "winter" | "spring";

/** Percentile WCPM for a single grade/season. null = no data (e.g. G1 fall). */
interface SeasonNorms {
  p25: number | null;
  p50: number | null;
}

interface GradeNorms {
  fall: SeasonNorms;
  winter: SeasonNorms;
  spring: SeasonNorms;
}

// Grade (1-6) -> season -> {p25, p50}. Verified against the 2017 published table.
const ORF_NORMS: Record<number, GradeNorms> = {
  1: {
    fall: { p25: null, p50: null },
    winter: { p25: 16, p50: 29 },
    spring: { p25: 34, p50: 60 },
  },
  2: {
    fall: { p25: 36, p50: 50 },
    winter: { p25: 59, p50: 84 },
    spring: { p25: 72, p50: 100 },
  },
  3: {
    fall: { p25: 59, p50: 83 },
    winter: { p25: 79, p50: 97 },
    spring: { p25: 91, p50: 112 },
  },
  4: {
    fall: { p25: 75, p50: 94 },
    winter: { p25: 95, p50: 120 },
    spring: { p25: 105, p50: 133 },
  },
  5: {
    fall: { p25: 87, p50: 121 },
    winter: { p25: 109, p50: 133 },
    spring: { p25: 119, p50: 146 },
  },
  6: {
    fall: { p25: 112, p50: 132 },
    winter: { p25: 116, p50: 145 },
    spring: { p25: 122, p50: 146 },
  },
};

const MAX_NORMED_GRADE = 6;

/**
 * Parse a free-form grade value (e.g. "3", "Grade 3", "3rd", "K", "10") into an
 * integer grade. Returns null for kindergarten / unparseable values.
 */
export function parseGrade(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const g = grade.toString().trim().toLowerCase();
  if (g === "k" || g.startsWith("kind") || g === "0") return 0;
  const m = g.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (Number.isNaN(n) || n < 0 || n > 12) return null;
  return n;
}

/** Map a calendar month (0-11, JS getMonth) to the ORF benchmarking season. */
export function seasonForMonth(month: number): OrfSeason {
  // Fall: Sep-Nov (8-10). Winter: Dec-Mar (11,0,1,2). Spring: Apr-Aug (3-7).
  if (month >= 8 && month <= 10) return "fall";
  if (month === 11 || month <= 2) return "winter";
  return "spring";
}

export interface NormLookup {
  /** below | approaching | on, or null when no norm exists (e.g. kindergarten). */
  level: FluencyLevel | null;
  /** 25th percentile WCPM benchmark used, or null. */
  p25: number | null;
  /** 50th percentile WCPM benchmark used, or null. */
  p50: number | null;
  season: OrfSeason;
  /** Grade whose norms were actually used (may differ from the student's grade
   *  when falling back to grade 6 for grades 7-12). */
  normGrade: number | null;
  /** "exact" when the student's own grade is normed, "proxy" when grade 6 was
   *  used as a stand-in, "none" when no norm applies (K / unknown grade). */
  normSource: "exact" | "proxy" | "none";
}

/**
 * Classify a WCPM score for a student grade at a given date.
 * @param wcpm   words correct per minute
 * @param grade  raw grade string from the profile
 * @param date   assessment date (defaults to now) -> determines season
 */
export function classifyWcpm(
  wcpm: number,
  grade: string | null | undefined,
  date: Date = new Date()
): NormLookup {
  const season = seasonForMonth(date.getMonth());
  const g = parseGrade(grade);

  // No norm: kindergarten or unknown grade.
  if (g === null || g === 0) {
    return { level: null, p25: null, p50: null, season, normGrade: null, normSource: "none" };
  }

  const normGrade = Math.min(g, MAX_NORMED_GRADE);
  const normSource: NormLookup["normSource"] = g > MAX_NORMED_GRADE ? "proxy" : "exact";
  const { p25, p50 } = ORF_NORMS[normGrade][season];

  // Grade 1 fall has no published norm; treat as not-normed for that window.
  if (p25 === null || p50 === null) {
    return { level: null, p25, p50, season, normGrade, normSource };
  }

  let level: FluencyLevel;
  if (wcpm >= p50) level = "on";
  else if (wcpm >= p25) level = "approaching";
  else level = "below";

  return { level, p25, p50, season, normGrade, normSource };
}

export const FLUENCY_LEVEL_LABEL: Record<FluencyLevel, string> = {
  below: "Below grade level",
  approaching: "Approaching grade level",
  on: "On / above grade level",
};

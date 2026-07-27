/**
 * Canonical grade-level values for `profiles.grade`.
 *
 * NOTE: this is a grade LEVEL ("3" = third grade), not a report-card mark.
 * Report-card letter/number scores live in the extracted report-card payload
 * (`ExtractedReportCard.subjects[].score`) and never touch this column.
 *
 * The list previously existed only as an inline array in the signup form.
 * Centralised here so the server can validate against the same set.
 */
export const GRADES = [
  "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
] as const;

export type Grade = (typeof GRADES)[number];

const GRADE_SET: ReadonlySet<string> = new Set(GRADES);

export function isValidGrade(value: unknown): value is Grade {
  return typeof value === "string" && GRADE_SET.has(value);
}

/** Human label for a grade value, e.g. "K" -> "Kindergarten". */
export function gradeLabel(g: string): string {
  return g === "K" ? "Kindergarten" : `Grade ${g}`;
}

import Anthropic from "@anthropic-ai/sdk";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/** Service-role client — used only for moderation/freeze writes (never exposed). */
export function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export function extractJson(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return t.slice(first, last + 1);
  return t;
}

export type Verdict = "ok" | "borderline" | "inappropriate";
export interface ModerationResult {
  verdict: Verdict;
  categories: string;
  reason: string;
}

const MOD_SYSTEM = `You are a child-safety content moderator for a K-12 school writing app. You judge whether a STUDENT's writing is appropriate for school.

Return ONLY JSON: { "verdict": "ok" | "borderline" | "inappropriate", "categories": "comma-separated or empty", "reason": "one short sentence" }

"inappropriate" (clearly NOT school-appropriate — these should lock the account for an adult to review):
- sexual or sexually explicit content
- graphic/gory violence, or threats of violence toward real people
- self-harm, suicide, or eating-disorder content
- harassment, bullying, hate, or slurs toward a person or group
- weapons-making, drugs/alcohol/vaping use, or other clearly unsafe content
- sharing of personal contact info (address, phone, etc.)

"borderline": mild profanity, mild rude language, or mild conflict that a teacher may want to glance at but is not unsafe.

"ok": normal, school-appropriate writing.

IMPORTANT: This may be CREATIVE FICTION. Age-appropriate fictional conflict, mild peril, or a "bad guy" is OK. Only mark fiction "inappropriate" if it contains the genuinely unsafe categories above (explicit sexual content, graphic gore, self-harm, hate/slurs, real threats). When unsure between ok and borderline, prefer borderline; reserve "inappropriate" for clear cases.`;

export async function moderate(
  anthropic: Anthropic,
  text: string,
  mode: string
): Promise<ModerationResult> {
  if (!text || text.trim().length === 0) {
    return { verdict: "ok", categories: "", reason: "empty" };
  }
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: MOD_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Writing mode: ${mode}\nStudent writing:\n"""\n${text.slice(0, 8000)}\n"""`,
        },
      ],
    });
    const c = msg.content[0];
    if (c.type !== "text") return { verdict: "ok", categories: "", reason: "" };
    const parsed = JSON.parse(extractJson(c.text)) as Partial<ModerationResult>;
    const verdict: Verdict =
      parsed.verdict === "inappropriate" || parsed.verdict === "borderline"
        ? parsed.verdict
        : "ok";
    return { verdict, categories: parsed.categories ?? "", reason: parsed.reason ?? "" };
  } catch {
    // Fail safe: don't block on moderator error, but surface for review as borderline.
    return { verdict: "borderline", categories: "moderation_error", reason: "Could not auto-check; please review." };
  }
}

/**
 * Record a moderation flag for content that wasn't "ok". On "inappropriate"
 * the account is frozen (blocked) and the teacher + parent can review. Returns
 * whether the account was blocked. Uses the service-role admin client.
 */
export async function applyModeration(
  admin: ReturnType<typeof getAdmin>,
  args: {
    studentId: string;
    sourceType: "writing_submission" | "creative_story";
    sourceId: string | null;
    mode: string;
    text: string;
    result: ModerationResult;
  }
): Promise<{ blocked: boolean; flagged: boolean }> {
  const { studentId, sourceType, sourceId, mode, text, result } = args;
  if (result.verdict === "ok") return { blocked: false, flagged: false };

  const severity = result.verdict === "inappropriate" ? "block" : "flag";
  await admin.from("moderation_flags").insert({
    student_id: studentId,
    source_type: sourceType,
    source_id: sourceId,
    mode,
    excerpt: text.slice(0, 4000),
    reason: result.reason,
    categories: result.categories,
    severity,
  });

  if (severity === "block") {
    await admin
      .from("profiles")
      .update({
        is_frozen: true,
        frozen_at: new Date().toISOString(),
        frozen_reason: "Writing flagged for review by a teacher.",
      })
      .eq("id", studentId);
    return { blocked: true, flagged: true };
  }
  return { blocked: false, flagged: true };
}

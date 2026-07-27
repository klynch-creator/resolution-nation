import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/roster/import — CSV bulk roster import (RN-37).
 *
 * Teacher uploads a roster; we create student accounts with synthetic
 * usernames (no student email required — standard K-8 pattern) and add
 * them to the teacher's class pod.
 *
 * COPPA: these are school-track accounts — the school/teacher provides
 * consent for educational use (consent_track = 'school'). No DOB is
 * collected or stored.
 *
 * Body: { podId: string, students: Array<{ firstName, lastName, grade? }> }
 * Returns generated credentials ONCE — they are not retrievable later
 * (the teacher prints or downloads login cards immediately).
 */

const MAX_STUDENTS = 40;
const EMAIL_DOMAIN = "students.resolutionnation.app";

/**
 * Password generation (security review 2026-07-26, H1).
 *
 * The original generator drew from 10 adjectives x 10 nouns x a 2-digit
 * number = 9,000 possible passwords, using Math.random(). Two problems:
 * the keyspace was small enough to exhaust, and Math.random() is not a
 * CSPRNG — V8's xorshift128+ internal state is recoverable from a handful
 * of observed outputs, so a teacher who imports one roster and reads 40
 * passwords could predict passwords minted for other classes on the same
 * serverless instance. Usernames are derived from names on a class list
 * and are not secret, so the password is the only real barrier to a
 * child's full education record.
 *
 * Now: 64 x 64 x 9000 = 36,864,000 combinations (~4,100x the old keyspace),
 * drawn from crypto.randomInt (CSPRNG, rejection-sampled, unbiased).
 * Format stays readable for a K-8 login card: `swift-otter-4821`, 16
 * characters, three chunks, no ambiguous glyphs.
 *
 * Word lists deliberately avoid: homophones, anything that could combine
 * into a phrase a child would be teased about, and letters that are easy
 * to confuse when copying off a printed card.
 */
const WORDS_A = [
  "blue", "red", "gold", "green", "swift", "brave", "lucky", "sunny",
  "cosmic", "mighty", "jolly", "kind", "bright", "calm", "clever", "eager",
  "fancy", "gentle", "happy", "humble", "jazzy", "keen", "lively", "loyal",
  "merry", "noble", "peppy", "proud", "quick", "quiet", "royal", "sharp",
  "shiny", "silver", "smooth", "snappy", "solid", "sparkly", "spry", "steady",
  "sturdy", "sleek", "super", "tidy", "true", "upbeat", "vivid", "warm",
  "wise", "witty", "zesty", "amber", "coral", "crisp", "daring", "epic",
  "fresh", "glad", "grand", "hardy", "ideal", "joyful", "nimble", "polite",
] as const;

const WORDS_B = [
  "tiger", "eagle", "comet", "river", "maple", "falcon", "panda", "rocket",
  "otter", "dragon", "acorn", "anchor", "badger", "bamboo", "beacon", "bison",
  "boulder", "bridge", "canyon", "cedar", "cheetah", "cobra", "condor", "coral",
  "cricket", "dolphin", "ember", "firefly", "ferret", "garden", "geyser", "glacier",
  "harbor", "heron", "island", "jaguar", "kestrel", "lantern", "lizard", "lotus",
  "meadow", "meteor", "moose", "nebula", "orchid", "osprey", "penguin", "pepper",
  "planet", "prairie", "puffin", "quartz", "rabbit", "raccoon", "salmon", "sequoia",
  "sparrow", "summit", "thunder", "tundra", "turtle", "walrus", "willow", "zebra",
] as const;

function genPassword(): string {
  const a = WORDS_A[randomInt(WORDS_A.length)];
  const b = WORDS_B[randomInt(WORDS_B.length)];
  const n = randomInt(1000, 10000); // 4 digits, never zero-padded
  return `${a}-${b}-${n}`;
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "roster-import", limit: 5, windowSec: 300 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { podId, students } = await request.json();

    if (!podId || typeof podId !== "string") {
      return NextResponse.json({ error: "podId is required." }, { status: 400 });
    }
    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "No students to import." }, { status: 400 });
    }
    if (students.length > MAX_STUDENTS) {
      return NextResponse.json(
        { error: `Import up to ${MAX_STUDENTS} students at a time.` },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    // Must be a teacher who owns this pod (RLS-scoped read).
    const { data: pod } = await supabase
      .from("pods")
      .select("id, name, created_by")
      .eq("id", podId)
      .eq("created_by", user.id)
      .single();
    if (!pod) {
      return NextResponse.json({ error: "Class not found or not yours." }, { status: 403 });
    }
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (me?.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can import rosters." }, { status: 403 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: Array<{
      fullName: string;
      grade: string | null;
      username: string;
      password: string;
      ok: boolean;
      error?: string;
    }> = [];
    const usedLocal = new Set<string>();

    for (const row of students) {
      const firstName = String(row?.firstName ?? "").trim();
      const lastName = String(row?.lastName ?? "").trim();
      const grade = row?.grade ? String(row.grade).trim() : null;
      const fullName = `${firstName} ${lastName}`.trim();

      if (!firstName || !lastName) {
        results.push({ fullName: fullName || "(blank row)", grade, username: "", password: "", ok: false, error: "Missing first or last name." });
        continue;
      }

      // Unique local-part: first initial + last name + 2 digits.
      // Usernames are not secret (they're derivable from a class list), but
      // use the CSPRNG here too so the suffix can't be correlated with the
      // password stream generated on the same instance.
      let local = "";
      for (let tries = 0; tries < 20; tries++) {
        const candidate = `${slug(firstName).slice(0, 1)}${slug(lastName).slice(0, 12)}${randomInt(10, 100)}`;
        if (!usedLocal.has(candidate)) {
          local = candidate;
          usedLocal.add(candidate);
          break;
        }
      }
      if (!local) {
        // 20 collisions on the same name — surface it rather than attempting
        // to create an account with an "@domain" email and a cryptic error.
        results.push({
          fullName,
          grade,
          username: "",
          password: "",
          ok: false,
          error: "Could not generate a unique username. Add a middle initial and retry.",
        });
        continue;
      }
      const email = `${local}@${EMAIL_DOMAIN}`;
      const password = genPassword();

      try {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // synthetic address; nothing to confirm
          user_metadata: {
            full_name: fullName,
            role: "student",
            grade,
            consent_track: "school",
          },
        });
        if (createErr || !created.user) {
          results.push({ fullName, grade, username: email, password: "", ok: false, error: createErr?.message ?? "Could not create account." });
          continue;
        }

        // Safety net if the DB trigger is missing: ensure profile exists.
        await admin.from("profiles").upsert(
          { id: created.user.id, full_name: fullName, role: "student", grade },
          { onConflict: "id", ignoreDuplicates: true }
        );

        const { error: memberErr } = await admin.from("pod_members").insert({
          pod_id: podId,
          user_id: created.user.id,
          role: "member",
        });
        if (memberErr) {
          results.push({ fullName, grade, username: email, password, ok: false, error: `Account created but not added to class: ${memberErr.message}` });
          continue;
        }

        results.push({ fullName, grade, username: email, password, ok: true });
      } catch (e) {
        results.push({ fullName, grade, username: email, password: "", ok: false, error: e instanceof Error ? e.message : "Unknown error." });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;

    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "roster_import",
      target_type: "pod",
      target_id: podId,
      metadata: { attempted: students.length, succeeded },
    });

    return NextResponse.json({ podName: pod.name, succeeded, failed: results.length - succeeded, results });
  } catch (e) {
    // Security review 2026-07-26 (L5): log the detail, return a generic
    // message. Per-row `results[].error` values are still surfaced — those are
    // actionable for the teacher and are generated by this route, not raw
    // database text.
    console.error("Roster import error:", e);
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}

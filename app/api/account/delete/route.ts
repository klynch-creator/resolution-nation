import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * In-app account deletion.
 *
 * Required by:
 *   - Apple App Store Review Guideline 5.1.1(v) — apps that
 *     support account creation must also offer account deletion
 *     from inside the app.
 *   - Google Play User Data policy — explicit in-app deletion
 *     path required as of 2023.
 *   - FERPA / COPPA / NY Ed Law 2-d — parents (or schools acting
 *     as agents) have the right to request deletion of student
 *     personal information.
 *
 * Implementation: soft-delete with a 30-day reversal window.
 * The account_deletion_requests row is created by the
 * request_account_deletion DB function (SECURITY DEFINER), which
 * also writes an audit log entry. A scheduled job (not in this
 * route) reads the table and performs the hard delete after the
 * scheduled_for timestamp.
 *
 * POST   → request deletion
 * DELETE → cancel a pending deletion
 * GET    → status (pending? scheduled date?)
 */

export async function POST(request: Request) {
  try {
    const rl = checkRateLimit(request, {
      routeKey: "account-delete",
      limit: 5,
      windowSec: 60 * 60,
    });
    if (!rl.ok) return rateLimitResponse(rl);

    const { reason } = await readBody(request);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: requestId, error } = await supabase.rpc(
      "request_account_deletion",
      { p_reason: reason ?? null }
    );

    if (error) {
      return NextResponse.json(
        { error: "Could not submit deletion request." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requestId,
      message:
        "Your account is scheduled for deletion in 30 days. You can cancel anytime before then by signing in and choosing 'Keep my account'.",
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: cancelled, error } = await supabase.rpc(
      "cancel_account_deletion"
    );

    if (error) {
      return NextResponse.json(
        { error: "Could not cancel deletion request." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cancelled: Boolean(cancelled),
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data } = await supabase
      .from("account_deletion_requests")
      .select("requested_at, scheduled_for, cancelled_at, completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      pending:
        Boolean(data) &&
        !data?.cancelled_at &&
        !data?.completed_at,
      request: data,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

async function readBody(request: Request): Promise<{ reason?: string }> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

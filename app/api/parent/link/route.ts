import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Parent ↔ Child link by invite code.
 *
 * Replaces the prior implementation, which enumerated all auth
 * users via auth.admin.listUsers() to find a child by email.
 * That approach leaked the existence of every account in the
 * project and did not scale.
 *
 * New flow:
 *   1. The student calls POST /api/parent/link/code to mint a
 *      6-character one-time invite code (valid 7 days).
 *   2. The student shares that code with their parent out of band.
 *   3. The parent calls POST /api/parent/link with the code.
 *   4. The DB function redeem_parent_link_code (SECURITY DEFINER)
 *      validates the code and adds the parent as a viewer in the
 *      child's family pod.
 *
 * No user enumeration is possible: the only identifier exchanged
 * is the short-lived code, and it is single-use.
 */
export async function POST(request: Request) {
  try {
    // Brute-force protection: 5 redemption attempts per minute per IP.
    const rl = checkRateLimit(request, {
      routeKey: "parent-link-redeem",
      limit: 5,
      windowSec: 60,
    });
    if (!rl.ok) return rateLimitResponse(rl);

    const { code } = await request.json();

    if (!code || typeof code !== "string" || code.trim().length !== 6) {
      return NextResponse.json(
        { error: "Enter the 6-character code your child shared with you." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user: parentUser },
    } = await supabase.auth.getUser();

    if (!parentUser) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: podId, error } = await supabase.rpc(
      "redeem_parent_link_code",
      { p_code: code.trim().toUpperCase() }
    );

    if (error) {
      // Surface user-meaningful errors raised by the RPC.
      const friendly = mapRpcError(error.message);
      return NextResponse.json(
        { error: friendly.message },
        { status: friendly.status }
      );
    }

    return NextResponse.json({ success: true, podId });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

function mapRpcError(raw: string): { message: string; status: number } {
  if (raw.includes("invalid_code")) {
    return { message: "That code is not recognized.", status: 404 };
  }
  if (raw.includes("code_already_used")) {
    return {
      message: "That code has already been used. Ask your child for a new one.",
      status: 409,
    };
  }
  if (raw.includes("code_expired")) {
    return {
      message: "That code has expired. Ask your child to generate a new one.",
      status: 410,
    };
  }
  if (raw.includes("only_parents_can_redeem")) {
    return {
      message: "Only parent accounts can link to a child.",
      status: 403,
    };
  }
  return { message: "Could not link account.", status: 500 };
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Student-side endpoint: mint a parent-link invite code.
 *
 * The student calls this to generate a 6-character code, then
 * shares it with their parent. The parent submits the code at
 * POST /api/parent/link to complete the link.
 *
 * Previous codes for the same student are invalidated by the
 * generate_parent_link_code RPC so there is at most one active
 * code per student at a time.
 */
export async function POST(request: Request) {
  try {
    // Cap code minting at 10/hr per IP to bound abuse.
    const rl = checkRateLimit(request, {
      routeKey: "parent-link-code",
      limit: 10,
      windowSec: 60 * 60,
    });
    if (!rl.ok) return rateLimitResponse(rl);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: code, error } = await supabase.rpc(
      "generate_parent_link_code"
    );

    if (error) {
      if (error.message.includes("only_students_can_generate_codes")) {
        return NextResponse.json(
          { error: "Only student accounts can generate parent invite codes." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Could not generate code." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code,
      expiresInDays: 7,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

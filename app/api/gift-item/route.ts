import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Gift an owned star-store item to a classmate.
 *
 * Delegates to the gift_item(p_inventory_id, p_recipient_id) SECURITY
 * DEFINER RPC (migration 016), which atomically validates ownership,
 * giftability, shared pod membership, and recipient non-ownership, then
 * records both transactions and the inventory transfer. Direct client
 * inserts into star_transactions and user_inventory are blocked by RLS.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "gift-item", limit: 20, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { inventory_id, recipient_id } = await request.json();

    if (!inventory_id || !recipient_id) {
      return NextResponse.json({ error: "Missing inventory_id or recipient_id." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { error } = await supabase.rpc("gift_item", {
      p_inventory_id: inventory_id,
      p_recipient_id: recipient_id,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes("cannot_gift_to_self")) {
        return NextResponse.json({ error: "You cannot gift an item to yourself." }, { status: 400 });
      }
      if (msg.includes("item_not_owned")) {
        return NextResponse.json({ error: "Item not found in your inventory." }, { status: 403 });
      }
      if (msg.includes("item_not_giftable")) {
        return NextResponse.json({ error: "This item cannot be gifted." }, { status: 400 });
      }
      if (msg.includes("recipient_not_in_pod")) {
        return NextResponse.json(
          { error: "You can only gift items to students in your classroom." },
          { status: 403 }
        );
      }
      if (msg.includes("recipient_already_owns")) {
        return NextResponse.json({ error: "That student already owns this item." }, { status: 409 });
      }
      console.error("gift_item error:", msg);
      return NextResponse.json({ error: "Gift failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gift item error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

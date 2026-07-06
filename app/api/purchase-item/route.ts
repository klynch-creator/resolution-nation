import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Purchase a star-store item.
 *
 * Delegates to the spend_stars(p_item_id) SECURITY DEFINER RPC, which
 * atomically: validates the item, computes the caller's balance from the
 * transaction ledger, inserts the purchase transaction, and adds the item
 * to the caller's inventory. Direct client inserts into star_transactions
 * and user_inventory are blocked by RLS (migration 016).
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "purchase-item", limit: 20, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { item_id } = await request.json();

    if (!item_id) {
      return NextResponse.json({ error: "Missing item_id." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Verify student role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "student") {
      return NextResponse.json({ error: "Only students can purchase items." }, { status: 403 });
    }

    // Fetch item (also returned to the client on success)
    const { data: item } = await supabase
      .from("star_store_items")
      .select("*")
      .eq("id", item_id)
      .single();

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    // Check if already owned
    const { data: existing } = await supabase
      .from("user_inventory")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_id", item_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "You already own this item." }, { status: 409 });
    }

    // Atomic balance check + purchase + inventory insert.
    const { error: spendError } = await supabase.rpc("spend_stars", {
      p_item_id: item_id,
    });

    if (spendError) {
      if (spendError.message.includes("insufficient_balance")) {
        return NextResponse.json(
          { error: `Not enough stars to buy this item (costs ${item.star_cost}).` },
          { status: 402 }
        );
      }
      if (spendError.message.includes("item_not_found")) {
        return NextResponse.json({ error: "Item not found." }, { status: 404 });
      }
      console.error("spend_stars error:", spendError.message);
      return NextResponse.json({ error: "Purchase failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true, item });
  } catch (err) {
    console.error("Purchase item error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

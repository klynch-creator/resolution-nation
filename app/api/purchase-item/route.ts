import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

    // Fetch item
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

    // Calculate star balance
    const { data: stars } = await supabase
      .from("star_transactions")
      .select("amount, type")
      .eq("user_id", user.id);

    const balance = (stars ?? []).reduce((sum, tx) => {
      if (["earned", "bonus", "gift_received"].includes(tx.type)) return sum + tx.amount;
      if (["gift_sent", "purchase"].includes(tx.type)) return sum - tx.amount;
      return sum;
    }, 0);

    if (balance < item.star_cost) {
      return NextResponse.json(
        { error: `Not enough stars. You need ${item.star_cost} but have ${balance}.` },
        { status: 402 }
      );
    }

    // Deduct stars
    const { error: txError } = await supabase.from("star_transactions").insert({
      user_id: user.id,
      amount: item.star_cost,
      type: "purchase",
      item_id: item.id,
    });

    if (txError) {
      return NextResponse.json({ error: "Failed to record transaction." }, { status: 500 });
    }

    // Add to inventory
    const { error: invError } = await supabase.from("user_inventory").insert({
      user_id: user.id,
      item_id: item.id,
    });

    if (invError) {
      return NextResponse.json({ error: "Failed to add item to inventory." }, { status: 500 });
    }

    return NextResponse.json({ success: true, item });
  } catch (err) {
    console.error("Purchase item error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

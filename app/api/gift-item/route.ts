import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

    if (recipient_id === user.id) {
      return NextResponse.json({ error: "You cannot gift an item to yourself." }, { status: 400 });
    }

    // Verify sender owns the inventory entry
    const { data: invEntry } = await supabase
      .from("user_inventory")
      .select("item_id, star_store_items(*)")
      .eq("id", inventory_id)
      .eq("user_id", user.id)
      .single();

    if (!invEntry) {
      return NextResponse.json({ error: "Item not found in your inventory." }, { status: 403 });
    }

    const item = invEntry.star_store_items as unknown as Record<string, unknown>;
    if (!item || !item.is_giftable) {
      return NextResponse.json({ error: "This item cannot be gifted." }, { status: 400 });
    }

    // Verify both users are in the same pod
    const { data: senderPods } = await supabase
      .from("pod_members")
      .select("pod_id")
      .eq("user_id", user.id);

    const senderPodIds = (senderPods ?? []).map((p) => p.pod_id);

    if (senderPodIds.length === 0) {
      return NextResponse.json({ error: "You are not in any classroom." }, { status: 403 });
    }

    const { data: recipientPod } = await supabase
      .from("pod_members")
      .select("pod_id")
      .eq("user_id", recipient_id)
      .in("pod_id", senderPodIds)
      .maybeSingle();

    if (!recipientPod) {
      return NextResponse.json(
        { error: "You can only gift items to students in your classroom." },
        { status: 403 }
      );
    }

    // Check recipient doesn't already own it
    const { data: recipientOwns } = await supabase
      .from("user_inventory")
      .select("id")
      .eq("user_id", recipient_id)
      .eq("item_id", invEntry.item_id)
      .maybeSingle();

    if (recipientOwns) {
      return NextResponse.json({ error: "That student already owns this item." }, { status: 409 });
    }

    // Insert gift_sent transaction for sender
    const { error: sentError } = await supabase.from("star_transactions").insert({
      user_id: user.id,
      amount: 0,
      type: "gift_sent",
      item_id: invEntry.item_id,
      recipient_id: recipient_id,
    });

    if (sentError) {
      return NextResponse.json({ error: "Failed to record gift transaction." }, { status: 500 });
    }

    // Insert gift_received transaction for recipient
    // Uses recipient_id = auth.uid() to satisfy the INSERT policy
    const { error: receivedError } = await supabase.from("star_transactions").insert({
      user_id: recipient_id,
      amount: 0,
      type: "gift_received",
      item_id: invEntry.item_id,
      recipient_id: user.id,
    });

    if (receivedError) {
      return NextResponse.json({ error: "Failed to record received transaction." }, { status: 500 });
    }

    // Add item to recipient's inventory (uses inventory_gift_insert policy)
    const { error: invError } = await supabase.from("user_inventory").insert({
      user_id: recipient_id,
      item_id: invEntry.item_id,
      gifted_from_user_id: user.id,
    });

    if (invError) {
      return NextResponse.json({ error: "Failed to add item to recipient's inventory." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gift item error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

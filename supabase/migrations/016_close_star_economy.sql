-- Close the star-economy client-write surface (June 2026).
--
-- Migration 002 created award_stars/spend_stars RPCs intending to remove
-- direct client inserts into star_transactions — but the permissive policy
-- star_transactions_insert (from 006) was still live, so any student could
-- still mint stars from the browser console. Likewise inventory_insert_own
-- let any user grant themselves any store item for free.
--
-- This migration:
--   1. Adds gift_item() RPC — atomic, validated gifting (the last flow that
--      relied on client-side inserts).
--   2. Drops ALL client INSERT policies on star_transactions and
--      user_inventory. All writes now flow through SECURITY DEFINER RPCs:
--      award_stars (earn/bonus), spend_stars (purchase), gift_item (gifts).

-- ── 1. gift_item RPC ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gift_item(p_inventory_id UUID, p_recipient_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_item_id UUID;
  v_giftable BOOLEAN;
  v_new_inventory_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_recipient_id = v_caller THEN
    RAISE EXCEPTION 'cannot_gift_to_self';
  END IF;

  -- Caller must own the inventory entry.
  SELECT ui.item_id, ssi.is_giftable
    INTO v_item_id, v_giftable
    FROM user_inventory ui
    JOIN star_store_items ssi ON ssi.id = ui.item_id
   WHERE ui.id = p_inventory_id
     AND ui.user_id = v_caller;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'item_not_owned';
  END IF;

  IF NOT v_giftable THEN
    RAISE EXCEPTION 'item_not_giftable';
  END IF;

  -- Sender and recipient must share a pod.
  IF NOT EXISTS (
    SELECT 1
      FROM pod_members pm1
      JOIN pod_members pm2 ON pm2.pod_id = pm1.pod_id
     WHERE pm1.user_id = v_caller
       AND pm2.user_id = p_recipient_id
  ) THEN
    RAISE EXCEPTION 'recipient_not_in_pod';
  END IF;

  -- Recipient must not already own the item.
  IF EXISTS (
    SELECT 1 FROM user_inventory
     WHERE user_id = p_recipient_id AND item_id = v_item_id
  ) THEN
    RAISE EXCEPTION 'recipient_already_owns';
  END IF;

  INSERT INTO star_transactions (user_id, amount, type, item_id, recipient_id)
  VALUES (v_caller, 0, 'gift_sent', v_item_id, p_recipient_id);

  INSERT INTO star_transactions (user_id, amount, type, item_id, recipient_id)
  VALUES (p_recipient_id, 0, 'gift_received', v_item_id, v_caller);

  INSERT INTO user_inventory (user_id, item_id, gifted_from_user_id)
  VALUES (p_recipient_id, v_item_id, v_caller)
  RETURNING id INTO v_new_inventory_id;

  RETURN v_new_inventory_id;
END;
$$;

REVOKE ALL ON FUNCTION gift_item(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gift_item(UUID, UUID) TO authenticated;

-- ── 2. Drop client INSERT policies ───────────────────────────────────────────

DROP POLICY IF EXISTS "star_transactions_insert" ON star_transactions;
DROP POLICY IF EXISTS "inventory_insert_own" ON user_inventory;
DROP POLICY IF EXISTS "inventory_gift_insert" ON user_inventory;

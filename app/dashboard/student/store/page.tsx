"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, StarStoreItem, Rarity } from "@/types";

const RARITY_COLOR: Record<Rarity, string> = {
  common: "#6B7280",
  uncommon: "#059669",
  rare: "#2563EB",
  epic: "#7C3AED",
  legendary: "#D97706",
};

const RARITY_BG: Record<Rarity, string> = {
  common: "#F3F4F6",
  uncommon: "#ECFDF5",
  rare: "#EFF6FF",
  epic: "#F5F3FF",
  legendary: "#FFFBEB",
};

const CATEGORIES = ["all", "animals", "history", "science", "world", "goods", "skins"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];
type AffordFilter = "all" | "available" | "owned";

function rarityLabel(r: Rarity) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function NavBar({ active }: { active: string }) {
  const links = [
    { href: "/dashboard/student", label: "Dashboard" },
    { href: "/dashboard/student/goals", label: "My Goals" },
    { href: "/dashboard/student/store", label: "⭐ Store" },
    { href: "/dashboard/student/collection", label: "🃏 Collection" },
  ];
  return (
    <nav style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 1.5rem" }}>
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          height: "48px",
          alignItems: "stretch",
          gap: "0.25rem",
        }}
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              color: active === l.label ? "#028090" : "#64748B",
              fontWeight: active === l.label ? 600 : 400,
              fontSize: "0.9375rem",
              padding: "0 1rem",
              height: "100%",
              display: "flex",
              alignItems: "center",
              borderBottom: active === l.label ? "2px solid #028090" : "2px solid transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

interface FlipCardProps {
  item: StarStoreItem;
  owned: boolean;
  canAfford: boolean;
  flipped: boolean;
  starBalance: number;
  onFlip: () => void;
  onPurchaseClick: () => void;
}

function FlipCard({ item, owned, canAfford, flipped, starBalance, onFlip, onPurchaseClick }: FlipCardProps) {
  const rarityColor = RARITY_COLOR[item.rarity];
  const rarityBg = RARITY_BG[item.rarity];
  const dimmed = !owned && !canAfford;

  return (
    <div
      style={{ perspective: "1000px", height: "280px", cursor: "pointer" }}
      onClick={onFlip}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.4s ease",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            opacity: dimmed ? 0.55 : 1,
            border: owned ? "2px solid #00A896" : "1px solid transparent",
            transition: "box-shadow 0.15s",
          }}
        >
          <div style={{ fontSize: "3rem", lineHeight: 1 }}>{item.emoji}</div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.9375rem",
              color: "#0C2340",
              textAlign: "center",
              lineHeight: 1.3,
            }}
          >
            {item.name}
          </div>
          <span
            style={{
              background: rarityBg,
              color: rarityColor,
              borderRadius: "100px",
              padding: "0.125rem 0.625rem",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {rarityLabel(item.rarity)}
          </span>
          {owned ? (
            <span
              style={{
                background: "#ECFDF5",
                color: "#059669",
                borderRadius: "100px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
                fontWeight: 700,
              }}
            >
              Owned ✓
            </span>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: canAfford ? "#D97706" : "#9CA3AF",
              }}
            >
              <span>⭐</span>
              <span>{item.star_cost} stars</span>
            </div>
          )}
          <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.25rem" }}>
            Tap to learn more
          </div>
        </div>

        {/* Back */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem" }}>{item.emoji}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#0C2340" }}>
                {item.name}
              </div>
              <span
                style={{
                  background: rarityBg,
                  color: rarityColor,
                  borderRadius: "100px",
                  padding: "0.1rem 0.5rem",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                }}
              >
                {rarityLabel(item.rarity)}
              </span>
            </div>
          </div>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#374151",
              lineHeight: 1.6,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {item.bio}
          </p>
          <div onClick={(e) => e.stopPropagation()}>
            {owned ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "0.5rem",
                  background: "#ECFDF5",
                  borderRadius: "8px",
                  color: "#059669",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                }}
              >
                Already Owned ✓
              </div>
            ) : canAfford ? (
              <button
                onClick={onPurchaseClick}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #028090 0%, #00A896 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.625rem",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.375rem",
                }}
              >
                <span>⭐</span>
                <span>Purchase for {item.star_cost} stars</span>
              </button>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "0.5rem",
                  background: "#F9FAFB",
                  borderRadius: "8px",
                  color: "#9CA3AF",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                }}
              >
                Need {item.star_cost - starBalance} more ⭐ to unlock
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StarStorePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<StarStoreItem[]>([]);
  const [ownedItemIds, setOwnedItemIds] = useState<Set<string>>(new Set());
  const [starBalance, setStarBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [affordFilter, setAffordFilter] = useState<AffordFilter>("all");
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  const [confirmItem, setConfirmItem] = useState<StarStoreItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [successItem, setSuccessItem] = useState<StarStoreItem | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profileData || profileData.role !== "student") {
        router.push("/auth/login");
        return;
      }
      setProfile(profileData);

      const { data: stars } = await supabase
        .from("star_transactions")
        .select("amount, type")
        .eq("user_id", user.id);

      if (stars) {
        const balance = stars.reduce((sum, tx) => {
          if (["earned", "bonus", "gift_received"].includes(tx.type)) return sum + tx.amount;
          if (["gift_sent", "purchase"].includes(tx.type)) return sum - tx.amount;
          return sum;
        }, 0);
        setStarBalance(balance);
      }

      const { data: storeItems } = await supabase
        .from("star_store_items")
        .select("*")
        .order("star_cost", { ascending: true });
      setItems((storeItems as StarStoreItem[]) ?? []);

      const { data: inventory } = await supabase
        .from("user_inventory")
        .select("item_id")
        .eq("user_id", user.id);
      if (inventory) {
        setOwnedItemIds(new Set(inventory.map((i) => i.item_id as string)));
      }

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFlip = useCallback((itemId: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  async function handlePurchase(item: StarStoreItem) {
    setPurchasing(true);
    setPurchaseError(null);

    const res = await fetch("/api/purchase-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: item.id }),
    });

    const data = await res.json();
    setPurchasing(false);

    if (!res.ok) {
      setPurchaseError(data.error ?? "Purchase failed. Please try again.");
      return;
    }

    setOwnedItemIds((prev) => new Set([...prev, item.id]));
    setStarBalance((prev) => prev - item.star_cost);
    setFlippedCards((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setConfirmItem(null);
    setSuccessItem(item);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const filteredItems = items.filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (affordFilter === "owned") return ownedItemIds.has(item.id);
    if (affordFilter === "available")
      return !ownedItemIds.has(item.id) && starBalance >= item.star_cost;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F9FC" }}>
        <div style={{ color: "#028090", fontSize: "1.25rem" }}>Loading store…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      {/* Header */}
      <header
        style={{
          background: "#0C2340",
          padding: "0 1.5rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "1.5rem" }}>🌟</span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#F7F9FC",
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            Resolution Nation
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div
            style={{
              background: "#D97706",
              color: "white",
              borderRadius: "100px",
              padding: "0.25rem 0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontWeight: 700,
              fontSize: "0.9375rem",
            }}
          >
            <span>⭐</span>
            <span>{starBalance}</span>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              color: "#94A3B8",
              fontSize: "0.875rem",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <NavBar active="⭐ Store" />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "1.5rem",
          }}
        >
          ⭐ Star Store
        </h1>

        {/* Filters */}
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginBottom: "0.75rem",
            }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  background: categoryFilter === cat ? "#028090" : "white",
                  color: categoryFilter === cat ? "white" : "#374151",
                  border: `1.5px solid ${categoryFilter === cat ? "#028090" : "#E2E8F0"}`,
                  borderRadius: "100px",
                  padding: "0.375rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: categoryFilter === cat ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["all", "available", "owned"] as AffordFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setAffordFilter(f)}
                style={{
                  background: affordFilter === f ? "#0C2340" : "white",
                  color: affordFilter === f ? "white" : "#374151",
                  border: `1.5px solid ${affordFilter === f ? "#0C2340" : "#E2E8F0"}`,
                  borderRadius: "100px",
                  padding: "0.25rem 0.875rem",
                  fontSize: "0.8125rem",
                  fontWeight: affordFilter === f ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {f === "all" ? "All" : f === "available" ? "Can Afford" : "Owned"}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div
            className="card"
            style={{ textAlign: "center", padding: "3rem", border: "2px dashed #E2E8F0", background: "transparent" }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔍</div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.125rem", color: "#0C2340", fontWeight: 700 }}>
              No items match your filters
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <FlipCard
                key={item.id}
                item={item}
                owned={ownedItemIds.has(item.id)}
                canAfford={starBalance >= item.star_cost}
                flipped={flippedCards.has(item.id)}
                starBalance={starBalance}
                onFlip={() => toggleFlip(item.id)}
                onPurchaseClick={() => {
                  setPurchaseError(null);
                  setConfirmItem(item);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={() => { if (!purchasing) setConfirmItem(null); }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "2rem",
              maxWidth: "360px",
              width: "100%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>{confirmItem.emoji}</div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              {confirmItem.name}
            </h2>
            <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.25rem" }}>
              This costs{" "}
              <strong style={{ color: "#D97706" }}>⭐ {confirmItem.star_cost} stars</strong> and you
              have <strong style={{ color: "#D97706" }}>⭐ {starBalance}</strong>. Are you sure?
            </p>
            {purchaseError && (
              <div
                style={{
                  background: "#FEF2F2",
                  color: "#DC2626",
                  borderRadius: "8px",
                  padding: "0.625rem",
                  fontSize: "0.875rem",
                  marginBottom: "1rem",
                }}
              >
                {purchaseError}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setConfirmItem(null)}
                disabled={purchasing}
                style={{
                  flex: 1,
                  background: "white",
                  color: "#374151",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "8px",
                  padding: "0.625rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handlePurchase(confirmItem)}
                disabled={purchasing}
                style={{
                  flex: 1,
                  background: "linear-gradient(135deg, #028090 0%, #00A896 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.625rem",
                  fontWeight: 700,
                  cursor: purchasing ? "not-allowed" : "pointer",
                  opacity: purchasing ? 0.7 : 1,
                }}
              >
                {purchasing ? "Buying…" : "Confirm!"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={() => setSuccessItem(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "2.5rem",
              maxWidth: "340px",
              width: "100%",
              textAlign: "center",
              animation: "bounceIn 0.4s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes bounceIn {
                0% { transform: scale(0.7); opacity: 0; }
                60% { transform: scale(1.1); }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
            <div style={{ fontSize: "5rem", marginBottom: "1rem", lineHeight: 1 }}>
              {successItem.emoji}
            </div>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              You got {successItem.name}!
            </h2>
            <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.5rem" }}>
              Added to your collection.
            </p>
            <button
              onClick={() => setSuccessItem(null)}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              Awesome! 🌟
            </button>
            <div style={{ marginTop: "0.75rem" }}>
              <Link
                href="/dashboard/student/collection"
                style={{ color: "#028090", fontSize: "0.875rem", fontWeight: 600 }}
              >
                View my collection →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

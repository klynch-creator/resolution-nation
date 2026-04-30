"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, StarStoreItem, UserInventory, Rarity } from "@/types";

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

const RARITY_ORDER: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];

type InventoryWithItem = UserInventory & { star_store_items: StarStoreItem };

interface Podmate {
  user_id: string;
  full_name: string;
}

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

export default function CollectionPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [inventory, setInventory] = useState<InventoryWithItem[]>([]);
  const [podmates, setPodmates] = useState<Podmate[]>([]);
  const [loading, setLoading] = useState(true);

  // Gift flow
  const [giftingEntry, setGiftingEntry] = useState<InventoryWithItem | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [giftConfirmStep, setGiftConfirmStep] = useState<"select" | "confirm">("select");
  const [gifting, setGifting] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [giftSuccess, setGiftSuccess] = useState(false);

  // Hover for bio
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

      // Fetch inventory with item details
      const { data: inv } = await supabase
        .from("user_inventory")
        .select("*, star_store_items(*)")
        .eq("user_id", user.id)
        .order("acquired_at", { ascending: false });

      setInventory((inv as InventoryWithItem[]) ?? []);

      // Fetch podmates for gift search
      const { data: membership } = await supabase
        .from("pod_members")
        .select("pod_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        const { data: members } = await supabase
          .from("pod_members")
          .select("user_id, profiles(full_name, role)")
          .eq("pod_id", membership.pod_id)
          .neq("user_id", user.id);

        if (members) {
          const students = members
            .filter(
              (m) =>
                m.profiles &&
                (m.profiles as unknown as { role: string }).role === "student"
            )
            .map((m) => ({
              user_id: m.user_id,
              full_name: (m.profiles as unknown as { full_name: string }).full_name,
            }));
          setPodmates(students);
        }
      }

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openGiftModal(entry: InventoryWithItem) {
    setGiftingEntry(entry);
    setSelectedRecipient("");
    setGiftConfirmStep("select");
    setGiftError(null);
    setGiftSuccess(false);
  }

  function closeGiftModal() {
    setGiftingEntry(null);
    setGiftError(null);
    setGiftSuccess(false);
  }

  async function handleGift() {
    if (!giftingEntry || !selectedRecipient) return;
    setGifting(true);
    setGiftError(null);

    const res = await fetch("/api/gift-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventory_id: giftingEntry.id,
        recipient_id: selectedRecipient,
      }),
    });

    const data = await res.json();
    setGifting(false);

    if (!res.ok) {
      setGiftError(data.error ?? "Gift failed. Please try again.");
      return;
    }

    setGiftSuccess(true);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  // Group by rarity
  const grouped: Record<Rarity, InventoryWithItem[]> = {
    legendary: [],
    epic: [],
    rare: [],
    uncommon: [],
    common: [],
  };

  inventory.forEach((entry) => {
    if (entry.star_store_items) {
      const r = entry.star_store_items.rarity;
      grouped[r].push(entry);
    }
  });

  const recipientName = podmates.find((p) => p.user_id === selectedRecipient)?.full_name;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F9FC" }}>
        <div style={{ color: "#028090", fontSize: "1.25rem" }}>Loading collection…</div>
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
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>{profile?.full_name}</span>
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

      <NavBar active="🃏 Collection" />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#0C2340",
            }}
          >
            My Collection{" "}
            <span style={{ fontSize: "1.25rem", color: "#64748B", fontWeight: 400 }}>
              ({inventory.length} {inventory.length === 1 ? "card" : "cards"})
            </span>
          </h1>
          <Link
            href="/dashboard/student/store"
            className="btn-primary"
            style={{ textDecoration: "none", fontSize: "0.875rem" }}
          >
            ⭐ Visit Store
          </Link>
        </div>

        {inventory.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "3rem",
              border: "2px dashed #E2E8F0",
              background: "transparent",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🃏</div>
            <p
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              No cards yet!
            </p>
            <p style={{ color: "#64748B", marginBottom: "1.25rem" }}>
              Head to the Star Store to get started.
            </p>
            <Link href="/dashboard/student/store" className="btn-primary" style={{ textDecoration: "none" }}>
              ⭐ Go to Store
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {RARITY_ORDER.filter((r) => grouped[r].length > 0).map((rarity) => (
              <section key={rarity}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.625rem",
                    marginBottom: "0.875rem",
                  }}
                >
                  <span
                    style={{
                      background: RARITY_BG[rarity],
                      color: RARITY_COLOR[rarity],
                      borderRadius: "100px",
                      padding: "0.25rem 0.875rem",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                    }}
                  >
                    {rarityLabel(rarity)}
                  </span>
                  <span style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                    {grouped[rarity].length} {grouped[rarity].length === 1 ? "card" : "cards"}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {grouped[rarity].map((entry) => {
                    const item = entry.star_store_items;
                    const isHovered = hoveredId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        style={{ position: "relative" }}
                        onMouseEnter={() => setHoveredId(entry.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div
                          className="card"
                          style={{
                            padding: "1.25rem",
                            textAlign: "center",
                            border: `2px solid ${RARITY_COLOR[rarity]}20`,
                            transition: "box-shadow 0.15s, transform 0.15s",
                            transform: isHovered ? "scale(1.02)" : "scale(1)",
                            boxShadow: isHovered
                              ? "0 4px 16px rgba(0,0,0,0.12)"
                              : "0 1px 4px rgba(0,0,0,0.06)",
                          }}
                        >
                          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
                            {item.emoji}
                          </div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "0.875rem",
                              color: "#0C2340",
                              marginBottom: "0.375rem",
                              lineHeight: 1.3,
                            }}
                          >
                            {item.name}
                          </div>
                          <span
                            style={{
                              background: RARITY_BG[rarity],
                              color: RARITY_COLOR[rarity],
                              borderRadius: "100px",
                              padding: "0.1rem 0.5rem",
                              fontSize: "0.6875rem",
                              fontWeight: 700,
                              display: "inline-block",
                              marginBottom: "0.625rem",
                            }}
                          >
                            {rarityLabel(rarity)}
                          </span>
                          {item.is_giftable && !entry.gifted_from_user_id && (
                            <button
                              onClick={() => openGiftModal(entry)}
                              style={{
                                display: "block",
                                width: "100%",
                                background: "white",
                                color: "#7C3AED",
                                border: "1.5px solid #7C3AED",
                                borderRadius: "8px",
                                padding: "0.375rem",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              🎁 Gift
                            </button>
                          )}
                          {entry.gifted_from_user_id && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#9CA3AF",
                                marginTop: "0.25rem",
                              }}
                            >
                              🎁 Received as gift
                            </div>
                          )}
                        </div>

                        {/* Bio tooltip on hover */}
                        {isHovered && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "calc(100% + 8px)",
                              left: "50%",
                              transform: "translateX(-50%)",
                              background: "#0C2340",
                              color: "white",
                              borderRadius: "8px",
                              padding: "0.75rem",
                              fontSize: "0.8125rem",
                              lineHeight: 1.5,
                              width: "240px",
                              zIndex: 10,
                              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                              pointerEvents: "none",
                            }}
                          >
                            {item.bio}
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                width: 0,
                                height: 0,
                                borderLeft: "6px solid transparent",
                                borderRight: "6px solid transparent",
                                borderTop: "6px solid #0C2340",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Gift Modal */}
      {giftingEntry && (
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
          onClick={() => { if (!gifting) closeGiftModal(); }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "2rem",
              maxWidth: "380px",
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {giftSuccess ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>
                  🎁
                </div>
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "0.5rem",
                  }}
                >
                  Gift Sent!
                </h2>
                <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.25rem" }}>
                  {giftingEntry.star_store_items.name} was gifted to {recipientName}.
                </p>
                <button
                  onClick={closeGiftModal}
                  className="btn-primary"
                  style={{ width: "100%" }}
                >
                  Done
                </button>
              </div>
            ) : giftConfirmStep === "select" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
                  <span style={{ fontSize: "2rem" }}>{giftingEntry.star_store_items.emoji}</span>
                  <div>
                    <h2
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: "#0C2340",
                      }}
                    >
                      Gift {giftingEntry.star_store_items.name}
                    </h2>
                    <p style={{ color: "#64748B", fontSize: "0.875rem" }}>
                      Choose a classmate to receive this card
                    </p>
                  </div>
                </div>

                {podmates.length === 0 ? (
                  <div
                    style={{
                      background: "#F9FAFB",
                      borderRadius: "8px",
                      padding: "1.25rem",
                      textAlign: "center",
                      color: "#9CA3AF",
                      fontSize: "0.9375rem",
                      marginBottom: "1rem",
                    }}
                  >
                    No classmates found. Make sure you&apos;re in a classroom!
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      marginBottom: "1.25rem",
                      maxHeight: "240px",
                      overflowY: "auto",
                    }}
                  >
                    {podmates.map((pm) => (
                      <button
                        key={pm.user_id}
                        onClick={() => setSelectedRecipient(pm.user_id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.75rem",
                          border: `2px solid ${selectedRecipient === pm.user_id ? "#028090" : "#E2E8F0"}`,
                          borderRadius: "10px",
                          background: selectedRecipient === pm.user_id ? "#F0FAFA" : "white",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            background: "#028090",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontWeight: 700,
                            fontSize: "1rem",
                            flexShrink: 0,
                          }}
                        >
                          {pm.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: "#0C2340", fontSize: "0.9375rem" }}>
                          {pm.full_name}
                        </span>
                        {selectedRecipient === pm.user_id && (
                          <span style={{ marginLeft: "auto", color: "#028090" }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={closeGiftModal}
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
                    onClick={() => { if (selectedRecipient) setGiftConfirmStep("confirm"); }}
                    disabled={!selectedRecipient}
                    className="btn-primary"
                    style={{ flex: 1, opacity: selectedRecipient ? 1 : 0.4 }}
                  >
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>
                    {giftingEntry.star_store_items.emoji}
                  </div>
                  <h2
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      color: "#0C2340",
                      marginBottom: "0.375rem",
                    }}
                  >
                    Confirm Gift
                  </h2>
                  <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
                    Send <strong>{giftingEntry.star_store_items.name}</strong> to{" "}
                    <strong style={{ color: "#028090" }}>{recipientName}</strong>?
                  </p>
                </div>

                {giftError && (
                  <div
                    style={{
                      background: "#FEF2F2",
                      color: "#DC2626",
                      borderRadius: "8px",
                      padding: "0.625rem",
                      fontSize: "0.875rem",
                      marginBottom: "1rem",
                      textAlign: "center",
                    }}
                  >
                    {giftError}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={() => setGiftConfirmStep("select")}
                    disabled={gifting}
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
                    ← Back
                  </button>
                  <button
                    onClick={handleGift}
                    disabled={gifting}
                    style={{
                      flex: 1,
                      background: "linear-gradient(135deg, #7C3AED 0%, #9F67FA 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.625rem",
                      fontWeight: 700,
                      cursor: gifting ? "not-allowed" : "pointer",
                      opacity: gifting ? 0.7 : 1,
                    }}
                  >
                    {gifting ? "Sending…" : "🎁 Send Gift!"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

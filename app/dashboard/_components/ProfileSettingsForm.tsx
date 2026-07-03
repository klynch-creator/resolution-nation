"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Shared profile/contact settings form for teacher and parent accounts.
 * Edits the caller's own profiles row (profiles_update_own RLS).
 */
export default function ProfileSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [contactMethod, setContactMethod] = useState<"app" | "email" | "phone">("app");
  const [accountEmail, setAccountEmail] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setAccountEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, contact_email, phone, preferred_language, preferred_contact")
        .eq("id", user.id)
        .single();

      if (profile) {
        setFullName(profile.full_name ?? "");
        setContactEmail(profile.contact_email ?? user.email ?? "");
        setPhone(profile.phone ?? "");
        setLanguage((profile.preferred_language as "en" | "es") ?? "en");
        setContactMethod((profile.preferred_contact as "app" | "email" | "phone") ?? "app");
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        contact_email: contactEmail.trim() || null,
        phone: phone.trim() || null,
        preferred_language: language,
        preferred_contact: contactMethod,
      })
      .eq("id", user.id);

    if (updateError) {
      setError("Could not save your settings. Please try again.");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center" style={{ padding: "3rem" }}>
        <div className="spinner" aria-hidden="true" />
      </div>
    );
  }

  const label: React.CSSProperties = {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "0.375rem",
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "0.625rem 0.875rem",
    borderRadius: "10px",
    border: "1px solid #CBD5E1",
    fontSize: "0.9375rem",
  };

  return (
    <form onSubmit={handleSave} className="card" style={{ padding: "1.75rem", maxWidth: "560px" }}>
      {error && (
        <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="settings-name" style={label}>
          Full name
        </label>
        <input
          id="settings-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={80}
          style={input}
        />
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="settings-email" style={label}>
          Contact email
        </label>
        <input
          id="settings-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          maxLength={120}
          style={input}
        />
        <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.25rem" }}>
          Sign-in email: {accountEmail}. The contact email is what&apos;s shared for
          school communication — it can be different.
        </p>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="settings-phone" style={label}>
          Phone number (optional)
        </label>
        <input
          id="settings-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={25}
          placeholder="(555) 555-5555"
          style={input}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginBottom: "1.5rem" }}>
        <div>
          <label htmlFor="settings-language" style={label}>
            Preferred language
          </label>
          <select
            id="settings-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "es")}
            style={{ ...input, background: "white" }}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
        <div>
          <label htmlFor="settings-contact" style={label}>
            Preferred contact method
          </label>
          <select
            id="settings-contact"
            value={contactMethod}
            onChange={(e) => setContactMethod(e.target.value as "app" | "email" | "phone")}
            style={{ ...input, background: "white" }}
          >
            <option value="app">In-app messages</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
          style={{ padding: "0.625rem 1.5rem", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && (
          <span style={{ color: "#047857", fontWeight: 600, fontSize: "0.875rem" }}>
            ✓ Saved
          </span>
        )}
      </div>
    </form>
  );
}

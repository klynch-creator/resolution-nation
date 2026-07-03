"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import ProfileSettingsForm from "@/app/dashboard/_components/ProfileSettingsForm";

export default function TeacherSettingsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <Link
          href="/dashboard/teacher"
          style={{ color: "#028090", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
        >
          ← Dashboard
        </Link>
        <div className="mb-6" style={{ marginTop: "0.5rem" }}>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.25rem",
            }}
          >
            Settings ⚙️
          </h1>
          <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
            Your name and contact info, shared with linked parents.
          </p>
        </div>
        <ProfileSettingsForm />
      </main>
    </div>
  );
}

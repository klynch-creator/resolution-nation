"use client";

export const dynamic = "force-dynamic";

import ProfileSettingsForm from "@/app/dashboard/_components/ProfileSettingsForm";

export default function ParentSettingsPage() {
  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
      <div className="mb-6">
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
          Your name and contact info, shared with your child&apos;s teacher.
        </p>
      </div>
      <ProfileSettingsForm />
    </main>
  );
}

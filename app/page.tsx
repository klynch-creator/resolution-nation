import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0C2340" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "1.75rem" }}>🌟</span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#F7F9FC",
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Resolution Nation
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            style={{
              color: "#E2E8F0",
              fontWeight: 500,
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              transition: "color 0.15s",
            }}
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            style={{
              background: "#028090",
              color: "white",
              fontWeight: 600,
              padding: "0.5625rem 1.25rem",
              borderRadius: "8px",
              transition: "background 0.15s",
            }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div
          style={{
            background: "rgba(2,128,144,0.15)",
            border: "1px solid rgba(2,195,154,0.3)",
            borderRadius: "100px",
            padding: "0.375rem 1rem",
            marginBottom: "2rem",
            color: "#02C39A",
            fontSize: "0.875rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          For Students, Teachers &amp; Families
        </div>

        <h1
          style={{
            fontFamily: "Georgia, serif",
            color: "#F7F9FC",
            fontSize: "clamp(2.5rem, 6vw, 4rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: "700px",
            marginBottom: "1.5rem",
          }}
        >
          Set Goals. Build Habits.{" "}
          <span style={{ color: "#02C39A" }}>Earn Stars.</span>
        </h1>

        <p
          style={{
            color: "#94A3B8",
            fontSize: "1.25rem",
            maxWidth: "560px",
            lineHeight: 1.7,
            marginBottom: "2.5rem",
          }}
        >
          Resolution Nation helps students set meaningful goals, track their
          progress through fun learning workouts, and celebrate wins with their
          classroom and family.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/auth/signup"
            style={{
              background: "#02C39A",
              color: "#0C2340",
              fontWeight: 700,
              padding: "0.875rem 2rem",
              borderRadius: "8px",
              fontSize: "1.0625rem",
              transition: "background 0.15s",
              minWidth: "180px",
              textAlign: "center",
            }}
          >
            Get Started Free
          </Link>
          <Link
            href="/auth/login"
            style={{
              color: "#E2E8F0",
              fontWeight: 500,
              padding: "0.875rem 2rem",
              border: "1.5px solid rgba(226,232,240,0.3)",
              borderRadius: "8px",
              fontSize: "1.0625rem",
              transition: "border-color 0.15s",
              minWidth: "180px",
              textAlign: "center",
            }}
          >
            Sign In to Your Account
          </Link>
        </div>

        {/* Feature cards */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 w-full"
          style={{ maxWidth: "900px" }}
        >
          {[
            {
              emoji: "🎯",
              title: "Personalized Goals",
              desc: "AI-powered learning goals aligned to your grade and standards.",
              color: "#028090",
            },
            {
              emoji: "🏋️",
              title: "Learning Workouts",
              desc: "Step-by-step lessons, practice sets, and quizzes that build mastery.",
              color: "#7C3AED",
            },
            {
              emoji: "⭐",
              title: "Star Rewards",
              desc: "Earn stars for completing goals and redeem them in the Star Store.",
              color: "#D97706",
            },
          ].map((f) => (
            <div
              key={f.title}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "1.75rem",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  marginBottom: "1rem",
                }}
              >
                {f.emoji}
              </div>
              <h3
                style={{
                  fontFamily: "Georgia, serif",
                  color: "#F7F9FC",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  marginBottom: "0.5rem",
                }}
              >
                {f.title}
              </h3>
              <p style={{ color: "#94A3B8", fontSize: "0.9375rem", lineHeight: 1.6 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "1.5rem 2rem",
          textAlign: "center",
          color: "#64748B",
          fontSize: "0.875rem",
        }}
      >
        © {new Date().getFullYear()} Resolution Nation. Built for students who believe in themselves.
      </footer>
    </div>
  );
}

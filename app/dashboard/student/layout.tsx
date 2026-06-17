import { Nunito } from "next/font/google";

// Friendlier, rounded font for the student-facing experience only.
// Exposed as a CSS variable so existing inline `fontFamily` styles can
// reference it (e.g. fontFamily: "var(--font-nunito), sans-serif") without
// us having to restructure every page to use the next/font className.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <div className={nunito.variable}>{children}</div>;
}

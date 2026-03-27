import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resolution Nation",
  description: "Set goals. Build habits. Earn stars. Resolution Nation helps students, teachers, and families grow together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

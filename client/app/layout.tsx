import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const appFont = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clair",
  description: "Patient handoff system for hospital teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${appFont.variable}`}>
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg)", color: "var(--text-1)" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

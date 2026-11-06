import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeadLeak — Local SEO & Lead Audit for Contractors",
  description:
    "Check a contractor website for the problems that cost calls and quote requests: click-to-call, quote forms, local SEO, trust signals and speed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans text-sm">
        <header className="bg-topbar text-topbar-text">
          <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-3 w-3 rounded-sm bg-brand" aria-hidden />
              LeadLeak
            </Link>
            <span className="text-xs text-topbar-muted">Site audit for contractors</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import "./studio-redesign.css";
import "./studio-v3.css";

export const metadata: Metadata = {
  title: "GENE 2.0 Studio — AI App & Game Builder",
  description: "GENE 2.0 is an autonomous AI workspace to research, plan, build, preview, validate and repair real web apps and playable browser games."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="light" suppressHydrationWarning><body>{children}</body></html>;
}
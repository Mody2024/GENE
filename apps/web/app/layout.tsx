import type { Metadata } from "next";
import "./globals.css";
import "./studio-redesign.css";
import "./studio-v3.css";

export const metadata: Metadata = {
  title: "GENE Studio — AI App & Game Builder",
  description: "A clean, focused AI workspace to plan, build, preview, test and refine real web apps and playable browser games.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="light" suppressHydrationWarning><body>{children}</body></html>;
}
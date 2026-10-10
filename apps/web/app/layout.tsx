import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GENE — AI App & Game Builder",
  description: "Plan, build, preview and edit interactive web apps and browser games through AI chat with GENE.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
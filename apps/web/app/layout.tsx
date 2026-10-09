import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GENE — AI Game Studio",
  description: "Plan, build, edit and test real browser games with GENE.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
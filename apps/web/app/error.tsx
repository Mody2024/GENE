"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep diagnostics in the browser console without exposing secrets or stack traces in the UI.
    console.error("GENE application boundary caught an unexpected error", {
      message: error?.message || "Unknown application error",
      digest: error?.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#111315", color: "#f0f2f3", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ width: "min(560px, calc(100% - 40px))", padding: 28, border: "1px solid #353b40", borderRadius: 18, background: "#191c1f" }}>
          <p style={{ color: "#9ca6ad", letterSpacing: ".12em", fontSize: 12 }}>GENE · RECOVERY</p>
          <h1 style={{ fontSize: 25, marginBottom: 8 }}>This workspace hit an unexpected error.</h1>
          <p style={{ color: "#b6bec4", lineHeight: 1.6 }}>Your saved project data is not intentionally cleared. Retry the workspace; if the problem repeats, reload the page and check the deployment logs.</p>
          {error?.digest && <p style={{ color: "#879199", fontSize: 12 }}>Reference: {error.digest}</p>}
          <button onClick={() => reset()} style={{ cursor: "pointer", border: 0, borderRadius: 10, padding: "11px 16px", background: "#dce7df", color: "#152019", fontWeight: 650 }}>Retry workspace</button>
        </main>
      </body>
    </html>
  );
}

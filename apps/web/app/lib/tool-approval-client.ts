import { describeToolCall, stripToolApproval } from "./tool-permissions.mjs";

export type IssuedApproval = Record<string, unknown>;

/** The exact text the user sees before any gated tool runs: what, why, and which inputs are covered. */
export function approvalPrompt(tool: string, input: unknown): string {
  const call = describeToolCall(tool, input);
  return "Allow this tool call?\n\nTool: " + call.label + "\nPurpose / exact request: " + call.detail +
    (call.extras.length ? "\nOptions: " + call.extras.join(", ") : "") +
    "\n\nThis approval is valid for these exact inputs, for this one call, for five minutes. GENE will not run the tool if you choose Cancel.";
}

/** Ask the server to sign an approval for exactly these inputs. Call only AFTER the user has said yes. */
export async function requestToolApproval(tool: string, input: unknown, signal?: AbortSignal): Promise<IssuedApproval> {
  const response = await fetch("/api/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, input: stripToolApproval(input) }),
    signal
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data.approval) throw new Error(String(data?.error?.message || "GENE could not record your approval (HTTP " + response.status + ")."));
  return data.approval as IssuedApproval;
}

/** Confirm with the user, then fetch a signed approval. Throws AbortError when the user declines. */
export async function confirmAndApprove(tool: string, input: unknown, signal?: AbortSignal): Promise<IssuedApproval> {
  if (typeof window !== "undefined" && !window.confirm(approvalPrompt(tool, input))) throw new DOMException("Tool call canceled by the user.", "AbortError");
  return requestToolApproval(tool, input, signal);
}

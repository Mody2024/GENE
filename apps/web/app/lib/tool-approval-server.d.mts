export type ToolApproval = { approved: true; tool: string; fingerprint: string; issuedAt: number; expiresAt: number; nonce: string; signature: string };
export type ApprovalCheck = { ok: boolean; code: "OK" | "MISSING" | "WRONG_TOOL" | "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "INPUT_CHANGED" | "ALREADY_USED" };
export type ApprovalAuditEntry = { at: string; event: "issued" | "verified" | "consumed" | "rejected"; tool: string; code: string; fingerprint?: string };
export function isGatedTool(tool: string): boolean;
export function issueToolApproval(tool: string, input: unknown, now?: number): ToolApproval;
export function verifyToolApproval(body: unknown, tool: string, options?: { consume?: boolean; now?: number }): ApprovalCheck;
export function hasToolApproval(body: unknown, tool: string, options?: { consume?: boolean; now?: number }): boolean;
export function getApprovalAudit(): ApprovalAuditEntry[];
export function resetApprovalStateForTests(): void;

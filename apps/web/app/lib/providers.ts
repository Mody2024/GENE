/**
 * GENE free-provider router (server-side only).
 *
 * GENE must keep working without paid credits. Free model availability on
 * OpenRouter changes constantly (a model that was free yesterday can answer
 * "This model is unavailable for free" today), so no model slug is hard-coded
 * as the only route. Instead the router:
 *   1. reads OpenRouter's public model catalog and keeps only models whose
 *      prompt AND completion price are exactly zero,
 *   2. ranks them for code/JSON generation,
 *   3. rotates through Groq and the ranked free models, skipping a model for a
 *      while after it reports "unavailable for free", rate limits, or errors,
 *   4. never calls a model that is not verified free, to avoid unexpected
 *      provider charges.
 */

export type AltProvider = {
  name: "groq" | "openrouter";
  key: string;
  endpoint: string;
  model: string;
  headers?: Record<string, string>;
};

export type ChatResult = {
  ok: boolean;
  status: number;
  text: string;
  finish: string;
  detail: string;
};

export type ChainFailure = { status: number; detail: string; provider: "Groq" | "OpenRouter" | "none" };

export type ChainResult =
  | { ok: true; provider: string; model: string; text: string; finish: string; attempts: number }
  | { ok: false; failure: ChainFailure; truncated: boolean; malformed: boolean; attempts: number; triedModels: string[]; attemptDetails: string[] };

import { classifyProviderFailure, describeProviderError, extractJsonObjectText, parseFreeCatalog, scoreModel } from "./provider-utils.mjs";
import type { CatalogEntry } from "./provider-utils.mjs";
export { classifyProviderFailure, extractJsonObjectText, parseFreeCatalog };

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CATALOG_TTL_MS = 10 * 60 * 1000;
const DEAD_MODEL_TTL_MS = 20 * 60 * 1000;

// Used only when the live catalog cannot be reached. They are still checked for
// a ":free" suffix, and a provider-side "unavailable for free" answer marks them dead.
const FALLBACK_FREE_MODELS = [
  "qwen/qwen3-coder:free",
  "deepseek/deepseek-chat-v3.1:free",
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free"
];

const DEFAULT_GROQ_MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b", "llama-3.1-8b-instant"];

let catalogCache: { at: number; entries: CatalogEntry[]; live: boolean } | null = null;
const deadModels = new Map<string, number>();

export function isModelMarkedDead(id: string): boolean {
  const until = deadModels.get(id);
  if (!until) return false;
  if (until <= Date.now()) {
    deadModels.delete(id);
    return false;
  }
  return true;
}

export function markModelUnavailable(id: string): void {
  deadModels.set(id, Date.now() + DEAD_MODEL_TTL_MS);
}

/** Test hook: clear cached catalog and dead-model memory. */
export function resetProviderCaches(): void {
  catalogCache = null;
  deadModels.clear();
}

async function loadCatalog(signal?: AbortSignal): Promise<{ entries: CatalogEntry[]; live: boolean }> {
  if (signal?.aborted) throw new DOMException("Provider chain cancelled", "AbortError");
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache;
  try {
    const response = await fetch(CATALOG_URL, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4_500)]) : AbortSignal.timeout(4_500), headers: { Accept: "application/json" } });
    if (response.ok) {
      const entries = parseFreeCatalog(await response.json().catch(() => null));
      if (entries.length) {
        catalogCache = { at: Date.now(), entries, live: true };
        return catalogCache;
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Fall through to the static list; the catalog is a best-effort optimisation.
  }
  const entries = FALLBACK_FREE_MODELS.map(id => ({ id, context: 0, score: scoreModel(id, 0) }));
  catalogCache = { at: Date.now() - CATALOG_TTL_MS + 60_000, entries, live: false };
  return catalogCache;
}

/** Ranked verified-free OpenRouter model ids (dead models removed). */
export async function getFreeOpenRouterModels(limit = 6, signal?: AbortSignal): Promise<string[]> {
  const { entries } = await loadCatalog(signal);
  const override = process.env.GENE_OPENROUTER_MODEL?.trim();
  const ids = entries.map(entry => entry.id).filter(id => !isModelMarkedDead(id));
  // A user override is honoured only when it is verifiably free; a stale ":free"
  // slug that OpenRouter no longer lists as free is silently dropped.
  if (override && ids.includes(override)) ids.unshift(override);
  return Array.from(new Set(ids)).slice(0, limit);
}

export function hasAlternateProviderKeys(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim());
}

export async function listAlternateProviders(siteTitle: string, options: { openrouterLimit?: number; groqLimit?: number; signal?: AbortSignal } = {}): Promise<AltProvider[]> {
  if (options.signal?.aborted) throw new DOMException("Provider chain cancelled", "AbortError");
  const providers: AltProvider[] = [];
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const override = process.env.GENE_GROQ_MODEL?.trim();
    const models = Array.from(new Set([...(override ? [override] : []), ...DEFAULT_GROQ_MODELS])).filter(id => !isModelMarkedDead(id));
    for (const model of models.slice(0, options.groqLimit ?? 2)) {
      providers.push({ name: "groq", key: groqKey, endpoint: "https://api.groq.com/openai/v1/chat/completions", model });
    }
  }
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    const models = await getFreeOpenRouterModels(options.openrouterLimit ?? 5, options.signal);
    for (const model of models) {
      providers.push({
        name: "openrouter",
        key: openRouterKey,
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model,
        headers: { "HTTP-Referer": "https://gene-flash.vercel.app", "X-Title": siteTitle }
      });
    }
  }
  return providers;
}

export async function callChatProvider(
  provider: AltProvider,
  options: { system: string; user: string; maxTokens: number; temperature: number; json: boolean; timeoutMs: number; signal?: AbortSignal }
): Promise<ChatResult> {
  const started = Date.now();
  const attempt = async (useJsonMode: boolean, timeoutMs: number): Promise<ChatResult> => {
    try {
      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + provider.key, ...(provider.headers || {}) },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
          ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
          temperature: options.temperature,
          max_tokens: options.maxTokens
        }),
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1_000, timeoutMs))]) : AbortSignal.timeout(Math.max(1_000, timeoutMs))
      });
      const data: any = await response.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content;
      const detail = data?.error ? describeProviderError(data) : (typeof content === "string" && content.trim() ? "" : "empty response");
      return {
        ok: response.ok && typeof content === "string" && content.trim().length > 0,
        status: response.status,
        text: typeof content === "string" ? content : "",
        finish: String(data?.choices?.[0]?.finish_reason || ""),
        detail
      };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return { ok: false, status: 504, text: "", finish: "", detail: error instanceof Error ? error.message : "network error" };
    }
  };
  let result = await attempt(options.json, options.timeoutMs);
  // Some free models reject response_format. Retry once as plain text; the
  // caller extracts JSON tolerantly.
  if (!result.ok && options.json && result.status === 400 && /response_format|json_object|structured|json mode/i.test(result.detail)) {
    const remaining = options.timeoutMs - (Date.now() - started);
    if (remaining > 2_000 && !options.signal?.aborted) result = await attempt(false, remaining);
  }
  return result;
}

export async function runAlternateChain(options: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  json: boolean;
  /** Absolute epoch-ms deadline for the whole chain. */
  deadline: number;
  perCallMs?: number;
  maxAttempts?: number;
  siteTitle: string;
  /** Optional semantic validation of the returned text (for example JSON.parse). */
  validate?: (text: string) => boolean;
  openrouterLimit?: number;
  groqLimit?: number;
  signal?: AbortSignal;
}): Promise<ChainResult> {
  if (options.signal?.aborted) throw new DOMException("Provider chain cancelled", "AbortError");
  const candidates = await listAlternateProviders(options.siteTitle, { openrouterLimit: options.openrouterLimit, groqLimit: options.groqLimit, signal: options.signal });
  let failure: ChainFailure = { status: 502, detail: "No alternate free provider is configured.", provider: "none" };
  let truncated = false;
  let malformed = false;
  let attempts = 0;
  const tried: string[] = [];
  const attemptDetails: string[] = [];
  const skipProvider = new Set<string>();
  for (const candidate of candidates) {
    if (options.signal?.aborted) throw new DOMException("Provider chain cancelled", "AbortError");
    if (attempts >= (options.maxAttempts ?? 5)) break;
    if (skipProvider.has(candidate.name)) continue;
    const remaining = options.deadline - Date.now();
    if (remaining < 2_500) break;
    attempts += 1;
    tried.push(candidate.name + "/" + candidate.model);
    const label = candidate.name === "groq" ? "Groq" : "OpenRouter";
    const result = await callChatProvider(candidate, {
      system: options.system,
      user: options.user,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      json: options.json,
      timeoutMs: Math.min(options.perCallMs ?? 14_000, remaining - 500),
      signal: options.signal
    });
    if (!result.ok) {
      const failureKind = classifyProviderFailure(result.status, result.detail);
      attemptDetails.push((label + "/" + candidate.model + ": HTTP " + (result.status || 502) + " (" + failureKind + ")" + (result.detail ? " — " + result.detail : "")).slice(0, 220));
      failure = { status: result.status || 502, detail: candidate.name + " (" + candidate.model + "): " + (result.detail || "empty response"), provider: label };
      const kind = classifyProviderFailure(result.status, result.detail);
      if (kind === "unavailable" || kind === "paid") markModelUnavailable(candidate.model);
      if (kind === "auth") skipProvider.add(candidate.name);
      continue;
    }
    if (result.finish === "length") {
      attemptDetails.push(label + "/" + candidate.model + ": output token limit reached");
      truncated = true;
      failure = { status: 422, detail: candidate.name + " (" + candidate.model + ") reached its output limit before completing JSON.", provider: label };
      continue;
    }
    if (options.validate && !options.validate(result.text)) {
      attemptDetails.push(label + "/" + candidate.model + ": returned invalid or incomplete output");
      malformed = true;
      failure = { status: 422, detail: candidate.name + " (" + candidate.model + ") returned incomplete or invalid JSON.", provider: label };
      continue;
    }
    return { ok: true, provider: candidate.name, model: candidate.model, text: result.text, finish: result.finish, attempts };
  }
  return { ok: false, failure, truncated, malformed, attempts, triedModels: tried, attemptDetails };
}

export function getGeminiKeys(): string[] {
  const configured = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    ...(process.env.GEMINI_API_KEYS || "").split(/[,;\n]/)
  ];
  return Array.from(new Set(configured.map(key => key?.trim()).filter((key): key is string => Boolean(key))));
}

export type GenerateTextResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; error: string; status: number };

/**
 * One free-route text generation: Gemini keys first (each with fallback models), then Groq and the verified-free
 * OpenRouter models. Used by the illustrator and other single-shot tools. Never calls a paid route.
 */
export async function generateText(options: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  budgetMs?: number;
  siteTitle: string;
  validate?: (text: string) => boolean;
}): Promise<GenerateTextResult> {
  const startedAt = Date.now();
  const budget = options.budgetMs ?? 50_000;
  const deadline = startedAt + budget;
  let lastDetail = "No AI provider is configured. Add a free GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY.";
  let lastStatus = 503;
  const keys = getGeminiKeys();
  const hasAlternates = hasAlternateProviderKeys();
  const geminiDeadline = hasAlternates ? startedAt + Math.floor(budget * 0.55) : deadline;
  const models = Array.from(new Set([process.env.GENE_FAST_MODEL || "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]));
  outer: for (const key of keys.slice(0, 3)) {
    for (const model of models) {
      const remaining = geminiDeadline - Date.now();
      if (remaining < 3_000) break outer;
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: options.system }] },
            contents: [{ role: "user", parts: [{ text: options.user }] }],
            generationConfig: { ...(options.json ? { responseMimeType: "application/json" } : {}), temperature: options.temperature ?? 0.4, maxOutputTokens: options.maxTokens }
          }),
          signal: AbortSignal.timeout(Math.min(22_000, remaining - 500))
        });
        const payload: any = await response.json().catch(() => null);
        const text = String(payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || "");
        if (response.ok && text.trim() && String(payload?.candidates?.[0]?.finishReason || "") !== "MAX_TOKENS" && (!options.validate || options.validate(text))) {
          return { ok: true, text, provider: "gemini", model };
        }
        lastStatus = response.status || 502;
        lastDetail = "gemini (" + model + "): " + String(payload?.error?.message || (text ? "incomplete or invalid output" : "empty response")).slice(0, 300);
        if (response.status === 401 || response.status === 403) continue outer; // try the next key
      } catch (error) {
        lastStatus = 504;
        lastDetail = "gemini (" + model + "): " + (error instanceof Error ? error.message : "network error");
      }
    }
  }
  if (hasAlternates && deadline - Date.now() > 3_000) {
    const chain = await runAlternateChain({
      system: options.system,
      user: options.user,
      maxTokens: options.maxTokens,
      temperature: options.temperature ?? 0.4,
      json: Boolean(options.json),
      deadline,
      perCallMs: 18_000,
      maxAttempts: 4,
      siteTitle: options.siteTitle,
      validate: options.validate
    });
    if (chain.ok) return { ok: true, text: chain.text, provider: chain.provider, model: chain.model };
    return { ok: false, status: chain.failure.status, error: "Free backup models did not complete the request (" + chain.triedModels.join(", ") + "). " + chain.failure.detail };
  }
  return { ok: false, status: lastStatus, error: lastDetail };
}

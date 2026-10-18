/** Pure, dependency-free helpers for the GENE free-provider router (unit-tested directly). */

export function isZeroPrice(value) {
  if (value === undefined || value === null || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && n === 0;
}

export function scoreModel(id, context) {
  const name = id.toLowerCase();
  let score = Math.min(context / 8000, 24);
  if (/coder|code/.test(name)) score += 60;
  if (/qwen3|qwen-3/.test(name)) score += 18;
  if (/deepseek/.test(name)) score += 16;
  if (/gpt-oss/.test(name)) score += 16;
  if (/llama-3\.3|llama-4/.test(name)) score += 12;
  if (/glm|kimi|minimax|mistral/.test(name)) score += 8;
  if (/gemma/.test(name)) score += 4;
  if (/(^|[-/])(1b|3b|7b|8b)([-:/]|$)/.test(name)) score -= 18;
  if (/vision|\bvl\b|embed|audio|image|guard|moderation|safeguard/.test(name)) score -= 80;
  return score;
}

/** Pure helper (unit-testable): extract verified-free text models from a catalog payload. */
export function parseFreeCatalog(payload) {
  const data = payload?.data;
  if (!Array.isArray(data)) return [];
  const entries = [];
  for (const raw of data) {
    const item = raw;
    if (typeof item?.id !== "string" || !item.id) continue;
    if (item.id !== "openrouter/free" && (item.id === "openrouter/auto" || item.id.startsWith("openrouter/"))) continue;
    if (!isZeroPrice(item.pricing?.prompt) || !isZeroPrice(item.pricing?.completion)) continue;
    if (item.pricing?.request !== undefined && item.pricing?.request !== null && !isZeroPrice(item.pricing.request)) continue;
    const outputs = item.architecture?.output_modalities;
    // This router serves chat/code generation only. Exclude audio/music/TTS,
    // image/video generation, embeddings, rerankers, and moderation endpoints even
    // when a catalog entry advertises text as one of several output modalities.
    const id = item.id.toLowerCase();
    if (/lyria|audio|music|text-to-speech|(^|[-/])tts([-/.:]|$)|speech|whisper|transcrib|imagegen|image-generation|video-generation|embedding|rerank|moderation|safeguard|guard-model|clip-preview|note-preview|dots-studio|nvidia[^a-z]nemotron/.test(id)) continue;
    if (Array.isArray(outputs) && (!outputs.includes("text") || outputs.some(modality => modality !== "text"))) continue;
    const context = Number(item.context_length) || 0;
    if (context && context < 12_000) continue;
    entries.push({ id: item.id, context, score: scoreModel(item.id, context) });
  }
  return entries.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Tolerant JSON extraction: strips markdown fences and surrounding prose. */
export function extractJsonObjectText(text) {
  let cleaned = String(text || "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    const slice = cleaned.slice(first, last + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      return null;
    }
  }
}

/** Preserve useful upstream diagnostics when a gateway returns a generic error message. */
export function describeProviderError(data) {
  const error = data?.error;
  const parts = [error?.message, error?.metadata?.raw, error?.metadata?.provider_name]
    .filter(value => typeof value === "string" && value.trim())
    .map(value => value.trim());
  const unique = [...new Set(parts)];
  return (unique.join(" | ") || "empty response").slice(0, 500);
}

export function classifyProviderFailure(status, detail) {
  if (/unavailable for free|paid version|use this slug|no endpoints found|model.*not found|model.*does not exist|does not exist or you do not have access|not a valid model|no longer available|deprecated|decommissioned/i.test(detail)) return "unavailable";
  if (status === 402 || /payment required|insufficient credits|not enough credits|requires credits|balance too low/i.test(detail)) return "paid";
  if (status === 429 || /rate.?limit|too many requests|quota|capacity/i.test(detail)) return "rate";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500 || status === 408 || status === 504) return "server";
  return "other";
}


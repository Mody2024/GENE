export const MAX_RUNTIME_ASSET_BYTES = 1_500_000;

/**
 * Exposes saved GENE Forge text assets to the isolated game iframe.
 * Only known, generated asset paths are included; the size cap prevents a
 * large model from freezing the editor by inflating srcDoc.
 */
export function buildRuntimeAssetBootstrap(files: Record<string, string> | undefined): string {
  const assets: Record<string, string> = {};
  let totalBytes = 0;
  for (const [path, content] of Object.entries(files || {})) {
    if (!/^assets\/[a-zA-Z0-9_-]+\/(?:model\.obj|model\.mtl|asset\.json)$/i.test(path)) continue;
    if (typeof content !== "string" || totalBytes + content.length > MAX_RUNTIME_ASSET_BYTES) continue;
    assets[path] = content;
    totalBytes += content.length;
  }
  // Escape HTML opening characters so model text cannot terminate the bootstrap script.
  const serialized = JSON.stringify(assets).replace(/</g, "\\u003c");
  return "<script>window.__GENE_ASSETS__=" + serialized + ";</script>";
}

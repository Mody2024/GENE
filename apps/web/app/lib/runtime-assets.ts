export const MAX_RUNTIME_ASSET_BYTES = 1_500_000;

/**
 * Exposes saved GENE Forge text assets and a small dependency-free OBJ/MTL
 * parser to the isolated game iframe. This is not a rigging or animation
 * system; it turns generated static mesh files into usable WebGL geometry.
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
  // Escape "<" so imported text cannot terminate this inline bootstrap script.
  const serialized = JSON.stringify(assets).replace(/</g, "\\u003c");
  const runtime = [
    "window.__GENE_ASSETS__=" + serialized + ";",
    "window.GENE3D=window.GENE3D||{};",
    "window.GENE3D.parseMTL=function(path){var src=window.__GENE_ASSETS__[path];if(typeof src!==\"string\")throw new Error(\"Missing material asset: \"+path);var out={},current=null;src.split(/\\r?\\n/).forEach(function(line){var p=line.trim().split(/\\s+/);if(p[0]===\"newmtl\"){current=p.slice(1).join(\" \");out[current]={kd:[0.7,0.7,0.7]};}else if(p[0]===\"Kd\"&&current&&p.length>=4){var rgb=p.slice(1,4).map(Number);if(rgb.every(Number.isFinite))out[current].kd=rgb.map(function(n){return Math.max(0,Math.min(1,n));});}});return out;};",
    "window.GENE3D.parseOBJ=function(path){var src=window.__GENE_ASSETS__[path];if(typeof src!==\"string\")throw new Error(\"Missing OBJ asset: \"+path);var vertices=[],groups={},current=\"default\";function emit(i0,i1,i2){var a=vertices[i0],b=vertices[i1],c=vertices[i2];if(!a||!b||!c)return;var ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;var out=groups[current]||(groups[current]=[]);[a,b,c].forEach(function(v){out.push(v[0],v[1],v[2],nx,ny,nz);});}function index(token){var n=parseInt(token.split(\"/\")[0],10);return n<0?vertices.length+n:n-1;}src.split(/\\r?\\n/).forEach(function(line){var p=line.trim().split(/\\s+/);if(p[0]===\"v\"&&p.length>=4){var v=p.slice(1,4).map(Number);if(v.every(Number.isFinite))vertices.push(v);}else if(p[0]===\"usemtl\"){current=p.slice(1).join(\" \")||\"default\";}else if(p[0]===\"f\"&&p.length>=4){var ids=p.slice(1).map(index);for(var j=1;j<ids.length-1;j++)emit(ids[0],ids[j],ids[j+1]);}});return Object.keys(groups).map(function(name){return {material:name,positions:groups[name],vertexCount:groups[name].length/6};});};"
  ].join("");
  return "<script>" + runtime + "</script>";
}

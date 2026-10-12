import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { put } from "@vercel/blob";

const [filePath, buildId, outputName, contentType] = process.argv.slice(2);
if (!filePath || !buildId || !outputName || !contentType) throw new Error("Usage: upload-cloud-output.mjs FILE BUILD_ID OUTPUT_NAME CONTENT_TYPE");
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is missing from GitHub Actions secrets.");
if (!/^[a-z0-9-]{8,64}$/.test(buildId)) throw new Error("Invalid build ID.");
const bytes = fs.readFileSync(filePath);
if (!bytes.length) throw new Error("Build output is empty.");
const result = await put("gene-builds/" + buildId + "/" + path.basename(outputName), bytes, {
  access: "public",
  token,
  contentType,
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 3600
});
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
console.log("GENE_BUILD_URL=" + result.url);
console.log("GENE_BUILD_BYTES=" + bytes.length);
console.log("GENE_BUILD_SHA256=" + sha256);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "url=" + result.url + "\nbytes=" + bytes.length + "\nsha256=" + sha256 + "\n");

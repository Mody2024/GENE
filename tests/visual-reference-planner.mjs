import assert from "node:assert/strict";
import { planVisualReferenceQueries, rankVisualReferenceResults } from "../apps/web/app/lib/visual-reference-planner.mjs";
import { buildResearchBundle } from "../apps/web/app/lib/research-sources.mjs";
import { createProjectCoverSvg, projectCoverDataUrl } from "../apps/web/app/lib/project-cover.mjs";
import { readFileSync } from "node:fs";

const researchRoute = readFileSync(new URL("../apps/web/app/api/research/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const prompts = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");
const liveProgress = readFileSync(new URL("../apps/web/app/components/LiveRunPanel.tsx", import.meta.url), "utf8");

const gameQueries = planVisualReferenceQueries({ topic: "3D skeleton city adventure", kind: "game", engine: "webgl3d" });
assert.deepEqual(gameQueries.map(item => item.id), ["ui-menus", "gameplay", "characters", "environments"]);
assert.ok(gameQueries.every(item => item.query.includes("3D skeleton city adventure")));
assert.ok(gameQueries.every(item => item.query.length <= 220));
assert.match(gameQueries.find(item => item.id === "characters").query, /character sprite model animation/i);

const categoryIds = ["ui-menus", "gameplay", "characters", "environments"];
const categorizedBundle = buildResearchBundle({
  topic: "3D city adventure",
  commonsImages: categoryIds.flatMap(category => [0, 1].map(index => ({
    id: category + "-" + index, title: category + " " + index, thumb: "https://upload.wikimedia.org/" + category + "-" + index + ".jpg",
    full: "https://upload.wikimedia.org/" + category + "-" + index + ".jpg", page: "https://commons.wikimedia.org/wiki/File:" + category + "-" + index,
    license: "CC0", credit: "Test", source: "Wikimedia Commons", category, categoryLabel: category
  }))),
  links: []
});
assert.deepEqual(categorizedBundle.images.slice(0, 4).map(image => image.category), categoryIds, "one image per category should be prioritized before repeats");
assert.ok(categorizedBundle.images.length <= 12);
const appQueries = planVisualReferenceQueries({ topic: "Project dashboard and task manager", kind: "app", engine: "webapp" });
assert.deepEqual(appQueries.map(item => item.id), ["ui-layout", "interaction-patterns", "visual-style", "illustrations-icons"]);
assert.equal(planVisualReferenceQueries({ topic: "City runner", images: false }).length, 0);
assert.equal(planVisualReferenceQueries({ topic: "x" }).length, 0);

const rankedImages = rankVisualReferenceResults([
  { id: "good", title: "Skeleton character turnaround", category: "characters" },
  { id: "bad", title: "Banana smoothie recipe", category: "characters" },
  { id: "city", title: "City street buildings", category: "environments" },
  { id: "generic", title: "Random photograph", category: "environments" }
], "3D skeleton city adventure");
assert.deepEqual(rankedImages.map(image => image.id), ["good", "city"], "off-topic image results should be filtered and topic matches prioritized");

const coverA = createProjectCoverSvg({ name: "Skeleton City", kind: "game", engine: "webgl3d", prompt: "third person skeleton in a city" });
const coverB = createProjectCoverSvg({ name: "Budget Board", kind: "app", engine: "webapp", prompt: "dashboard and budget charts" });
const coverWithSprite = createProjectCoverSvg({
  name: "Hero Platformer", kind: "game", engine: "canvas2d",
  files: {
    "assets/forge2d/character.json": JSON.stringify({ kind: "character", name: "character" }),
    "assets/forge2d/character.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="5" r="4" fill="#f00"/><rect x="6" y="9" width="8" height="10" fill="#00f"/></svg>'
  }
});
assert.match(coverWithSprite, /data-gene-cover-character="sprite"/, "the cover must reuse the actual project-owned character sprite when available");
assert.match(coverWithSprite, /data:image\/svg\+xml;charset=utf-8,%3Csvg/, "the sprite is embedded locally, without an image model");
const coverWithMesh = createProjectCoverSvg({
  name: "3D Hero", kind: "game", engine: "webgl3d",
  files: {
    "assets/hero/asset.json": JSON.stringify({ kind: "character", name: "hero" }),
    "assets/hero/model.obj": "v -1 0 0\nv 1 0 0\nv 0 2 0\nf 1 2 3\n",
    "assets/hero/model.mtl": "newmtl hero\nKd 0.4 0.7 0.9\n"
  }
});
assert.match(coverWithMesh, /data-gene-cover-character="obj"/, "3D covers can project the original OBJ character mesh locally");
assert.match(coverWithMesh, /<polygon points=/, "the cover renderer uses actual mesh faces");

assert.match(coverA, /<svg[^>]+data-gene-cover="local-v1"/);
assert.match(coverA, /Skeleton City/);
assert.match(coverA, /3D GAME/);
assert.match(coverA, /<circle cx="281" cy="112"/, "cover art should derive a local skeleton motif from the project brief");
const coverWithFont = createProjectCoverSvg({ name: "Font Test", files: { "game.css": "body { font-family: 'Comic Sans MS', sans-serif; }" } });
assert.match(coverWithFont, /font-family="Comic Sans MS,system-ui,Segoe UI,Arial,sans-serif"/, "cover typography should reuse the project font declaration when available");
assert.match(coverB, /WEB APP/);
assert.match(coverB, /<rect x="56" y="48" width="390" height="188"/, "app projects use a dashboard-style cover rather than a game scene");
assert.equal(createProjectCoverSvg({ name: "A&B <Game>" }).includes("A&amp;B &lt;Game&gt;"), true);
assert.equal(createProjectCoverSvg({ name: "Same", prompt: "city" }), createProjectCoverSvg({ name: "Same", prompt: "city" }), "cover rendering is deterministic");
assert.match(projectCoverDataUrl({ name: "Game" }), /^data:image\/svg\+xml;charset=utf-8,/);
for (const svg of [coverA, coverB]) {
  assert.doesNotMatch(svg, /<script|foreignObject|(?:href|src)\s*=\s*["\x27]https?:/i, "covers are local SVG only; no remote or executable content");
}
assert.match(researchRoute, /body\?\.images !== false/, "visual references are enabled by default");
assert.match(researchRoute, /visualQueries\.map/, "research executes category-specific image searches");
assert.match(researchRoute, /Prefer category-tagged Commons results first/, "multimodal references should favor category diversity");
assert.match(workspace, /images: true/, "the build workspace always requests visual references by default");
assert.match(workspace, /assets\/project-cover\.svg/, "new builds save a local cover inside the project");
assert.match(workspace, /section === "projects"/, "the workspace exposes a dedicated Projects page");
assert.match(prompts, /EXPLICIT TOOL PERMISSIONS:[\s\S]{0,450}request explicit approval/i, "every tool call must request explicit approval");
assert.match(liveProgress, /run\.build\.passed/, "build progress is based on verified task statuses");
assert.match(liveProgress, /Current task:/, "progress shows the currently running build task");
assert.match(prompts, /Server-side enforcement is mandatory; UI-only prompts are insufficient/i, "permission policy must require server-side enforcement");
console.log("Visual-reference planner, autonomous-tool contract, Projects gallery, and local cover tests passed.");

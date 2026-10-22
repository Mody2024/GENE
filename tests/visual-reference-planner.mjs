import assert from "node:assert/strict";
import { planVisualReferenceQueries } from "../apps/web/app/lib/visual-reference-planner.mjs";
import { createProjectCoverSvg, projectCoverDataUrl } from "../apps/web/app/lib/project-cover.mjs";
import { readFileSync } from "node:fs";

const researchRoute = readFileSync(new URL("../apps/web/app/api/research/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const prompts = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");

const gameQueries = planVisualReferenceQueries({ topic: "3D skeleton city adventure", kind: "game", engine: "webgl3d" });
assert.deepEqual(gameQueries.map(item => item.id), ["ui-menus", "gameplay", "characters", "environments"]);
assert.ok(gameQueries.every(item => item.query.includes("3D skeleton city adventure")));
assert.ok(gameQueries.every(item => item.query.length <= 220));
assert.match(gameQueries.find(item => item.id === "characters").query, /character design|animation pose/i);

const appQueries = planVisualReferenceQueries({ topic: "Project dashboard and task manager", kind: "app", engine: "webapp" });
assert.deepEqual(appQueries.map(item => item.id), ["ui-layout", "interaction-patterns", "visual-style", "illustrations-icons"]);
assert.equal(planVisualReferenceQueries({ topic: "City runner", images: false }).length, 0);
assert.equal(planVisualReferenceQueries({ topic: "x" }).length, 0);

const coverA = createProjectCoverSvg({ name: "Skeleton City", kind: "game", engine: "webgl3d", prompt: "third person skeleton in a city" });
const coverB = createProjectCoverSvg({ name: "Budget Board", kind: "app", engine: "webapp", prompt: "dashboard and budget charts" });
assert.match(coverA, /<svg[^>]+data-gene-cover="local-v1"/);
assert.match(coverA, /Skeleton City/);
assert.match(coverA, /3D GAME/);
assert.match(coverA, /<circle cx="281" cy="112"/, "cover art should derive a local skeleton motif from the project brief");
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
assert.match(prompts, /invoke configured, in-scope tools automatically/, "configured routine tools run autonomously");
assert.doesNotMatch(prompts, /Before each optional external or specialist tool is used[\s\S]{0,300}ask for approval with Use \/ Skip/, "routine research and Forge operations should not prompt for each approval");
console.log("Visual-reference planner, autonomous-tool contract, Projects gallery, and local cover tests passed.");

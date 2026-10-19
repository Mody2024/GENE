import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createNativeResult } from "../apps/web/lib/native-generator.mjs";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const game = await createNativeResult({
    operation: "build", message: "A 2D platformer with jumping, collectibles and hazards",
    project: { kind: "game", preferredEngine: "canvas2d", name: "Native Platformer", initialPrompt: "A 2D platformer with jumping, collectibles and hazards" }
  });
  const files = Object.fromEntries(game.files.map(file => [file.path, file.content]));
  const gameHtml = files["game.html"]
    .replace('<link rel="stylesheet" href="game.css">', "<style>" + files["game.css"] + "</style>")
    .replace('<script src="game.js"></script>', "<script>" + files["game.js"] + "</script>");
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.setContent(gameHtml, { waitUntil: "load" });
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForTimeout(180);
  assert.equal(await page.locator("#status").textContent(), "PLAYING");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("p");
  assert.equal(await page.locator("#status").textContent(), "PAUSED");
  await page.getByRole("button", { name: "Pause" }).click();
  assert.equal(await page.locator("#status").textContent(), "PLAYING");
  await page.getByRole("button", { name: "Restart" }).click();
  assert.equal(await page.locator("#status").textContent(), "PLAYING");
  assert.equal(await page.locator("#score").textContent(), "0");
  assert.deepEqual(runtimeErrors, [], "generated 2D game must not throw browser runtime errors");

  const app = await createNativeResult({
    operation: "build", message: "A local task manager web app",
    project: { kind: "app", preferredEngine: "webapp", name: "Native Tasks", initialPrompt: "A local task manager web app" }
  });
  const appFiles = Object.fromEntries(app.files.map(file => [file.path, file.content]));
  const appHtml = appFiles["game.html"]
    .replace('<link rel="stylesheet" href="game.css">', "<style>" + appFiles["game.css"] + "</style>")
    .replace('<script src="game.js"></script>', "<script>" + appFiles["game.js"] + "</script>");
  await page.goto("about:blank");
  await page.setContent(appHtml, { waitUntil: "load" });
  await page.locator("#task-input").fill("Check native game quality");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByText("Check native game quality").waitFor();
  await page.locator("#task-list input[type=checkbox]").check();
  assert.equal(await page.locator("#task-list li").first().getAttribute("class"), "done");
  await page.reload();
  await page.getByText("Check native game quality").waitFor();
  assert.equal(await page.locator("#task-list li").first().getAttribute("class"), "done");
  console.log("native-browser: generated 2D game controls/pause/restart and web-app add/complete/persistence passed");
} finally {
  await browser.close();
}

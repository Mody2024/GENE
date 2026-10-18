import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.GENE_STUDIO_TEST_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 820, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 45000 });
    await page.locator(".rail-item").first().waitFor({ state: "visible", timeout: 15000 });

    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      hasProjectHeading: Boolean(document.querySelector("h1")),
      hasPreview: Boolean(document.querySelector(".preview-panel"))
    }));
    assert.equal(layout.documentWidth, viewport.width, viewport.name + " document must not overflow horizontally");
    assert.equal(layout.bodyWidth, viewport.width, viewport.name + " body must not overflow horizontally");
    assert.equal(layout.hasProjectHeading, true, viewport.name + " should render the workspace heading");
    assert.equal(layout.hasPreview, true, viewport.name + " should keep the preview surface available");

    await page.locator('.rail-item[aria-label="Files"]').click();
    assert.ok((await page.locator(".tool-view-heading h2").allTextContents()).includes("Project files"), viewport.name + " Files navigation should open");
    await page.locator('.rail-item[aria-label="Plan & tasks"]').click();
    assert.ok((await page.locator(".tool-view-heading h2").count()) > 0, viewport.name + " task navigation should open");

    if (viewport.width <= 820) await page.locator(".mobile-new-project").click();
    else await page.locator('.project-sidebar button[title="New project"]').click();
    await page.locator('.create-project-dialog[role="dialog"]').waitFor({ state: "visible" });
    assert.match(await page.locator(".create-project-dialog").innerText(), /What are we building\?/);
    await page.locator(".create-project-dialog button").first().click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".create-project-dialog").count(), 0, viewport.name + " project dialog should close");

    assert.deepEqual(pageErrors, [], viewport.name + " should not raise browser runtime errors");
    results.push({ viewport: viewport.name, status: "passed", width: viewport.width });
    await page.close();
  }
  console.log(JSON.stringify({ status: "passed", results }, null, 2));
} finally {
  await browser.close();
}

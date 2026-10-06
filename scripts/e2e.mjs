// End-to-end check in a real Chromium: load the unpacked extension, route a real download through
// it, and capture the popup for the README.
//
//   npm install && npx playwright install chromium
//   npm run e2e           # or npm run screenshot to also refresh docs/popup.png
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Retries `check` every 100 ms for up to 5 s; errors count as "not yet".
async function until(check, what = check.toString()) {
  for (let i = 0; i < 50; i++) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for: ${what}`);
}
const extension = join(root, "extension");
const takeScreenshot = process.argv.includes("--screenshot");

// A local server with one file to download.
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="syllabus.pdf"' });
  res.end("%PDF-1.4\n% test file\n");
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const fileUrl = `http://127.0.0.1:${server.address().port}/syllabus.pdf`;

// A fresh profile whose Chrome download folder is a temp directory.
const downloads = mkdtempSync(join(tmpdir(), "dlorg-"));
const profile = mkdtempSync(join(tmpdir(), "dlorg-profile-"));
mkdirSync(join(profile, "Default"));
writeFileSync(
  join(profile, "Default", "Preferences"),
  JSON.stringify({ download: { default_directory: downloads, prompt_for_download: false } }),
);
// Set CHROMIUM_PATH to use a Chromium you already have instead of Playwright's download.
const browser = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" };
const context = await chromium.launchPersistentContext(profile, {
  ...browser,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  deviceScaleFactor: 2,
});
// Playwright normally intercepts downloads and names them itself. Hand them back to Chrome so
// the extension's onDeterminingFilename suggestion is what decides the path.
const cdp = await context.newCDPSession(context.pages()[0] ?? (await context.newPage()));
await cdp.send("Browser.setDownloadBehavior", { behavior: "default" });

try {
  const isOurs = (w) => w.url().endsWith("/background.js");
  const worker = context.serviceWorkers().find(isOurs) ?? (await context.waitForEvent("serviceworker", { predicate: isOurs }));
  const extensionId = new URL(worker.url()).host;
  // Playwright can report the worker before its global scope and the extension APIs exist,
  // so wait from this side until it answers.
  await until(() => worker.evaluate(() => typeof chrome !== "undefined" && Boolean(chrome.downloads)));

  // The module worker loaded and registered its download hook.
  assert.equal(await worker.evaluate(() => chrome.downloads.onDeterminingFilename.hasListeners()), true);

  // Pick a folder; the toolbar badge should switch on.
  await worker.evaluate(() =>
    chrome.storage.local.set({
      activeFolder: "BIO 101/Week 3",
      recent: ["BIO 101/Week 3", "Taxes 2026"],
      rules: [{ match: "canvas.example.edu/courses/123", folder: "BIO 101" }],
    }),
  );
  await until(async () => (await worker.evaluate(() => chrome.action.getBadgeText({}))) === "ON");

  // A real download goes through onDeterminingFilename and lands in the chosen folder.
  const id = await worker.evaluate((url) => chrome.downloads.download({ url }), fileUrl);
  const item = await worker.evaluate(async (downloadId) => {
    for (let i = 0; i < 50; i++) {
      const [d] = await chrome.downloads.search({ id: downloadId });
      if (d && d.state !== "in_progress") return d;
      await new Promise((r) => setTimeout(r, 100));
    }
    return (await chrome.downloads.search({ id: downloadId }))[0];
  }, id);
  console.log(`download ${item.state}: ${item.filename}`);
  assert.equal(item.state, "complete");
  assert.match(item.filename.replaceAll("\\", "/"), /\/BIO 101\/Week 3\/syllabus\.pdf$/);

  if (takeScreenshot) {
    const page = await context.newPage();
    // Pretend the active tab is a Canvas course so the rule button shows what it would match.
    await page.addInitScript(() => {
      chrome.tabs.query = async () => [{ url: "https://canvas.example.edu/courses/123/files" }];
    });
    await page.setViewportSize({ width: 320, height: 330 });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector("#rules li");
    await page.emulateMedia({ colorScheme: "light" });
    await page.locator("body").screenshot({ path: join(root, "docs", "popup.png") });
    console.log("wrote docs/popup.png");
  }
  console.log("e2e ok");
} finally {
  await context.close();
  server.close();
}

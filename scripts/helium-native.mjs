/* global process */
import { chromium } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
if (!process.env.SAGE_BROWSER)
  throw new Error(
    "Set SAGE_BROWSER to the Helium executable before running this check.",
  );
const profile = await mkdtemp(path.resolve("test-results/native-helium-"));
const output = path.resolve(".output/v0.1.3/chrome-mv3");
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.SAGE_BROWSER,
  channel: "chromium",
  chromiumSandbox: true,
  headless: false,
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`],
});
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    "<html><title>SAGE Native Acceptance</title><body><h1>SAGE native acceptance</h1><p>The pilot included 42 volunteers and reported 12% lower water use. It had no randomized control group.</p></body></html>",
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto("http://127.0.0.1:" + server.address().port);
await writeFile(
  "docs/beta-native-environment.json",
  JSON.stringify(
    {
      profile,
      browser: browser.browser().version(),
      productionManifestUnchanged: true,
      title: await page.title(),
    },
    null,
    2,
  ),
);
console.log(
  "Native test profile ready. Close this isolated browser window to finish.",
);
browser.on("close", () => {
  server.close();
  process.exit(0);
});

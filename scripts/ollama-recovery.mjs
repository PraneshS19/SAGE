/* global chrome, URL, process, setTimeout */
import { chromium, expect } from "@playwright/test";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
if (!process.env.SAGE_BROWSER)
  throw new Error(
    "Set SAGE_BROWSER to the Helium executable before running this check.",
  );
const root = await mkdtemp(path.resolve("test-results/recovery-"));
await writeFile("test-results/recovery-path.txt", root);
const out = path.resolve(".output/chrome-mv3");
const context = await chromium.launchPersistentContext(
  path.join(root, "profile"),
  {
    executablePath: process.env.SAGE_BROWSER,
    chromiumSandbox: true,
    headless: false,
    args: [`--disable-extensions-except=${out}`, `--load-extension=${out}`],
  },
);
const evidence = {};
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const page = await context.newPage();
  await page.goto(
    "chrome-extension://" + new URL(worker.url()).host + "/options.html",
  );
  await page.getByRole("button", { name: "AI Providers", exact: true }).click();
  await page
    .getByLabel("Endpoint", { exact: true })
    .fill("http://127.0.0.1:11434");
  await page
    .getByRole("button", { name: "Grant endpoint access & test connection" })
    .click();
  await expect(page.getByRole("status")).toContainText("Connected.", {
    timeout: 30000,
  });
  const rpc = async (m) => {
    const r = await page.evaluate((m) => chrome.runtime.sendMessage(m), m);
    if (!r.ok) throw Error(r.error);
    return r.data;
  };
  const wait = async (name) => {
    const end = Date.now() + 120000;
    while (Date.now() < end) {
      try {
        await readFile(path.join(root, name));
        return;
      } catch {
        /* Host marker not yet present. */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error("Host recovery marker timed out: " + name);
  };
  await writeFile(path.join(root, "ready"), "ready");
  await wait("stopped");
  evidence.down = await rpc({ type: "testConnection", inference: false });
  expect(evidence.down.ok).toBe(false);
  await writeFile(path.join(root, "checked"), "checked");
  await wait("restarted");
  await expect
    .poll(
      async () => {
        try {
          return (await rpc({ type: "models" })).includes("phi3:3.8b");
        } catch {
          return false;
        }
      },
      { timeout: 30000 },
    )
    .toBe(true);
  evidence.recoveredModels = await rpc({ type: "models" });
  evidence.sameExtension = true;
  await writeFile(
    "docs/ollama-recovery.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log("Recovery PASS");
} catch (e) {
  evidence.error = e.message;
  await writeFile(
    "docs/ollama-recovery.json",
    JSON.stringify(evidence, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await context.close();
}

/* global chrome, URL, process */
import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
if (!process.env.SAGE_BROWSER)
  throw new Error(
    "Set SAGE_BROWSER to the Helium executable before running this check.",
  );
await mkdir("test-results", { recursive: true });
const profile = await mkdtemp(path.resolve("test-results/helium-real-"));
const output = path.resolve(".output/chrome-mv3");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.SAGE_BROWSER,
  channel: "chromium",
  chromiumSandbox: true,
  headless: false,
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const origin = "chrome-extension://" + new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(origin + "/options.html");
  await page.getByRole("button", { name: "AI Providers", exact: true }).click();
  await page
    .getByLabel("Endpoint", { exact: true })
    .fill("http://127.0.0.1:11434");
  await page
    .getByRole("button", { name: "Grant endpoint access & test connection" })
    .click();
  console.log("WAITING FOR LOCALHOST PERMISSION", origin);
  await expect(page.getByRole("status")).toContainText("Connected.", {
    timeout: 120000,
  });
  console.log("CONNECTED");
  const rpc = async (m) => {
    const r = await page.evaluate((m) => chrome.runtime.sendMessage(m), m);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  const state = await rpc({ type: "state" });
  await rpc({
    type: "settings",
    settings: {
      ...state.settings,
      history: true,
      onboarded: true,
      provider: { ...state.settings.provider, model: "phi3:3.8b" },
    },
  });
  const models = await rpc({ type: "models" });
  await rpc({ type: "preloadModel", model: "phi3:3.8b" });
  await rpc({
    type: "importDocx",
    name: "Original local acceptance fixture",
    text: "The pilot included 42 volunteers and reported 12% lower water use over six weeks. It did not use a randomized control group.",
    warnings: [],
  });
  const results = [];
  for (const model of ["phi3:3.8b", "qwen2.5:3b"]) {
    if (!models.includes(model)) continue;
    await rpc({ type: "switchModel", model });
    const s = await rpc({ type: "state" });
    const d = await rpc({
      type: "prepare",
      sourceIds: s.sources.map((x) => x.id),
      passageIds: s.sources.flatMap((x) => x.passages.map((p) => p.id)),
      question:
        "Summarize the findings and limitations in two sentences. Cite the original passage ID.",
    });
    const started = Date.now();
    await rpc({ type: "start", draftId: d.id });
    await expect
      .poll(async () => (await rpc({ type: "state" })).job.status, {
        timeout: 240000,
        intervals: [250, 500, 1000],
      })
      .not.toBe("running");
    const job = (await rpc({ type: "state" })).job;
    results.push({
      model,
      status: job.status,
      output: job.output,
      error: job.error,
      elapsedMs: Date.now() - started,
    });
    await writeFile(
      "docs/helium-real-acceptance.json",
      JSON.stringify(
        { browser: context.browser().version(), origin, models, results },
        null,
        2,
      ),
    );
  }
  console.log(
    "RESULTS",
    results.map((r) => ({
      model: r.model,
      status: r.status,
      elapsedMs: r.elapsedMs,
    })),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context.close();
}

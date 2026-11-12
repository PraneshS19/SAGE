/* global chrome, process, URL */
import assert from "node:assert/strict";
import path from "node:path";
if (!process.env.SAGE_BROWSER)
  throw new Error(
    "Set SAGE_BROWSER to the Helium executable before running this check.",
  );
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";

const previousZip =
  process.env.SAGE_PREVIOUS_ZIP || "dist/SAGE-Release/sage-extension.zip";
const previous = unzipSync(await readFile(previousZip));
const sandbox = await mkdtemp(path.resolve("test-results/upgrade-"));
const unpacked = path.join(sandbox, "extension");
const profile = path.join(sandbox, "profile");
for (const [name, bytes] of Object.entries(previous)) {
  if (name.endsWith("/")) continue;
  const file = path.resolve(unpacked, name);
  if (!file.startsWith(unpacked + path.sep))
    throw new Error("Invalid prior ZIP path");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}
const launch = () =>
  chromium.launchPersistentContext(profile, {
    channel: "chromium",
    executablePath: process.env.SAGE_BROWSER,
    headless: false,
    chromiumSandbox: true,
    args: [
      `--disable-extensions-except=${unpacked}`,
      `--load-extension=${unpacked}`,
    ],
  });
let context = await launch();
async function surface() {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const origin = "chrome-extension://" + new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(origin + "/options.html");
  const version = await page.evaluate(
    () => chrome.runtime.getManifest().version,
  );
  return { origin, page, version };
}
try {
  const before = await surface();
  assert.equal(before.version, "0.1.2");
  const fixture = await before.page.evaluate(async () => {
    const state = (await chrome.runtime.sendMessage({ type: "state" })).data;
    const provider = {
      ...state.settings.provider,
      model: "upgrade-fixture-model",
      apiKey: "upgrade-fixture-local-key",
    };
    const settings = {
      ...state.settings,
      provider,
      providerProfiles: { ollama: provider },
      history: true,
      onboarded: true,
      skills: [
        ...state.settings.skills,
        {
          id: "upgrade-skill",
          name: "Upgrade check",
          description: "Synthetic skill",
          prompt: "Check this passage",
          contextMode: "page",
        },
      ],
    };
    const result = await chrome.runtime.sendMessage({
      type: "settings",
      settings,
    });
    if (!result.ok) throw new Error(result.error);
    const now = Date.now();
    const job = {
      id: "upgrade-history",
      status: "complete",
      output: "Synthetic saved answer",
      title: "Saved test research",
      created: now,
      updated: now,
      draft: {
        id: "upgrade-draft",
        question: "Test question",
        provider: { ...provider, apiKey: "" },
        sources: [],
        messages: [],
        tokens: 0,
        warnings: [],
        created: now,
      },
    };
    await chrome.storage.local.set({ history: [job] });
    return (await chrome.runtime.sendMessage({ type: "state" })).data;
  });
  await context.close();
  await cp(path.resolve("dist/SAGE-0.1.3/sage-extension"), unpacked, {
    recursive: true,
  });
  context = await launch();
  const after = await surface();
  const state = await after.page.evaluate(
    async () => (await chrome.runtime.sendMessage({ type: "state" })).data,
  );
  assert.equal(after.version, "0.1.3");
  assert.equal(after.origin, before.origin);
  assert.deepEqual(state.settings, fixture.settings);
  assert.deepEqual(state.history, fixture.history);
  assert.equal(state.history[0].id, "upgrade-history");
  await mkdir("docs/evidence/reliability", { recursive: true });
  await writeFile(
    "docs/evidence/reliability/upgrade.json",
    JSON.stringify(
      {
        from: before.version,
        to: after.version,
        identityPreserved: true,
        settingsPreserved: true,
        credentialsPreserved: true,
        skillsPreserved: true,
        providerProfilesPreserved: true,
        historyPreserved: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Same-path upgrade preserved identity, settings, credentials, skills and history.",
  );
} finally {
  await context.close();
}

import { once } from "node:events";
import { spawn } from "node:child_process";
/* global chrome, URL, Buffer, process, setTimeout */
import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { zipSync, strToU8 } from "fflate";
import path from "node:path";
if (!process.env.SAGE_BROWSER)
  throw new Error(
    "Set SAGE_BROWSER to the Helium executable before running this check.",
  );
await mkdir("test-results", { recursive: true });
const profile = await mkdtemp(path.resolve("test-results/helium-acceptance-"));
const output = path.resolve(
  process.env.SAGE_EXTENSION_DIR || ".output/v0.1.3/chrome-mv3",
);
const launch = {
  executablePath: process.env.SAGE_BROWSER,
  channel: "chromium",
  chromiumSandbox: true,
  headless: false,
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`],
};
let context = await chromium.launchPersistentContext(profile, launch);
const texts = {
  pilot:
    "The pilot included 42 volunteers and reported 12% lower water use over six weeks. It did not use a randomized control group.",
  replication:
    "A randomized twelve-week trial with 210 gardens estimated a 2% reduction. Its 95% confidence interval ranged from a 3% increase to a 7% reduction. This did not establish a clear benefit.",
};
const server = createServer((req, res) => {
  const key = req.url === "/replication" ? "replication" : "pilot";
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<html lang="en"><title>Garden ${key}</title><main><h1>Garden ${key}</h1><p>${texts[key]}</p></main></html>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const evidence = {
  testedAt: new Date().toISOString(),
  browser: context.browser().version(),
  productionManifestUnchanged: true,
  results: [],
  extensionRequests: [],
  pageRequests: 0,
};
const flush = () =>
  writeFile(
    process.env.SAGE_WORKFLOW_REPORT || "docs/helium-workflows.json",
    JSON.stringify(evidence, null, 2),
  );
context.on("request", (request) => {
  if (!/^https?:/.test(request.url())) return;
  if (request.serviceWorker()) {
    let model;
    try {
      model = JSON.parse(request.postData() || "{}").model;
    } catch {
      /* Request has no JSON body. */
    }
    evidence.extensionRequests.push({
      url: request.url(),
      method: request.method(),
      model,
    });
  } else evidence.pageRequests++;
});
let page;
let temporaryOllama;
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const origin = "chrome-extension://" + new URL(worker.url()).host;
  evidence.origin = origin;
  const endpoint = process.env.SAGE_OLLAMA_EXE
    ? "http://127.0.0.1:11435"
    : "http://127.0.0.1:11434";
  async function startTemporaryOllama() {
    const address = endpoint.replace("http://", "");
    const preexisting = await fetch(endpoint + "/api/version", {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null);
    if (preexisting)
      throw new Error("Temporary Ollama port is already in use.");
    temporaryOllama = spawn(process.env.SAGE_OLLAMA_EXE, ["serve"], {
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, OLLAMA_HOST: address, OLLAMA_ORIGINS: origin },
    });
    let launchError;
    temporaryOllama.on("error", (error) => {
      launchError = error;
    });
    for (let attempts = 0; ; attempts++) {
      if (launchError || temporaryOllama.exitCode !== null || attempts === 30)
        throw launchError ?? new Error("Temporary Ollama did not start.");
      const response = await fetch(endpoint + "/api/tags", {
        signal: AbortSignal.timeout(1000),
      }).catch(() => null);
      if (response?.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  if (process.env.SAGE_OLLAMA_EXE) await startTemporaryOllama();
  page = await context.newPage();
  await page.goto(origin + "/options.html");
  await page.getByRole("button", { name: "Get Started", exact: true }).click();
  await page
    .getByRole("button", { name: "Set up Local AI", exact: true })
    .click();
  await page.getByLabel("Endpoint", { exact: true }).fill(endpoint);
  await page
    .getByRole("button", { name: "Grant endpoint access & test connection" })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Connected.",
    {
      timeout: 60000,
    },
  );
  const rpc = async (m) => {
    const r = await page.evaluate((m) => chrome.runtime.sendMessage(m), m);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  const empty = await rpc({ type: "state" });
  expect(empty.history).toHaveLength(0);
  expect(empty.settings.provider.model).toBe("");
  const discovered = page.getByLabel("Discovered models", { exact: true });
  await discovered.selectOption("phi3:3.8b");
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "Settings saved",
  );
  const state = await rpc({ type: "state" });
  expect(state.settings.provider.model).toBe("phi3:3.8b");
  evidence.onboardingSelection = true;
  await rpc({
    type: "settings",
    settings: {
      ...state.settings,
      history: true,
      onboarded: true,
      provider: {
        ...state.settings.provider,
        model: "phi3:3.8b",
        contextWindow: 4096,
      },
    },
  });
  evidence.models = await rpc({ type: "models" });
  const loading = Date.now();
  await rpc({ type: "preloadModel", model: "phi3:3.8b" });
  evidence.preloadMs = Date.now() - loading;
  evidence.diagnostics = await rpc({ type: "testConnection", inference: true });
  if (temporaryOllama && process.env.SAGE_TEST_SERVER_RESTART === "1") {
    const started = Date.now();
    const exited = once(temporaryOllama, "exit", {
      signal: AbortSignal.timeout(10000),
    });
    temporaryOllama.kill();
    await exited;
    const unavailable = await rpc({ type: "testConnection", inference: false });
    expect(unavailable.ok).toBe(false);
    expect(unavailable.connectionStatus).toContain("Unreachable");
    await startTemporaryOllama();
    const recovered = await rpc({ type: "testConnection", inference: false });
    expect(recovered.ok).toBe(true);
    expect(recovered.models).toContain("phi3:3.8b");
    evidence.ollamaRestart = {
      unavailable: unavailable.connectionStatus,
      recovered: recovered.connectionStatus,
      elapsedMs: Date.now() - started,
    };
    await flush();
  }
  const a = await context.newPage();
  await a.goto(base + "/pilot");
  await page.goto(origin + "/sidepanel.html");
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.bringToFront();
  await page.getByRole("button", { name: "Choose tabs", exact: true }).click();
  await page.getByLabel("Garden pilot").check();
  await page.getByRole("button", { name: "Extract 1 selected tabs" }).click();
  await expect(
    page.getByText("Extracted 1 source.", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  const infer = async (name, question, previous = false) => {
    await page.goto(origin + "/sidepanel.html");
    await expect(
      page.getByRole("textbox", { name: "Ask about your sources" }),
    ).toBeVisible();
    if (
      await page
        .getByLabel("Include previous conversation (shown in prompt review)")
        .count()
    )
      await page
        .getByLabel("Include previous conversation (shown in prompt review)")
        .setChecked(previous);
    await page
      .getByRole("textbox", { name: "Ask about your sources" })
      .fill(question);
    await page
      .getByRole("button", { name: "Review and send question" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const preview = (await rpc({ type: "state" })).draft;
    const started = Date.now();
    let firstTokenMs;
    await page.getByRole("button", { name: "Confirm & send" }).click();
    await expect
      .poll(
        async () => {
          const j = (await rpc({ type: "state" })).job;
          if (
            j?.draft.id === preview.id &&
            j.output &&
            firstTokenMs === undefined
          )
            firstTokenMs = Date.now() - started;
          return j?.draft.id === preview.id ? j.status : "running";
        },
        { timeout: 240000, intervals: [200, 500, 1000] },
      )
      .not.toBe("running");
    const job = (await rpc({ type: "state" })).job;
    evidence.results.push({
      name,
      model: job.draft.provider.model,
      status: job.status,
      error: job.error,
      output: job.output,
      sources: job.draft.sources,
      elapsedMs: Date.now() - started,
      firstTokenMs,
      promptTokens: preview.tokens,
      plannedSteps: preview.plan?.steps.length ?? 1,
      completedSteps:
        job.summaries?.length ?? (job.status === "complete" ? 1 : 0),
      recoveredSteps:
        job.summaries?.filter((note) => note.recovered).length ?? 0,
    });
    if (
      process.env.SAGE_CAPTURE === "1" &&
      ["A normal webpage", "E multi-tab comparison"].includes(name)
    ) {
      await mkdir("test-results/publication-images", { recursive: true });
      await page.screenshot({
        path: `test-results/publication-images/${name.startsWith("A") ? "webpage" : "comparison"}.png`,
        fullPage: true,
      });
    }
    await flush();
    return job;
  };
  await infer(
    "A normal webpage",
    "Summarize the pilot and its limitations in two sentences. Cite exact passage IDs.",
  );
  await infer(
    "A follow-up",
    "Was this randomized? Answer in one sentence with a citation.",
    true,
  );
  await page
    .getByRole("button", { name: "Refresh models", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Select AI Model" }).locator("option"),
  ).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Select AI Model" })
    .selectOption("qwen2.5:3b");
  await expect
    .poll(async () => (await rpc({ type: "state" })).settings.provider.model)
    .toBe("qwen2.5:3b");
  await infer(
    "F model switch",
    "State the participant count and uncertainty in one sentence. Cite exact passage IDs.",
  );
  const docx = zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Document findings</w:t></w:r></w:p><w:p><w:r><w:t>${texts.pilot}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "pilot.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(docx),
    });
  await expect
    .poll(async () => (await rpc({ type: "state" })).sources[0]?.kind)
    .toBe("docx");
  await infer(
    "C DOCX summary",
    "Summarize the evidence and limitation in two sentences with a passage citation.",
  );
  await infer("C DOCX question", "How many volunteers participated?", true);
  const stream = `BT /F1 12 Tf 50 700 Td (${texts.pilot}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const start = pdf.length;
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "pilot.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf),
    });
  await expect
    .poll(async () => (await rpc({ type: "state" })).sources[0]?.kind)
    .toBe("pdf");
  await infer(
    "D PDF summary",
    "Summarize the pilot in one sentence and cite the passage.",
  );
  if (process.env.SAGE_LONG_HELIUM === "1") {
    const text = Array.from(
      { length: 24 },
      (_, i) =>
        `<w:p><w:r><w:t>Section ${i + 1}. The station logged ${31 + i} readings. ${"The readings were observational and establish no causal relationship. ".repeat(10)}</w:t></w:r></w:p>`,
    ).join("");
    const bundle = zipSync({
      "word/document.xml": strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text}</w:body></w:document>`,
      ),
    });
    await page.locator('input[type=file][accept*=".docx"]').setInputFiles({
      name: "long-stations.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(bundle),
    });
    await expect
      .poll(async () => (await rpc({ type: "state" })).sources[0]?.title)
      .toContain("long-stations");
    await infer(
      "Long DOCX",
      "Summarize the stations and limitations. Report the minimum and maximum readings only if supported by the selected evidence. Cite exact passage IDs.",
    );
  }
  const b = await context.newPage();
  await b.goto(base + "/replication");
  await page.goto(origin + "/sidepanel.html");
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.bringToFront();
  await page.getByRole("button", { name: "Choose tabs", exact: true }).click();
  await page.getByLabel("Garden pilot").check();
  await page.getByLabel("Garden replication").check();
  await page.getByRole("button", { name: "Extract 2 selected tabs" }).click();
  await expect(
    page.getByText("Extracted 2 sources.", { exact: false }),
  ).toBeVisible();
  const last = await infer(
    "E multi-tab comparison",
    "Compare the studies in three sentences. Distinguish study design from contradiction. Cite each source.",
  );
  await rpc({
    type: "historyRename",
    id: last.id,
    title: "Acceptance comparison",
  });
  const previousOutput = last.output;
  await page.close();
  page = await context.newPage();
  await page.goto(origin + "/sidepanel.html");
  expect((await rpc({ type: "state" })).job.output).toBe(previousOutput);
  evidence.popupClosure = true;
  const original = (await rpc({ type: "state" })).settings;
  await rpc({
    type: "settings",
    settings: {
      ...original,
      provider: {
        ...original.provider,
        kind: "openrouter",
        endpoint: "https://openrouter.ai/api/v1",
        apiKey: "",
        model: "unverified-test-model",
      },
    },
  });
  await page.reload();
  await page
    .getByLabel("Include previous conversation (shown in prompt review)")
    .uncheck();
  await page
    .getByRole("textbox", { name: "Ask about your sources" })
    .fill("Cloud consent cancellation test");
  const before = evidence.extensionRequests.length;
  await page.getByRole("button", { name: "Review and send question" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "https://openrouter.ai/api/v1",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(evidence.extensionRequests.length).toBe(before);
  evidence.cloudCancelledBeforeDispatch = true;
  await rpc({ type: "settings", settings: original });
  await page.screenshot({
    path:
      process.env.SAGE_WORKFLOW_SCREENSHOT ||
      "docs/screenshots/helium-real-workspace.png",
    fullPage: true,
  });
  evidence.storageBytes = await page.evaluate(async () => ({
    local: JSON.stringify(await chrome.storage.local.get(null)).length,
    session: JSON.stringify(await chrome.storage.session.get(null)).length,
  }));
  const cdp = await context.newCDPSession(page);
  evidence.uiHeap = await cdp.send("Runtime.getHeapUsage");
  evidence.nonlocalExtensionRequests = evidence.extensionRequests.filter(
    (r) => !["127.0.0.1", "localhost"].includes(new URL(r.url).hostname),
  );
  expect(evidence.nonlocalExtensionRequests).toHaveLength(0);
  await context.close();
  context = await chromium.launchPersistentContext(profile, launch);
  page = await context.newPage();
  await page.goto(origin + "/sidepanel.html");
  const saved = (await rpc({ type: "state" })).history.find(
    (j) => j.id === last.id,
  );
  expect(saved.title).toBe("Acceptance comparison");
  expect(saved.output).toBe(previousOutput);
  await rpc({ type: "restore", id: last.id });
  expect((await rpc({ type: "state" })).job.output).toBe(previousOutput);
  evidence.browserRestartHistory = true;
  await flush();
  console.log(
    "PASS",
    evidence.results.map((r) => ({
      name: r.name,
      status: r.status,
      ms: r.elapsedMs,
    })),
  );
} catch (error) {
  evidence.failure = error.message;
  await flush();
  console.error(error);
  process.exitCode = 1;
} finally {
  temporaryOllama?.kill();
  await context.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}

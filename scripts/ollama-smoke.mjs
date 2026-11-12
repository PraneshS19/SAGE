import { writeFile, mkdir } from "node:fs/promises";
import process from "node:process";
const started = Date.now();
const tags = await fetch("http://localhost:11434/api/tags").then((r) =>
  r.json(),
);
const model =
  process.env.SAGE_MODEL ||
  tags.models.find((m) => m.capabilities?.includes("completion"))?.name;
if (!model)
  throw new Error(
    "No installed chat model is available. Install one yourself or set SAGE_MODEL to an installed model. SAGE does not download models.",
  );
const response = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: "Summarize only the supplied source in one sentence.",
      },
      {
        role: "user",
        content:
          "Source: SAGE is a browser extension. It connects directly to a local inference server. History is disabled by default.",
      },
    ],
    stream: false,
    options: { num_predict: 80, num_ctx: 2048 },
  }),
  signal: AbortSignal.timeout(180000),
});
if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
const result = await response.json();
if (!result.message?.content) throw new Error("No real model output.");
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/ollama-smoke.json",
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      model,
      endpoint: "http://localhost:11434",
      elapsedMs: Date.now() - started,
      output: result.message.content,
      done: result.done,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    model,
    elapsedMs: Date.now() - started,
    output: result.message.content,
  }),
);

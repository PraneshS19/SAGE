import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import {
  generate,
  models,
  modelsDetail,
  preloadModel,
  decodeStream,
  httpError,
  testConnection,
  buildHttpError,
  sanitizeError,
} from "../../src/lib/provider";
import { defaults, type Provider } from "../../src/lib/schema";
let server: Server;
let base: string;
let received: unknown;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          models: [
            {
              name: "chat",
              size: 4000000000,
              details: {
                parameter_size: "3.8B",
                quantization_level: "Q4_K_M",
                family: "phi3",
              },
              capabilities: ["completion"],
            },
            { name: "embed", capabilities: ["embedding"] },
          ],
        }),
      );
      return;
    }
    if (req.url === "/api/ps") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          models: [{ name: "chat", size_vram: 2500000000 }],
        }),
      );
      return;
    }
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "chat" }] }));
      return;
    }
    if (req.url === "/denied/chat/completions") {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.url === "/ratelimit/chat/completions") {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "45",
        "X-RateLimit-Limit": "20",
        "X-RateLimit-Remaining": "0",
      });
      res.end(
        JSON.stringify({
          error: {
            message:
              "Rate limit exceeded: limit_rpm/google/gemma-4-31b-it:free",
            code: 429,
          },
        }),
      );
      return;
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      received = JSON.parse(raw);
      const ollama = req.url === "/api/chat";
      if (
        ollama &&
        typeof received === "object" &&
        received !== null &&
        Array.isArray((received as { messages?: unknown[] }).messages) &&
        (received as { messages: unknown[] }).messages.length === 0
      ) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ done: true, done_reason: "load" }));
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      const frames = ollama
        ? [
            JSON.stringify({ message: { content: "Actual " } }) + "\n",
            JSON.stringify({ message: { content: "stream" }, done: true }) +
              "\n",
          ]
        : [
            'data: {"choices":[{"delta":{"content":"Actual "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"stream"}}]}\n\ndata: [DONE]\n\n',
          ];
      res.write(frames[0]);
      setTimeout(() => res.end(frames[1]), 25);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No address");
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
);
it("discovers native Ollama chat models and filters embeddings", async () =>
  expect(await models({ ...defaults.provider, endpoint: base })).toEqual([
    "chat",
  ]));
it("discovers compatible API models", async () =>
  expect(
    await models({
      ...defaults.provider,
      kind: "custom",
      endpoint: base + "/v1",
    }),
  ).toEqual(["chat"]));
it.each(["ollama", "custom"] as const)(
  "streams %s via a real controlled HTTP server",
  async (kind) => {
    let text = "";
    const p: Provider = {
      ...defaults.provider,
      kind,
      endpoint: base + (kind === "custom" ? "/v1" : ""),
      model: "chat",
    };
    await generate(
      p,
      [{ role: "user", content: "Question" }],
      new AbortController().signal,
      async (token) => {
        text += token;
      },
    );
    expect(text).toBe("Actual stream");
    expect(received).toMatchObject({
      stream: true,
      messages: [{ role: "system" }, { role: "user" }],
    });
  },
);
it("maps HTTP failures without reflecting secrets", async () => {
  await expect(
    generate(
      {
        ...defaults.provider,
        kind: "custom",
        endpoint: base + "/denied",
        model: "chat",
        apiKey: "private",
      },
      [],
      new AbortController().signal,
      async () => {},
    ),
  ).rejects.toThrow("Invalid API key");
  expect(httpError(429).message).toContain("Rate limit");
  expect(httpError(402).message).toContain("credits");
});
it("cancels an active fetch stream", async () => {
  const controller = new AbortController();
  await expect(
    generate(
      { ...defaults.provider, endpoint: base, model: "chat" },
      [],
      controller.signal,
      async () => controller.abort(),
    ),
  ).rejects.toThrow();
});
it("handles fragmented UTF-8 and SSE frames", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\n',
  );
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 2)
        c.enqueue(bytes.slice(i, i + 2));
      c.close();
    },
  });
  let out = "";
  for await (const text of decodeStream(
    stream,
    false,
    new AbortController().signal,
  ))
    out += text;
  expect(out).toBe("你好");
});
it("detects premature stream closure", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(
        new TextEncoder().encode('{"message":{"content":"Partial"}}\n'),
      );
      c.close();
    },
  });
  await expect(
    (async () => {
      for await (const _token of decodeStream(
        body,
        true,
        new AbortController().signal,
      )) {
        expect(typeof _token).toBe("string");
      }
    })(),
  ).rejects.toThrow("before completion");
});
it("provides Ollama-specific origin and model error diagnostics", () => {
  const ollamaErr = httpError(403, defaults.provider);
  expect(ollamaErr.message).toContain("Ollama refused this extension origin");
  expect(ollamaErr.message).toContain("OLLAMA_ORIGINS");

  const notFoundErr = httpError(404, defaults.provider);
  expect(notFoundErr.message).toContain("Ollama model or endpoint not found");
});
it("runs 6-step testConnection diagnostic report successfully", async () => {
  const p: Provider = {
    ...defaults.provider,
    endpoint: base,
    model: "chat",
  };
  const report = await testConnection(p);
  expect(report.ok).toBe(true);
  expect(report.models).toContain("chat");
  expect(report.steps.length).toBeGreaterThanOrEqual(5);
  expect(report.steps.every((s) => s.status === "pass")).toBe(true);
  expect(report.summary).toContain("All 6 checks passed");
});
it("detects missing model in testConnection diagnostic report", async () => {
  const p: Provider = {
    ...defaults.provider,
    endpoint: base,
    model: "non-existent-model",
  };
  const report = await testConnection(p);
  expect(report.ok).toBe(false);
  expect(report.summary).toContain("not installed in Ollama");
  const modelStep = report.steps.find((s) => s.name === "Selected Model");
  expect(modelStep?.status).toBe("fail");
});
it("retrieves enriched model details and marks in-memory status", async () => {
  const p: Provider = {
    ...defaults.provider,
    endpoint: base,
  };
  const detailed = await modelsDetail(p);
  expect(detailed).toHaveLength(1);
  const m = detailed[0];
  expect(m).toBeDefined();
  if (!m) return;
  expect(m.id).toBe("chat");
  expect(m.parameterSize).toBe("3.8B");
  expect(m.quantization).toBe("Q4_K_M");
  expect(m.family).toBe("phi3");
  expect(m.isLoaded).toBe(true);
  expect(m.vramFormatted).toBeDefined();
  expect(m.sizeFormatted).toBeDefined();
});
it("preloads a model via native Ollama API", async () => {
  const p: Provider = {
    ...defaults.provider,
    endpoint: base,
  };
  const res = await preloadModel(p, "chat");
  expect(res.ok).toBe(true);
  expect(res.durationMs).toBeGreaterThanOrEqual(0);
});

it("handles live HTTP 429 rate limit with Retry-After and actionable message", async () => {
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    endpoint: base + "/ratelimit",
    model: "google/gemma-4-31b-it:free",
  };
  let thrownError: unknown;
  try {
    await generate(p, [], new AbortController().signal, async () => {});
  } catch (err) {
    thrownError = err;
  }
  expect(thrownError).toBeDefined();
  const err = thrownError as {
    message: string;
    rateLimit?: { retryAfterSeconds?: number; limitType?: string };
  };
  expect(err.message).toContain("Provider reported a per-minute rate limit");
  expect(err.message).toContain("45s");
  expect(err.message).toContain("cooldown countdown");
  expect(err.rateLimit?.retryAfterSeconds).toBe(45);
  expect(err.rateLimit?.limitType).toBe("per_minute");
});

it("distinguishes OpenRouter account-level daily quota exhaustion (limit_rpd)", async () => {
  const mockRes = new Response(
    JSON.stringify({
      error: {
        message:
          "Rate limit exceeded: limit_rpd/google/gemma-4-31b-it:free/uuid-123",
        code: 429,
        metadata: {
          headers: {
            "X-RateLimit-Limit": "50",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": "1741305600000",
          },
        },
      },
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    },
  );
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    model: "google/gemma-4-31b-it:free",
  };
  const err = await buildHttpError(mockRes, p);
  expect(err.code).toBe("429");
  expect(err.rateLimit?.limitType).toBe("daily_quota");
  expect(err.message).toContain("Provider reported a daily quota limit");
  expect(err.message).not.toContain("50 requests/day");
  expect(err.message).not.toContain("$10+ lifetime credits");
  expect(err.message).toContain("local Ollama");
});

it("distinguishes OpenRouter upstream provider capacity exhaustion", async () => {
  const mockRes = new Response(
    JSON.stringify({
      error: {
        message: "Provider returned 429: upstream capacity exceeded",
        code: 429,
        metadata: {
          provider_name: "Google",
        },
      },
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    },
  );
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    model: "google/gemma-4-31b-it:free",
  };
  const err = await buildHttpError(mockRes, p);
  expect(err.code).toBe("429");
  expect(err.rateLimit?.limitType).toBe("upstream_capacity");
  expect(err.message).toContain("Provider reported upstream overload");
  expect(err.message).toContain("Google");
  expect(err.message).toContain("does not rule out account limits");
});

it("handles HTTP 429 missing Retry-After gracefully", async () => {
  const mockRes = new Response(
    JSON.stringify({
      error: {
        message: "Too many requests",
      },
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    },
  );
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    model: "google/gemma-4-31b-it:free",
  };
  const err = await buildHttpError(mockRes, p);
  expect(err.code).toBe("429");
  expect(err.rateLimit?.retryAfterSeconds).toBeUndefined();
  expect(err.message).toContain("Rate limit exceeded");
  expect(err.message).toContain("Next step");
});

it("handles HTTP 401 with actionable credentials guidance for OpenRouter", async () => {
  const mockRes = new Response(
    JSON.stringify({
      error: { message: "Invalid API key" },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    model: "google/gemma-4-31b-it:free",
  };
  const err = await buildHttpError(mockRes, p);
  expect(err.code).toBe("401");
  expect(err.message).toContain("Invalid OpenRouter API key");
  expect(err.message).toContain("openrouter.ai/keys");
});

it("handles HTTP 402 with actionable credit and free model guidance", async () => {
  const mockRes = new Response(
    JSON.stringify({
      error: { message: "Insufficient credits" },
    }),
    {
      status: 402,
      headers: { "Content-Type": "application/json" },
    },
  );
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    model: "google/gemma-4-31b-it:free",
  };
  const err = await buildHttpError(mockRes, p);
  expect(err.code).toBe("402");
  expect(err.message).toContain("HTTP 402");
  expect(err.message).toContain("cannot determine the account balance");
  expect(err.message).toContain("openrouter.ai/credits");
});

it("handles HTTP 503 provider capacity overload", async () => {
  const mockRes = new Response(
    JSON.stringify({
      error: {
        message:
          "No available providers for this model right now. Provider capacity overloaded.",
      },
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
  const p: Provider = {
    ...defaults.provider,
    kind: "openrouter",
    model: "google/gemma-4-31b-it:free",
  };
  const err = await buildHttpError(mockRes, p);
  expect(err.code).toBe("503");
  expect(err.rateLimit?.limitType).toBe("upstream_capacity");
  expect(err.message).toContain("Upstream provider overloaded");
});

it("sanitizes error messages to protect API keys and bearer tokens", () => {
  const privateKey = "sk-or-v1-abcdef1234567890abcdef1234567890";
  const raw = `Failed request for ${privateKey} with Bearer ${privateKey}`;
  const cleaned = sanitizeError(raw, privateKey);
  expect(cleaned).not.toContain(privateKey);
  expect(cleaned).toContain("[REDACTED");
});

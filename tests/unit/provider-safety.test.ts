import { it, expect, vi, afterEach } from "vitest";
import {
  buildHttpError,
  generate,
  openRouterKeyInfo,
  testConnection,
} from "../../src/lib/provider";
import { defaults } from "../../src/lib/schema";
afterEach(() => vi.unstubAllGlobals());
it("redacts custom credentials from diagnostic streaming errors", async () => {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ++calls === 1
        ? new Response('{"data":[{"id":"chat"}]}')
        : new Response(
            'data: {"error":{"message":"private-diagnostic-key"}}\n\n',
          ),
    ),
  );
  const report = await testConnection(
    {
      ...defaults.provider,
      kind: "custom",
      endpoint: "https://provider.example/v1",
      model: "chat",
      apiKey: "private-diagnostic-key",
    },
    true,
  );
  expect(report.ok).toBe(false);
  expect(JSON.stringify(report)).not.toContain("private-diagnostic-key");
  expect(report.summary).toContain("REDACTED");
});
it("accepts a genuine non-streaming JSON completion but rejects an empty completed stream", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: "Actual answer" }, finish_reason: "stop" },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    ),
  );
  let output = "";
  await generate(
    { ...defaults.provider, kind: "custom", model: "chat" },
    [],
    new AbortController().signal,
    async (t) => {
      output += t;
    },
  );
  expect(output).toBe("Actual answer");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"done":true}\n')),
  );
  await expect(
    generate(
      { ...defaults.provider, model: "chat" },
      [],
      new AbortController().signal,
      async () => {},
    ),
  ).rejects.toThrow("no answer text");
});
it("cloud diagnostics do not generate without explicit inference consent", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [{ id: "model" }] }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await testConnection(
    {
      ...defaults.provider,
      kind: "openrouter",
      endpoint: "https://openrouter.ai/api/v1",
      model: "model",
    },
    false,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]).toBeDefined();
});
it("a custom or mislabeled provider cannot redirect key diagnostics to OpenRouter", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    await openRouterKeyInfo({
      ...defaults.provider,
      kind: "openrouter",
      endpoint: "https://other.example/api/v1",
      apiKey: "secret",
    }),
  ).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("Retry-After alone does not establish a per-minute or daily account quota", async () => {
  const error = await buildHttpError(
    new Response('{"error":{"message":"Too many requests"}}', {
      status: 429,
      headers: { "Retry-After": "45" },
    }),
    defaults.provider,
  );
  expect(error.rateLimit?.limitType).toBe("general");
  expect(error.rateLimit?.retryAfterSeconds).toBe(45);
  expect(error.message).not.toContain("20 requests");
});
it("redacts the configured credential from provider streaming errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          'data: {"error":{"message":"bad custom-secret-value"}}\n\n',
          { status: 200 },
        ),
    ),
  );
  await expect(
    generate(
      {
        ...defaults.provider,
        kind: "custom",
        endpoint: "https://provider.example/v1",
        apiKey: "custom-secret-value",
        model: "test-model",
      },
      [],
      new AbortController().signal,
      async () => {},
    ),
  ).rejects.toThrow("[REDACTED_API_KEY]");
});
it("does not report empty diagnostic inference as a pass", async () => {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ++calls === 1
        ? new Response('{"data":[{"id":"chat"}]}')
        : new Response("data: [DONE]\n\n"),
    ),
  );
  const report = await testConnection(
    {
      ...defaults.provider,
      kind: "custom",
      endpoint: "https://provider.example/v1",
      model: "chat",
    },
    true,
  );
  expect(report.ok).toBe(false);
  expect(report.inferenceStatus).toContain("no answer text");
});
it("does not echo malformed JSON containing a credential in diagnostics", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("private-json-credential invalid JSON")),
  );
  const report = await testConnection(
    {
      ...defaults.provider,
      kind: "custom",
      endpoint: "https://provider.example/v1",
      apiKey: "private-json-credential",
    },
    false,
  );
  expect(report.ok).toBe(false);
  expect(JSON.stringify(report)).not.toContain("private-json-credential");
  expect(JSON.stringify(report)).toContain("invalid JSON");
});

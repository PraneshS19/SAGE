import { afterEach, expect, it, vi } from "vitest";
import { defaults, type Source } from "../../src/lib/schema";
import { passages, references } from "../../src/lib/context";
import { prepareResearch } from "../../src/lib/processing";
import {
  effectiveCapabilities,
  modelIdentity,
} from "../../src/lib/inference-config";
import {
  discoverCapabilities,
  inferenceAdapter,
  inferenceWarnings,
} from "../../src/lib/inference-adapters";
import { selectModel, modelProfile } from "../../src/lib/model-profiles";
import { generate } from "../../src/lib/provider";
afterEach(() => vi.unstubAllGlobals());
const source: Source = {
  id: "s-adaptive",
  title: "Evidence",
  url: "https://example.org",
  kind: "page",
  passages: passages(
    Array.from(
      { length: 160 },
      (_, i) =>
        `Section ${i}: observed ${i + 40} participants. ` +
        "Measurements are preliminary and do not establish causation. ".repeat(
          12,
        ),
    ).join("\n\n"),
    "s-adaptive",
  ),
};
it("uses the effective 4K, 32K and 128K windows without model-name branches", () => {
  const plans = [4096, 32768, 131072].map((contextWindow) =>
    prepareResearch(
      [source],
      "Summarize",
      { ...defaults.provider, model: crypto.randomUUID(), contextWindow },
      [],
      true,
    ),
  );
  expect(plans[0]!.plan).toBeDefined();
  expect(plans[1]!.plan).toBeDefined();
  expect(
    plans[1]!.plan!.steps.filter((s) => s.kind === "map").length,
  ).toBeLessThan(plans[0]!.plan!.steps.filter((s) => s.kind === "map").length);
  expect(plans[2]!.plan).toBeUndefined();
  for (const draft of plans) {
    const caps = effectiveCapabilities(draft.provider);
    expect(draft.tokens).toBeLessThanOrEqual(caps.context);
    for (const step of draft.plan?.steps ?? [])
      expect(step.inputTokenUpperBound + step.outputTokens).toBeLessThanOrEqual(
        caps.context,
      );
    expect(
      references(
        `[${source.passages[0]!.id}] [invented-p1]`,
        draft.sources,
      ).map((r) => !!r.passage),
    ).toEqual([true, false]);
  }
});
it("retains per-model settings and restores them on switching without inheriting a large window", () => {
  const large = {
    ...defaults.provider,
    model: "arbitrary-large",
    contextWindow: 131072,
    inference: { outputTokens: 12000 },
  };
  const settings = {
    ...defaults,
    provider: large,
    modelProfiles: { [modelIdentity(large)]: modelProfile(large) },
  };
  const small = selectModel(settings, "arbitrary-small");
  expect(small.contextWindow).toBe(4096);
  expect(small.inference).toBeUndefined();
  expect(selectModel({ ...settings, provider: small }, large.model)).toEqual(
    large,
  );
});
it("does not mistake advertised capacity or stale metadata for effective runtime configuration", () => {
  const p = { ...defaults.provider, model: "unknown", contextWindow: 4096 };
  const caps = {
    identity: modelIdentity(p),
    observedAt: 0,
    advertisedContext: 131072,
    runtimeContext: 4096,
    streaming: "supported",
    reasoning: "unknown",
    structuredOutput: "unknown",
    tools: "unknown",
    notes: [],
  } as const;
  expect(
    effectiveCapabilities({ ...p, capabilities: { ...caps, notes: [] } })
      .context,
  ).toBe(4096);
  expect(
    effectiveCapabilities({
      ...p,
      contextWindow: 262144,
      capabilities: { ...caps, notes: [] },
    }).context,
  ).toBe(131072);
  expect(
    effectiveCapabilities({
      ...p,
      contextWindow: 262144,
      capabilities: { ...caps, identity: "other", notes: [] },
    }).context,
  ).toBe(262144);
});
it("reserves output capacity and rejects impossible configurations before dispatch", () => {
  expect(() =>
    effectiveCapabilities({
      ...defaults.provider,
      inference: { outputTokens: 4000, safetyTokens: 256 },
    }),
  ).toThrow("leave no input");
  const large = effectiveCapabilities({
    ...defaults.provider,
    contextWindow: 131072,
  });
  expect(large.outputTokens).toBeGreaterThan(1024);
  expect(large.noteTokens).toBeGreaterThan(512);
});
it("discovers native advertised and observed runtime capacity separately", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/api/show")
              ? {
                  model_info: {
                    "general.architecture": "test",
                    "test.context_length": 131072,
                  },
                  capabilities: ["completion", "thinking", "tools"],
                }
              : { models: [{ name: "opaque-tag", context_length: 32768 }] },
          ),
        ),
    ),
  );
  const p = { ...defaults.provider, model: "opaque-tag" };
  const caps = await discoverCapabilities(p);
  expect(caps.advertisedContext).toBe(131072);
  expect(caps.runtimeContext).toBe(32768);
  expect(caps.reasoning).toBe("supported");
});
it("handles absent metadata without inventing capabilities", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const caps = await discoverCapabilities({
    ...defaults.provider,
    model: "new-model",
  });
  expect(caps.advertisedContext).toBeUndefined();
  expect(caps.reasoning).toBe("unknown");
  expect(caps.notes.length).toBeGreaterThan(0);
});
it("discovers compatible model properties and sends only supported optional parameters", async () => {
  const p = {
    ...defaults.provider,
    kind: "openrouter" as const,
    endpoint: "https://openrouter.ai/api/v1",
    model: "provider/opaque-model",
    contextWindow: 131072,
    inference: {
      temperature: 0.3,
      topP: 0.9,
      reasoningEffort: "high" as const,
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: p.model,
                context_length: 131072,
                top_provider: { max_completion_tokens: 24000 },
                supported_parameters: ["reasoning", "temperature"],
              },
            ],
          }),
        ),
    ),
  );
  const provider = { ...p, capabilities: await discoverCapabilities(p) };
  const body = inferenceAdapter(provider).request(provider, [], 12000);
  expect(body.reasoning).toEqual({ effort: "high" });
  expect(body.temperature).toBe(0.3);
  expect(body.top_p).toBeUndefined();
  expect(inferenceWarnings(provider).join()).toContain("top_p");
});
it.each([true, false])(
  "keeps reasoning separate and preserves bound continuation (stream=%s)",
  async (stream) => {
    const p = {
      ...defaults.provider,
      kind: "custom" as const,
      endpoint: "https://example.org/v1",
      model: "any-reasoner",
      inference: {
        streaming: stream,
        outputParameter: "max_completion_tokens" as const,
      },
    };
    const message = {
      content: "Final answer",
      reasoning_content: "private analysis",
      reasoning_details: [
        { type: "reasoning.encrypted", data: "opaque-signature", index: 0 },
      ],
    };
    const fetch = vi.fn(
      async () =>
        new Response(
          stream
            ? `data: ${JSON.stringify({ choices: [{ delta: message, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`
            : JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }),
          {
            headers: {
              "content-type": stream ? "text/event-stream" : "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    let text = "";
    const continuation = await generate(
      p,
      [],
      new AbortController().signal,
      async (t) => {
        text += t;
      },
    );
    expect(text).toBe("Final answer");
    expect(continuation.reasoningDetails?.[0]?.data).toBe("opaque-signature");
    const body = inferenceAdapter(p).request(
      p,
      [{ role: "assistant", content: text, continuation } as never],
      1000,
    );
    expect(JSON.stringify(body)).toContain("opaque-signature");
    expect(JSON.stringify(body)).not.toContain("private analysis");
    expect(
      JSON.stringify(
        inferenceAdapter({ ...p, model: "different" }).request(
          { ...p, model: "different" },
          [{ role: "assistant", content: text, continuation } as never],
          1000,
        ),
      ),
    ).not.toContain("opaque-signature");
  },
);

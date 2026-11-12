import { it, expect } from "vitest";
it("stops synthesis when an intermediate result is visibly truncated", async () => {
  const draft = prepareResearch([source], "Summarize", provider, [], true);
  let calls = 0;
  await expect(
    executePlan(
      draft,
      new AbortController().signal,
      async (_messages, _signal, emit) => {
        calls++;
        await emit(
          "Partial notes [Output stopped at the configured token limit and may be incomplete.]",
        );
      },
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow("incomplete notes");
  expect(calls).toBe(1);
});
import { defaults, type Source } from "../../src/lib/schema";
import { passages, references } from "../../src/lib/context";
import {
  prepareResearch,
  executePlan,
  requestTokens,
  stepMessages,
} from "../../src/lib/processing";
const source: Source = {
  id: "s-long",
  title: "Long research",
  url: "https://example.org/research",
  kind: "page",
  passages: passages(
    Array.from(
      { length: 25 },
      (_, i) =>
        `## Section ${i + 1}\n\n` +
        "A controlled study reported 42 participants, a 12% improvement, and substantial uncertainty. ".repeat(
          12,
        ),
    ).join("\n\n"),
    "s-long",
  ),
};
const provider = { ...defaults.provider, contextWindow: 4096 };
it("resumes a failed plan without repeating completed requests", async () => {
  const draft = prepareResearch([source], "Summarize", provider, [], true);
  let saved: import("../../src/lib/schema").SummaryArtifact[] = [];
  let calls = 0;
  await expect(
    executePlan(
      draft,
      new AbortController().signal,
      async (_m, _s, emit) => {
        if (++calls === 2) throw new Error("temporary failure");
        await emit("Evidence notes");
      },
      async (_step, notes) => {
        saved = structuredClone(notes);
      },
      async () => {},
    ),
  ).rejects.toThrow("temporary failure");
  expect(saved).toHaveLength(1);
  calls = 0;
  await executePlan(
    { ...draft, resume: saved },
    new AbortController().signal,
    async (_m, _s, emit) => {
      calls++;
      await emit("Evidence notes");
    },
    async () => {},
    async () => {},
  );
  expect(calls).toBe(draft.plan!.steps.length - 1);
});
it("plans a bounded source-complete map/synthesis sequence within runtime budget", () => {
  const draft = prepareResearch(
    [source],
    "Summarize the study.",
    provider,
    [],
    true,
  );
  expect(draft.plan).toBeDefined();
  expect(draft.plan!.steps.length).toBeGreaterThan(2);
  expect(draft.plan!.steps.length).toBeLessThanOrEqual(23);
  expect(
    draft
      .plan!.steps.filter((s) => s.kind === "map")
      .flatMap((s) => s.passageIds),
  ).toEqual(source.passages.map((p) => p.id));
  expect(
    draft.plan!.steps.every(
      (s) => s.inputTokenUpperBound + s.outputTokens <= 4096,
    ),
  ).toBe(true);
});
it("refuses long content without explicit planning and preserves prior-message boundaries", () => {
  expect(() =>
    prepareResearch([source], "Summarize", provider, [], false),
  ).toThrow("Nothing was sent");
  expect(() =>
    prepareResearch(
      [source],
      "Summarize",
      provider,
      [{ role: "user", content: "Old source" }],
      true,
    ),
  ).toThrow("new conversation");
});
it("runs only planned requests and preserves original passage provenance", async () => {
  const draft = prepareResearch([source], "Summarize", provider, [], true);
  const calls: string[] = [];
  let output = "";
  const notes = await executePlan(
    draft,
    new AbortController().signal,
    async (messages, _signal, emit, outputTokens) => {
      calls.push(messages[0]!.content);
      expect(requestTokens(messages, outputTokens)).toBeLessThanOrEqual(4096);
      await emit(`Study with uncertainty [${source.passages[1]!.id}]`);
    },
    async () => {},
    async (token) => {
      output += token;
    },
  );
  expect(calls).toHaveLength(draft.plan!.steps.length);
  expect(notes.at(-1)?.passageIds).toEqual(source.passages.map((p) => p.id));
  expect(references(output, [source])[0]?.passage).toBeDefined();
});
it("never reintroduces excluded source text into any request template", () => {
  const excluded = source.passages[3]!;
  const selected = {
    ...source,
    passages: source.passages.filter((p) => p.id !== excluded.id),
  };
  const draft = prepareResearch([selected], "Summarize", provider, [], true);
  for (const step of draft.plan!.steps)
    expect(JSON.stringify(stepMessages(draft, step))).not.toContain(
      excluded.id,
    );
});
it("cancels between steps without initiating remaining requests", async () => {
  const draft = prepareResearch([source], "Summarize", provider, [], true);
  const control = new AbortController();
  let calls = 0;
  await expect(
    executePlan(
      draft,
      control.signal,
      async (_m, _s, emit) => {
        calls++;
        await emit("Partial notes");
        control.abort();
      },
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});
it("rejects oversized generated notes before synthesis rather than silently truncating", async () => {
  const draft = prepareResearch([source], "Summarize", provider, [], true);
  let calls = 0;
  await expect(
    executePlan(
      draft,
      new AbortController().signal,
      async (_m, _s, emit) => {
        calls++;
        await emit("x".repeat(2000));
      },
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow("approved size limit");
  expect(calls).toBe(1);
});

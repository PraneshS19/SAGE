import { it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { corpus, corpusPage } from "../fixtures/corpus";
import { extractDocument } from "../../src/lib/extraction";
import { passages } from "../../src/lib/context";
it.each(corpus.filter((c) => c.id !== "empty"))(
  "extracts $id with metadata and cleaned text",
  (item) => {
    const result = extractDocument(
      new JSDOM(corpusPage(item.id), { url: "https://example.org/" + item.id })
        .window.document,
    );
    expect(result.text.length).toBeGreaterThan(10);
    expect(result.metadata?.language).toBe("en");
    expect(result.metadata?.domain).toBe("example.org");
    expect(result.metadata?.wordCount).toBeGreaterThan(0);
    expect(result.text).not.toContain("Unrelated navigation");
    expect(result.text).not.toContain("PRIVATE FORM VALUE");
  },
);
it("retains heading metadata and distinct IDs for similar passages", () => {
  const result = extractDocument(
    new JSDOM(corpusPage("similar"), { url: "https://example.org/similar" })
      .window.document,
  );
  const p = passages(result.text, "s");
  expect(new Set(p.map((x) => x.id)).size).toBe(p.length);
  expect(p.some((p) => p.section === "Group A")).toBe(true);
  expect(p.some((p) => p.section === "Group B")).toBe(true);
});
it("reads a short meaningful page and rejects empty content", () => {
  expect(
    extractDocument(
      new JSDOM("<main>The answer is 42.</main>", {
        url: "https://example.org",
      }).window.document,
    ).text,
  ).toContain("42");
  expect(() =>
    extractDocument(
      new JSDOM(corpusPage("empty"), { url: "https://example.org" }).window
        .document,
    ),
  ).toThrow("too little");
});
it("never invents a timestamp when a transcript segment has none", () => {
  const dom = new JSDOM(
    '<ytd-transcript-segment-renderer><span class="segment-text">Transcript without timestamp</span></ytd-transcript-segment-renderer>',
    { url: "https://www.youtube.com/watch?v=a" },
  );
  expect(() => extractDocument(dom.window.document)).toThrow(
    "Transcript unavailable",
  );
});

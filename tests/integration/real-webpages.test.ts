import { it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { writeFile } from "node:fs/promises";
import { extractDocument } from "../../src/lib/extraction";
it.skipIf(process.env.SAGE_WEB_EVALUATE !== "1")(
  "extracts permitted live documentation, encyclopedia and technical standard pages",
  async () => {
    const urls = [
      "https://developer.mozilla.org/en-US/docs/Web/API/AbortController",
      "https://en.wikipedia.org/wiki/Scientific_method",
      "https://www.rfc-editor.org/rfc/rfc8259.html",
    ];
    const results = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const result = extractDocument(
          new JSDOM(text, { url }).window.document,
        );
        results.push({
          url,
          status: "PASS",
          title: result.title,
          characters: result.text.length,
          metadata: result.metadata,
          headings: result.text.split("\n").filter((l) => /^#{1,6} /.test(l))
            .length,
        });
      } catch (error) {
        results.push({
          url,
          status: "BLOCKED",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await writeFile(
      "docs/real-extraction.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          method:
            "Fetched public HTML without authentication; JSDOM did not execute scripts or fetch subresources. This is extraction verification, not live browser DOM interaction.",
          results,
        },
        null,
        2,
      ),
    );
    expect(
      results.filter((r) => r.status === "PASS").length,
    ).toBeGreaterThanOrEqual(2);
  },
  120000,
);

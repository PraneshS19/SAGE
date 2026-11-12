import { it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { extractDocument } from "../../src/lib/extraction";
it("extracts readable content and tables, removing forms and script payloads", () => {
  const dom = new JSDOM(
    `<html><head><title>Research article</title></head><body><nav>Ignore navigation</nav><main><h1>Research</h1><p>${"This article reports a controlled experiment with limitations. ".repeat(15)}</p><table><tr><th>Group</th><th>Result</th></tr><tr><td>A</td><td>42</td></tr></table><form><textarea>PRIVATE INPUT</textarea></form><script>SECRET_PAYLOAD</script></main></body></html>`,
    { url: "https://example.com/article" },
  );
  const result = extractDocument(dom.window.document);
  expect(result.text).toContain("controlled experiment");
  expect(result.text).toContain("| Group | Result |");
  expect(result.text).not.toContain("PRIVATE INPUT");
  expect(result.text).not.toContain("SECRET_PAYLOAD");
  expect(result.text).not.toContain("Ignore navigation");
});
it("reports empty extraction rather than inventing source text", () => {
  const dom = new JSDOM("<body></body>", { url: "https://example.com" });
  expect(() => extractDocument(dom.window.document)).toThrow("too little");
});
it("reports unavailable transcripts honestly", () => {
  const dom = new JSDOM("<body>Video player</body>", {
    url: "https://www.youtube.com/watch?v=abc",
  });
  expect(() => extractDocument(dom.window.document)).toThrow(
    "Transcript unavailable",
  );
});
it("preserves visible transcript timestamps", () => {
  const dom = new JSDOM(
    '<ytd-transcript-segment-renderer><span class="segment-timestamp">1:23</span><span class="segment-text">An accessible transcript passage.</span></ytd-transcript-segment-renderer>',
    { url: "https://www.youtube.com/watch?v=abc" },
  );
  expect(extractDocument(dom.window.document).segments).toEqual([
    { text: "An accessible transcript passage.", seconds: 83 },
  ]);
});

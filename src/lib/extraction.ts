import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { visibleTranscript } from "../features/youtube";
export interface Extracted {
  title: string;
  url: string;
  text: string;
  kind: "page" | "transcript";
  metadata?: {
    domain: string;
    language?: string;
    method: string;
    wordCount: number;
    extractedAt: number;
    warnings?: string[];
  };
  segments?: { text: string; seconds: number }[];
}
export function extractDocument(doc: Document): Extracted {
  const url = new URL(doc.location.href);
  if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
    const segments = visibleTranscript(doc);
    return {
      title: doc.title,
      url: url.href,
      text: segments.map((s) => s.text).join("\n\n"),
      kind: "transcript",
      segments,
    };
  }
  if (doc.contentType === "application/pdf" || /\.pdf$/i.test(url.pathname))
    throw new Error(
      "Browser PDF viewer access is restricted. Use Import PDF to select the document. Scanned PDFs require OCR, which SAGE does not provide.",
    );
  const clone = doc.cloneNode(true) as Document;
  clone
    .querySelectorAll(
      'svg,script,style,noscript,iframe,form,input,textarea,select,[contenteditable],nav,[role="navigation"],footer,body>header,[role="banner"],[hidden],[aria-hidden="true"]',
    )
    .forEach((n) => n.remove());
  let article: ReturnType<Readability["parse"]> = null;
  try {
    article = new Readability(clone.cloneNode(true) as Document).parse();
  } catch {
    /* Use the same cleaned main content below. */
  }
  const fallback =
    clone.querySelector('main,article,[role="main"]') ?? clone.body;
  const html = article?.content ?? fallback?.innerHTML ?? "";
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  converter.remove(["img", "script", "style"]);
  converter.addRule("tables", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).rows).map((row) =>
        Array.from(row.cells).map((cell) =>
          (cell.textContent ?? "")
            .trim()
            .replace(/\|/g, "\\|")
            .replace(/\s+/g, " "),
        ),
      );
      if (!rows.length) return "";
      return (
        "\n\n" +
        rows
          .map(
            (row, i) =>
              "| " +
              row.join(" | ") +
              " |" +
              (i === 0 ? "\n| " + row.map(() => "---").join(" | ") + " |" : ""),
          )
          .join("\n") +
        "\n\n"
      );
    },
  });
  const blocks = converter
    .turndown(html)
    .trim()
    .split(/\n\s*\n/);
  const text = blocks
    .filter((block, index) => index === 0 || block !== blocks[index - 1])
    .join("\n\n");
  if (text.length < 10)
    throw new Error(
      "This page has too little readable text. Wait for it to load or select a passage using the context menu.",
    );
  if (text.length > 300000)
    throw new Error(
      "This page exceeds the 300,000 character extraction limit. Select a smaller passage instead.",
    );
  return {
    title: article?.title || doc.title,
    url: url.href,
    text,
    kind: "page",
    metadata: {
      domain: url.hostname,
      language: doc.documentElement.lang || undefined,
      method: article?.content ? "readability" : "cleaned-main-fallback",
      wordCount: text.split(/\s+/).length,
      extractedAt: Date.now(),
      warnings: article?.content
        ? []
        : [
            "Readability was unavailable; extracted the cleaned main region or page body. Inspect for unrelated content.",
          ],
    },
  };
}

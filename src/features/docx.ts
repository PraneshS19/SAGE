import { Unzip, UnzipInflate } from "fflate";
const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export async function extractDocx(
  data: ArrayBuffer,
): Promise<{ text: string; warnings: string[] }> {
  if (data.byteLength > 25 * 1024 * 1024)
    throw new Error("DOCX exceeds the 25 MB limit.");
  let xml = "";
  let failure: Error | undefined;
  let found = false;
  let count = 0;
  const unzip = new Unzip((file) => {
    if (/vbaProject\.bin$/i.test(file.name)) {
      failure = new Error(
        "Macro-enabled documents are not supported. Export a plain DOCX.",
      );
      return;
    }
    if (file.name !== "word/document.xml") return;
    if (found) {
      failure = new Error("DOCX has duplicate document entries.");
      return;
    }
    found = true;
    if (file.originalSize !== undefined && file.originalSize > 6_000_000) {
      failure = new Error("DOCX text XML exceeds the 6 MB safety limit.");
      return;
    }
    const decoder = new TextDecoder();
    file.ondata = (error, chunk, final) => {
      if (error) {
        failure = new Error("Malformed or unsupported DOCX compression.");
        return;
      }
      count += chunk.length;
      if (count > 6_000_000) {
        failure = new Error("DOCX decompression exceeded the safety limit.");
        file.terminate();
        return;
      }
      xml += decoder.decode(chunk, { stream: !final });
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += 1024) {
      unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
      if (failure) throw failure;
      if (i % 65536 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } catch (error) {
    throw (
      failure ?? new Error("Cannot read this DOCX archive.", { cause: error })
    );
  }
  if (!found || !xml)
    throw new Error(
      "Not a readable DOCX document. Select a .docx file, not .doc, .docm or a web viewer.",
    );
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("DOCX XML entities and document types are not allowed.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("Malformed DOCX document XML.");
  const body = document.getElementsByTagNameNS(NS, "body")[0];
  if (!body) throw new Error("DOCX contains no document body.");
  const plain = (element: Element) =>
    Array.from(element.getElementsByTagNameNS(NS, "t"))
      .map((t) => t.textContent ?? "")
      .join("");
  const blocks: string[] = [];
  for (const node of Array.from(body.children)) {
    if (node.localName === "p") {
      const text = plain(node).trim();
      if (!text) continue;
      const style =
        node
          .getElementsByTagNameNS(NS, "pStyle")[0]
          ?.getAttributeNS(NS, "val") ?? "";
      const level = /^heading\s*([1-6])$/i.exec(style)?.[1];
      const list = node.getElementsByTagNameNS(NS, "numPr").length > 0;
      blocks.push(
        (level ? "#".repeat(Number(level)) + " " : list ? "- " : "") + text,
      );
    } else if (node.localName === "tbl") {
      const rows = Array.from(node.children)
        .filter((n) => n.localName === "tr")
        .map((row) =>
          Array.from(row.children)
            .filter((n) => n.localName === "tc")
            .map((cell) =>
              plain(cell).trim().replace(/\|/g, "\\|").replace(/\s+/g, " "),
            ),
        );
      if (rows.length)
        blocks.push(
          rows
            .map(
              (row, i) =>
                "| " +
                row.join(" | ") +
                " |" +
                (i === 0
                  ? "\n| " + row.map(() => "---").join(" | ") + " |"
                  : ""),
            )
            .join("\n"),
        );
    }
  }
  const text = blocks.join("\n\n");
  if (!text.trim())
    throw new Error(
      "DOCX contains no supported text. Images and embedded documents are not extracted.",
    );
  if (text.length > 600000)
    throw new Error("DOCX extracted text exceeds 600,000 characters.");
  return {
    text,
    warnings: [
      "Only body paragraphs and basic tables were extracted. Images, footnotes, comments, tracked deletions, headers and embedded objects may be omitted. No external relationships or embedded code were opened.",
    ],
  };
}

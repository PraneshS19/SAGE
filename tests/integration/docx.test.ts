import { it, expect, vi, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";
import { extractDocx } from "../../src/features/docx";
const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function docx(body: string, extra: Record<string, Uint8Array> = {}) {
  const bytes = zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>`,
    ),
    ...extra,
  });
  return Uint8Array.from(bytes).buffer;
}
afterEach(() => vi.unstubAllGlobals());
it("extracts DOCX headings, paragraphs and tables locally without following relationships", async () => {
  vi.stubGlobal("DOMParser", new JSDOM("").window.DOMParser);
  const result = await extractDocx(
    docx(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Findings</w:t></w:r></w:p><w:p><w:r><w:t>42 participants were studied.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Group</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Control</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      {
        "word/_rels/document.xml.rels": strToU8(
          '<Relationship Target="https://evil.example/" TargetMode="External"/>',
        ),
      },
    ),
  );
  expect(result.text).toContain("# Findings");
  expect(result.text).toContain("42 participants");
  expect(result.text).toContain("| Group |");
  expect(result.text).not.toContain("evil.example");
});
it("rejects macros, invalid archives and empty documents", async () => {
  vi.stubGlobal("DOMParser", new JSDOM("").window.DOMParser);
  await expect(
    extractDocx(docx("", { "word/vbaProject.bin": new Uint8Array([1]) })),
  ).rejects.toThrow("Macro");
  await expect(extractDocx(new ArrayBuffer(9))).rejects.toThrow();
  await expect(extractDocx(docx(""))).rejects.toThrow("no supported text");
});
it("rejects XML entities and decompression bombs before parsing", async () => {
  vi.stubGlobal("DOMParser", new JSDOM("").window.DOMParser);
  const bytes = zipSync({
    "word/document.xml": strToU8(
      '<!DOCTYPE doc [<!ENTITY evil SYSTEM "file:///private">]><doc/>',
    ),
  });
  await expect(extractDocx(Uint8Array.from(bytes).buffer)).rejects.toThrow(
    "entities",
  );
  const bomb = zipSync({ "word/document.xml": new Uint8Array(6_000_001) });
  await expect(extractDocx(Uint8Array.from(bomb).buffer)).rejects.toThrow(
    "safety limit",
  );
});

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = worker;
export async function extractPdf(data: ArrayBuffer): Promise<string[]> {
  const task = getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 500)
      throw new Error(
        "PDF exceeds the 500 page limit. Import a smaller document.",
      );
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join(""),
      );
      page.cleanup();
    }
    if (!pages.some((p) => p.trim()))
      throw new Error(
        "No extractable PDF text. Scanned documents require OCR, which is not supported.",
      );
    return pages;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `PDF extraction: ${error.message}`
        : "Cannot read this PDF.",
      { cause: error },
    );
  } finally {
    await task.destroy();
  }
}

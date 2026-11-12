import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { extractDocument } from "../lib/extraction";
export default defineUnlistedScript(() => {
  const state = globalThis as typeof globalThis & { sageExtractor?: boolean };
  if (state.sageExtractor) return;
  state.sageExtractor = true;
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== "SAGE_EXTRACT"
    )
      return;
    try {
      respond({ ok: true, data: extractDocument(document) });
    } catch (error) {
      respond({
        ok: false,
        error: error instanceof Error ? error.message : "Extraction failed.",
      });
    }
  });
});

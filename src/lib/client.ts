import type { Request } from "./schema";
export async function rpc<T>(request: Request): Promise<T> {
  const result = await chrome.runtime.sendMessage(request);
  if (!result?.ok)
    throw new Error(
      result?.error ?? "SAGE background is unavailable. Reload the extension.",
    );
  return result.data as T;
}
export async function openWorkspace() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (chrome.sidePanel?.open && tab?.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      if (tab.id && /^https?:/.test(tab.url ?? ""))
        await chrome.storage.session.set({ preferredTabId: tab.id });
      return;
    } catch {
      /* Browser implements API but not panel: use full tab. */
    }
  }
  if (tab?.id && /^https?:/.test(tab.url ?? ""))
    await chrome.storage.session.set({ preferredTabId: tab.id });
  await chrome.tabs.create({ url: chrome.runtime.getURL("/sidepanel.html") });
}
export async function pageTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (active && /^https?:/.test(active.url ?? "")) return active;
  const { preferredTabId } = await chrome.storage.session.get("preferredTabId");
  if (typeof preferredTabId === "number") {
    try {
      return await chrome.tabs.get(preferredTabId);
    } catch {
      /* Source tab closed. */
    }
  }
  return active;
}

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../../src/components/Markdown";
import {
  assertPage,
  endpointInfo,
  safeLink,
  trustedSender,
} from "../../src/lib/security";
import { defaults, requestSchema } from "../../src/lib/schema";
import { migrateSettings } from "../../src/lib/storage";
describe("endpoint policy", () => {
  it.each([
    ["http://localhost:11434", "Local"],
    ["http://127.0.0.1:8080", "Local"],
    ["http://[::1]:1234", "Local"],
    ["http://192.168.1.4:8080", "Network"],
    ["http://10.0.0.5", "Network"],
    ["https://openrouter.ai/api/v1", "Cloud"],
    ["https://local.example.org", "Cloud"],
  ])("classifies %s as %s", (url, location) =>
    expect(endpointInfo(url).location).toBe(location),
  );
  it.each([
    "file:///secret",
    "javascript:alert(1)",
    "http://remote.example",
    "https://key:secret@example.org",
    "http://0.0.0.0",
    "http://169.254.169.254",
    "https://example.com/?key=secret",
    "http://evil.localhost",
  ])("rejects unsafe endpoint %s", (url) =>
    expect(() => endpointInfo(url)).toThrow(),
  );
});
describe("page policy", () => {
  it("blocks domain and subdomains but not lookalikes", () => {
    expect(() =>
      assertPage("https://mail.example.com/article", ["example.com"]),
    ).toThrow();
    expect(() =>
      assertPage("https://notexample.com/article", ["example.com"]),
    ).not.toThrow();
  });
  it.each([
    "chrome://settings",
    "file:///private",
    "https://site.com/login",
    "https://site.com/checkout/payment",
    "https://patient.example.com",
    "https://site.com/%61uth/token",
  ])("rejects restricted/sensitive page %s", (url) =>
    expect(() => assertPage(url, [])).toThrow(),
  );
  it("denies malformed URL", () =>
    expect(() => assertPage("not a URL", [])).toThrow());
});
describe("message and rendering boundaries", () => {
  it("rejects content-script senders even from our extension", () => {
    vi.stubGlobal("chrome", { runtime: { id: "sage" } });
    expect(
      trustedSender(
        {
          id: "sage",
          url: "https://site.test",
          tab: { id: 1 } as chrome.tabs.Tab,
        },
        "chrome-extension://sage/",
      ),
    ).toBe(false);
    expect(
      trustedSender(
        { id: "sage", url: "chrome-extension://sage/popup.html" },
        "chrome-extension://sage/",
      ),
    ).toBe(true);
    expect(
      trustedSender(
        { id: "other", url: "chrome-extension://sage/popup.html" },
        "chrome-extension://sage/",
      ),
    ).toBe(false);
    vi.unstubAllGlobals();
  });
  it("rejects arbitrary network destinations or commands in requests", () => {
    expect(
      requestSchema.safeParse({ type: "fetch", url: "https://evil.test" })
        .success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ type: "extract", tabIds: [-1] }).success,
    ).toBe(false);
  });
  it("never renders raw scripts, external images or executable links", () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={
          "<script>alert(1)</script>\n\n![exfil](https://evil.test/secret)\n\n[bad](javascript:alert%281%29)\n\n[ok](https://example.com)"
        }
      />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('rel="noreferrer noopener"');
    expect(
      renderToStaticMarkup(
        <Markdown
          text="[model link](https://example.com)"
          sourceLinks={false}
        />,
      ),
    ).not.toContain("href=");
    expect(safeLink("data:text/html,secret")).toBeUndefined();
  });
});
describe("versioned storage", () => {
  it("defaults to no history and loopback", () => {
    expect(migrateSettings(undefined)).toEqual(defaults);
    expect(defaults.history).toBe(false);
  });
  it("refuses unknown versions without silently resetting keys", () => {
    expect(() => migrateSettings({ ...defaults, version: 2 })).toThrow(
      "incompatible",
    );
  });
});

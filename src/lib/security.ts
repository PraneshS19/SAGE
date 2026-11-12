export type Location = "Local" | "Network" | "Cloud";
export function endpointInfo(value: string): {
  url: URL;
  location: Location;
  origin: string;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid endpoint. Enter a complete HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Endpoint must use HTTP(S), without credentials, query or fragment.",
    );
  const h = url.hostname.toLowerCase();
  const local =
    h === "localhost" || h === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(h);
  const network =
    /^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      h,
    ) || /^\[(f[cd]|fe[89ab])/.test(h);
  if (
    ["0.0.0.0", "[::]", "169.254.169.254"].includes(h) ||
    h.endsWith(".localhost")
  )
    throw new Error(
      "Use an explicit loopback or server address; wildcard and metadata endpoints are not allowed.",
    );
  if (!local && !network && url.protocol !== "https:")
    throw new Error("Remote endpoints require HTTPS.");
  return {
    url,
    location: local ? "Local" : network ? "Network" : "Cloud",
    origin: url.origin + "/*",
  };
}
export function assertPage(urlText: string, blocked: string[]) {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error("Cannot verify this page address. Access denied.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Restricted browser page. Open a public HTTP(S) page or import a PDF.",
    );
  const host = url.hostname.toLowerCase();
  if (
    blocked.some((raw) => {
      const d = raw.trim().toLowerCase().replace(/^\*\./, "");
      return d && (host === d || host.endsWith("." + d));
    }) ||
    /(^|[./_-])(login|signin|sign-in|auth|oauth|checkout|banking|webmail|patient|mychart|password|account)([./_?-]|$)/i.test(
      host + decodeURIComponent(url.pathname),
    )
  )
    throw new Error(
      "Blocked website or sensitive page category. Review your privacy settings; use a nonsensitive page.",
    );
  return url;
}
export function trustedSender(
  sender: chrome.runtime.MessageSender,
  extensionOrigin: string,
): boolean {
  return (
    sender.id === chrome.runtime.id &&
    !sender.tab?.incognito &&
    !!sender.url &&
    sender.url.startsWith(extensionOrigin) &&
    ["/popup.html", "/sidepanel.html", "/options.html"].includes(
      new URL(sender.url).pathname,
    )
  );
}
export function safeLink(url: string): string | undefined {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

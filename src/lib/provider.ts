import { answerFilter } from "./answer-filter";
import { inferenceAdapter, collectContinuation } from "./inference-adapters";
import { effectiveCapabilities, modelIdentity } from "./inference-config";
import type {
  Provider,
  Turn,
  DiagnosticReport,
  DiagnosticStep,
  ModelInfo,
  RateLimitMetadata,
  OpenRouterKeyInfo,
} from "./schema";
import { endpointInfo } from "./security";
import { SYSTEM } from "./context";
export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public rateLimit?: RateLimitMetadata,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
const providerJson = (response: Response) =>
  response.json().catch(() => {
    throw new ProviderError(
      "FORMAT",
      "Provider returned invalid JSON. Response contents were not included in diagnostics.",
    );
  });
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
export function sanitizeError(message: string, apiKey?: string): string {
  let cleaned = message;
  if (apiKey && apiKey.length > 3) {
    cleaned = cleaned.replaceAll(apiKey, "[REDACTED_API_KEY]");
  }
  cleaned = cleaned.replace(
    /Bearer\s+[A-Za-z0-9_.-]{8,}/gi,
    "Bearer [REDACTED]",
  );
  cleaned = cleaned.replace(
    /sk-or-v1-[A-Za-z0-9]{20,}/gi,
    "sk-or-v1-[REDACTED]",
  );
  return cleaned;
}
export function httpError(status: number, p?: Provider, message?: string) {
  if (status === 403 && p?.kind === "ollama") {
    return new ProviderError(
      "403",
      "Ollama refused this extension origin (HTTP 403 Forbidden). Configure OLLAMA_ORIGINS to include this extension's origin and restart Ollama.",
    );
  }
  if (status === 404 && p?.kind === "ollama") {
    return new ProviderError(
      "404",
      `Ollama model or endpoint not found (HTTP 404). Verify model '${p.model || "tag"}' is installed via 'ollama list' and endpoint URL is correct.`,
    );
  }
  return new ProviderError(
    String(status),
    message ||
      ((
        {
          401: "Invalid API key. Update your provider credentials.",
          403: "Provider refused this extension origin or credentials. Check server CORS/origin settings.",
          402: "Provider credits exhausted. Check your account.",
          404: "Model or API endpoint unavailable. Check the endpoint and model name.",
          429: "Rate limit exceeded. Wait before trying again.",
          400: "Provider rejected the request. Check model compatibility and context size.",
          503: "Provider service temporarily unavailable (HTTP 503).",
        } as Record<number, string>
      )[status] ??
        `Provider returned HTTP ${status}. Check your inference server.`),
  );
}
export async function buildHttpError(
  response: Response,
  p?: Provider,
): Promise<ProviderError> {
  const status = response.status;
  const retryHeader = response.headers.get("retry-after");
  const resetHeader = response.headers.get("x-ratelimit-reset");
  const limitHeader = response.headers.get("x-ratelimit-limit");
  const remainingHeader = response.headers.get("x-ratelimit-remaining");

  let retryAfterSeconds: number | undefined;
  if (retryHeader) {
    const sec = parseInt(retryHeader, 10);
    if (!isNaN(sec) && sec > 0) {
      retryAfterSeconds = sec;
    } else {
      const dateMs = Date.parse(retryHeader);
      if (!isNaN(dateMs)) {
        retryAfterSeconds = Math.max(
          1,
          Math.ceil((dateMs - Date.now()) / 1000),
        );
      }
    }
  }

  let resetTimestampMs: number | undefined;
  if (resetHeader) {
    const num = parseFloat(resetHeader);
    if (!isNaN(num) && num > 0) {
      if (num > 1_000_000_000_000) {
        resetTimestampMs = Math.round(num);
      } else if (num > 1_000_000_000) {
        resetTimestampMs = Math.round(num * 1000);
      } else {
        retryAfterSeconds = retryAfterSeconds ?? Math.round(num);
      }
      if (resetTimestampMs && retryAfterSeconds === undefined) {
        retryAfterSeconds = Math.max(
          1,
          Math.ceil((resetTimestampMs - Date.now()) / 1000),
        );
      }
    }
  }

  let rawText = "";
  try {
    rawText = await response.text();
  } catch {
    // Body read failed
  }

  let jsonBody: Record<string, unknown> | null = null;
  try {
    jsonBody = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // Not JSON
  }

  const errObj = (
    jsonBody?.error && typeof jsonBody.error === "object"
      ? jsonBody.error
      : null
  ) as Record<string, unknown> | null;
  const rawMsg =
    typeof errObj?.message === "string"
      ? errObj.message
      : typeof jsonBody?.message === "string"
        ? (jsonBody.message as string)
        : typeof jsonBody?.error === "string"
          ? (jsonBody.error as string)
          : rawText;

  const metadata = (
    errObj?.metadata && typeof errObj.metadata === "object"
      ? errObj.metadata
      : null
  ) as Record<string, unknown> | null;
  const metaHeaders = (
    metadata?.headers && typeof metadata.headers === "object"
      ? metadata.headers
      : null
  ) as Record<string, unknown> | null;

  if (metaHeaders) {
    const metaReset =
      metaHeaders["X-RateLimit-Reset"] ?? metaHeaders["x-ratelimit-reset"];
    if (typeof metaReset === "string" || typeof metaReset === "number") {
      const num = parseFloat(String(metaReset));
      if (!isNaN(num) && num > 0) {
        if (num > 1_000_000_000_000) {
          resetTimestampMs = resetTimestampMs ?? Math.round(num);
        } else if (num > 1_000_000_000) {
          resetTimestampMs = resetTimestampMs ?? Math.round(num * 1000);
        } else {
          retryAfterSeconds = retryAfterSeconds ?? Math.round(num);
        }
        if (resetTimestampMs && retryAfterSeconds === undefined) {
          retryAfterSeconds = Math.max(
            1,
            Math.ceil((resetTimestampMs - Date.now()) / 1000),
          );
        }
      }
    }
  }

  const providerName =
    typeof metadata?.provider_name === "string"
      ? sanitizeError(metadata.provider_name, p?.apiKey).slice(0, 100)
      : undefined;
  const limitVal =
    typeof metaHeaders?.["X-RateLimit-Limit"] === "string"
      ? metaHeaders["X-RateLimit-Limit"]
      : (limitHeader ?? undefined);
  const remainingVal =
    typeof metaHeaders?.["X-RateLimit-Remaining"] === "string"
      ? metaHeaders["X-RateLimit-Remaining"]
      : (remainingHeader ?? undefined);

  const cleanRawMsg = sanitizeError(rawMsg || "", p?.apiKey);

  if (status === 403 && p?.kind === "ollama") {
    return new ProviderError(
      "403",
      "Ollama refused this extension origin (HTTP 403 Forbidden). Configure OLLAMA_ORIGINS to include this extension's origin and restart Ollama.",
    );
  }
  if (status === 404 && p?.kind === "ollama") {
    return new ProviderError(
      "404",
      `Ollama model or endpoint not found (HTTP 404). Verify model '${p.model || "tag"}' is installed via 'ollama list' and endpoint URL is correct.`,
    );
  }

  if (status === 401) {
    const isOR =
      p?.kind === "openrouter" || p?.endpoint.includes("openrouter.ai");
    const msg = isOR
      ? "Invalid OpenRouter API key (HTTP 401). Probable cause: Missing or revoked API key. Next step: Go to Settings -> AI Providers and paste a valid key from openrouter.ai/keys."
      : "Invalid API key (HTTP 401). Probable cause: Provider rejected credentials. Next step: Check and update your API key in Settings -> AI Providers.";
    return new ProviderError("401", msg);
  }

  if (status === 402) {
    const isOR =
      p?.kind === "openrouter" || p?.endpoint.includes("openrouter.ai");
    const msg = isOR
      ? "OpenRouter returned HTTP 402 (payment or credit restriction). SAGE cannot determine the account balance from this status alone. Next step: Check the provider response and your account at openrouter.ai/credits, or use local Ollama."
      : "Provider credits exhausted (HTTP 402). Probable cause: Account has run out of tokens or credits. Next step: Add credits to your provider account or switch to a local model.";
    return new ProviderError("402", msg);
  }

  if (status === 429) {
    const isDailyQuota =
      /limit_rpd|daily|per[- ]day/i.test(cleanRawMsg) ||
      /limit_rpd/i.test(String(errObj?.code || ""));

    const isUpstreamCapacity =
      /upstream|overload|capacity|provider.*returned|resource exhausted|temporarily unavailable|no available providers/i.test(
        cleanRawMsg,
      ) ||
      Boolean(providerName && /overload|capacity|429|503/i.test(cleanRawMsg));

    const isPerMinute =
      !isDailyQuota &&
      !isUpstreamCapacity &&
      (/limit_rpm|per[- ]minute|rpm/i.test(cleanRawMsg) ||
        /limit_rpm/i.test(String(errObj?.code || "")) ||
        false);

    let limitType:
      "daily_quota" | "per_minute" | "upstream_capacity" | "general";
    let message: string;

    if (isDailyQuota) {
      limitType = "daily_quota";
      const resetMsg = retryAfterSeconds
        ? ` (resets in ~${Math.ceil(retryAfterSeconds / 60)} minutes)`
        : " (reset time was not supplied)";
      message = `Provider reported a daily quota limit${resetMsg}. Next step: Inspect your provider account allowance, wait for its reported reset, or use local Ollama. SAGE cannot infer your account tier or quota from this error.`;
    } else if (isUpstreamCapacity) {
      limitType = "upstream_capacity";
      const hostLabel = providerName ? ` (${providerName})` : "";
      message = `Provider reported upstream overload or capacity constraints${hostLabel}. This does not rule out account limits. Next step: Wait before retrying, inspect provider status, or choose a different model yourself.`;
    } else if (isPerMinute) {
      limitType = "per_minute";
      const waitPart = retryAfterSeconds
        ? ` Please wait ${retryAfterSeconds}s before retrying.`
        : " Please wait a minute before retrying.";
      message = `Provider reported a per-minute rate limit.${waitPart} Next step: Wait for the cooldown countdown before retrying. Your account's numerical allowance was not inferred.`;
    } else {
      limitType = "general";
      const waitPart = retryAfterSeconds
        ? ` Wait ${retryAfterSeconds}s before trying again.`
        : " Wait before trying again.";
      message = `Rate limit exceeded.${waitPart} Probable cause: Provider request quota or rate threshold reached. Next step: Wait for cooldown or switch to a local model.`;
    }

    return new ProviderError("429", message, {
      retryAfterSeconds,
      resetTimestampMs,
      limitType,
      limit: limitVal,
      remaining: remainingVal,
      providerName,
      rawMessage: cleanRawMsg.slice(0, 300),
    });
  }

  if (status === 503) {
    const isCapacity = /capacity|overload|upstream/i.test(cleanRawMsg);
    const msg = isCapacity
      ? `Upstream provider overloaded (HTTP 503). Probable cause: High global demand on model '${p?.model || "selected"}'. Next step: Try again shortly, choose a different model, or use local Ollama.`
      : "Provider service temporarily unavailable (HTTP 503). Probable cause: Temporary provider maintenance or outage. Next step: Check provider status and retry shortly.";
    return new ProviderError("503", msg, {
      retryAfterSeconds,
      limitType: isCapacity ? "upstream_capacity" : "general",
      providerName,
    });
  }

  if (status === 404) {
    return new ProviderError(
      "404",
      `Model '${p?.model || "selected"}' or API endpoint unavailable (HTTP 404). Probable cause: Model identifier is misspelled or endpoint URL is wrong. Next step: Verify model tag in Settings.`,
    );
  }

  if (status === 400) {
    return new ProviderError(
      "400",
      `Provider rejected the request (HTTP 400): ${cleanRawMsg || "Check model compatibility and context size."}`,
    );
  }

  return new ProviderError(
    String(status),
    cleanRawMsg ||
      `Provider returned HTTP ${status}. Check your inference server.`,
  );
}
export async function openRouterKeyInfo(
  p: Provider,
): Promise<OpenRouterKeyInfo | null> {
  if (!p.apiKey) return null;
  const isOR = base(p) === "https://openrouter.ai/api/v1";
  if (!isOR) return null;
  try {
    const res = await fetch(base(p) + "/key", {
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    const json = (await providerJson(res)) as {
      data?: Record<string, unknown>;
    };
    const d = json?.data;
    if (!d) return null;
    return {
      label:
        typeof d.label === "string"
          ? sanitizeError(d.label, p.apiKey)
          : typeof d.name === "string"
            ? sanitizeError(d.name, p.apiKey)
            : undefined,
      usage: typeof d.usage === "number" ? d.usage : undefined,
      limit:
        typeof d.limit === "number"
          ? d.limit
          : d.limit === null
            ? null
            : undefined,
      limitRemaining:
        typeof d.limit_remaining === "number" ? d.limit_remaining : null,
      isFreeTier:
        typeof d.is_free_tier === "boolean" ? d.is_free_tier : undefined,
      rateLimit: d.rate_limit as OpenRouterKeyInfo["rateLimit"],
    };
  } catch {
    return null;
  }
}
export const headers = (p: Provider) => {
  const isOR = p.kind === "openrouter" || p.endpoint.includes("openrouter.ai");
  return {
    "Content-Type": "application/json",
    ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
    ...(isOR
      ? {
          "X-Title": "SAGE Research Companion",
        }
      : {}),
  };
};
export const base = (p: Provider) => {
  let raw = endpointInfo(p.endpoint).url.href.replace(/\/$/, "");
  if (p.kind === "ollama") {
    raw = raw.replace(/\/api\/?$/, "");
  } else {
    raw = raw.replace(/\/(chat\/completions|models)\/?$/, "");
  }
  return raw;
};
export async function models(p: Provider): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(
      base(p) + (p.kind === "ollama" ? "/api/tags" : "/models"),
      {
        headers: headers(p),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
  } catch (err: unknown) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError(
        "TIMEOUT",
        "Request to list models timed out after 15 seconds.",
      );
    }
    const isLocal = endpointInfo(p.endpoint).location === "Local";
    throw new ProviderError(
      "CONNECTION",
      isLocal
        ? `Cannot connect to Ollama at ${p.endpoint}. Ollama is not running. Start Ollama ('ollama serve' or open the Ollama desktop app).`
        : `Endpoint ${p.endpoint} is unreachable. Check network connectivity, endpoint URL and host permissions.`,
    );
  }
  if (!response.ok) throw await buildHttpError(response, p);
  const data = await providerJson(response);
  const list: unknown = p.kind === "ollama" ? data.models : data.data;
  if (!Array.isArray(list))
    throw new ProviderError(
      "FORMAT",
      "This endpoint did not return a compatible model list.",
    );
  return list
    .filter(
      (x) =>
        p.kind !== "ollama" ||
        !Array.isArray(x.capabilities) ||
        x.capabilities.includes("completion"),
    )
    .map((x) => String(p.kind === "ollama" ? x.name : x.id));
}
export async function modelsDetail(p: Provider): Promise<ModelInfo[]> {
  const normalizedBase = base(p);
  if (p.kind !== "ollama") {
    const list = await models(p);
    return list.map((id) => ({ id, name: id }));
  }

  let response: Response;
  try {
    response = await fetch(normalizedBase + "/api/tags", {
      headers: headers(p),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (err: unknown) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("TIMEOUT", "Request to list models timed out.");
    }
    const isLocal = endpointInfo(p.endpoint).location === "Local";
    throw new ProviderError(
      "CONNECTION",
      isLocal
        ? `Cannot connect to Ollama at ${p.endpoint}. Ollama is not running.`
        : `Endpoint ${p.endpoint} is unreachable.`,
    );
  }
  if (!response.ok) throw await buildHttpError(response, p);

  interface OllamaTagItem {
    name?: string;
    model?: string;
    size?: number;
    capabilities?: string[];
    details?: {
      parameter_size?: string;
      quantization_level?: string;
      family?: string;
      context_length?: number;
    };
    modified_at?: string;
  }
  interface OllamaPsItem {
    name?: string;
    model?: string;
    size?: number;
    size_vram?: number;
  }

  const data = (await providerJson(response)) as { models?: unknown };
  const rawList: OllamaTagItem[] = Array.isArray(data.models)
    ? (data.models as OllamaTagItem[])
    : [];

  const loadedMap = new Map<string, { sizeVram?: number }>();
  try {
    const psRes = await fetch(normalizedBase + "/api/ps", {
      headers: headers(p),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (psRes.ok) {
      const psData = (await providerJson(psRes)) as { models?: unknown };
      if (Array.isArray(psData.models)) {
        for (const m of psData.models as OllamaPsItem[]) {
          const vram =
            typeof m.size_vram === "number"
              ? m.size_vram
              : typeof m.size === "number"
                ? m.size
                : undefined;
          if (m.name) loadedMap.set(String(m.name), { sizeVram: vram });
          if (m.model) loadedMap.set(String(m.model), { sizeVram: vram });
        }
      }
    }
  } catch {
    // Non-fatal if /api/ps is unsupported
  }

  return rawList
    .filter(
      (x) =>
        !Array.isArray(x.capabilities) || x.capabilities.includes("completion"),
    )
    .map((x) => {
      const id = String(x.name || x.model);
      const isLoaded =
        loadedMap.has(id) ||
        loadedMap.has(String(x.name)) ||
        loadedMap.has(String(x.model));
      const loadedData =
        loadedMap.get(id) ||
        loadedMap.get(String(x.name)) ||
        loadedMap.get(String(x.model));
      const sizeBytes = typeof x.size === "number" ? x.size : undefined;
      const vramBytes = loadedData?.sizeVram;

      return {
        id,
        name: id,
        parameterSize: x.details?.parameter_size,
        quantization: x.details?.quantization_level,
        family: x.details?.family,
        contextLength: x.details?.context_length,
        sizeBytes,
        sizeFormatted: sizeBytes ? formatBytes(sizeBytes) : undefined,
        isLoaded,
        vramBytes,
        vramFormatted: vramBytes ? formatBytes(vramBytes) : undefined,
        modifiedAt: x.modified_at,
      };
    });
}
export async function preloadModel(
  p: Provider,
  model: string,
): Promise<{ ok: boolean; durationMs: number }> {
  if (p.kind !== "ollama")
    throw new Error("Model preloading is supported only for Ollama.");
  const started = Date.now();
  const normalizedBase = base(p);
  const response = await fetch(normalizedBase + "/api/chat", {
    method: "POST",
    headers: headers(p),
    body: JSON.stringify({
      model,
      messages: [],
      stream: false,
      options: { num_ctx: p.contextWindow },
    }),
    signal: AbortSignal.timeout(120000),
    redirect: "error",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw await buildHttpError(response, p);
  const result = (await providerJson(response)) as {
    done?: boolean;
    error?: unknown;
  };
  if (result.error || result.done !== true)
    throw new ProviderError("PRELOAD", "Server did not confirm model loading.");
  return { ok: true, durationMs: Date.now() - started };
}
export async function* decodeStream(
  body: ReadableStream<Uint8Array>,
  ollama: boolean,
  signal: AbortSignal,
  onMetadata?: (message: Record<string, unknown>) => void,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSignal = false;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const parse = (line: string): string => {
    const raw = ollama
      ? line
      : line.startsWith("data:")
        ? line.slice(5).trim()
        : "";
    if (!raw) return "";
    if (raw === "[DONE]") {
      doneSignal = true;
      return "";
    }
    let item;
    try {
      item = JSON.parse(raw);
    } catch {
      throw new ProviderError(
        "STREAM",
        "Malformed provider stream. Retry the request.",
      );
    }
    if (item.error) {
      const errObj =
        typeof item.error === "object" && item.error !== null
          ? (item.error as Record<string, unknown>)
          : {};
      const errMsg =
        typeof errObj.message === "string"
          ? errObj.message
          : typeof item.error === "string"
            ? item.error
            : "Provider reported a generation error.";
      throw new ProviderError(
        String(errObj.code || "STREAM"),
        sanitizeError(errMsg),
      );
    }
    const message = ollama ? item.message : item.choices?.[0]?.delta;
    if (message && typeof message === "object") {
      if (message.tool_calls?.length)
        throw new ProviderError(
          "UNSUPPORTED",
          "Provider requested tool calls. SAGE research does not execute model tools.",
        );
      onMetadata?.(message);
    }
    if (item.done || item.choices?.[0]?.finish_reason) doneSignal = true;
    const token = ollama
      ? item.message?.content
      : item.choices?.[0]?.delta?.content;
    const warning =
      item.done_reason === "length" ||
      item.choices?.[0]?.finish_reason === "length"
        ? "\n\n[Output stopped at the configured token limit and may be incomplete.]"
        : "";
    return (typeof token === "string" ? token : "") + warning;
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 2_000_000)
        throw new ProviderError(
          "STREAM",
          "Provider stream frame is too large.",
        );
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        const token = parse(line);
        if (token) yield token;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const token = parse(buffer.trim());
      if (token) yield token;
    }
    signal.throwIfAborted();
    if (!doneSignal)
      throw new ProviderError(
        "INTERRUPTED",
        "The provider stream ended before completion. Partial output is preserved.",
      );
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function generate(
  p: Provider,
  messages: Turn[],
  signal: AbortSignal,
  onToken: (token: string) => Promise<void>,
  outputTokens = effectiveCapabilities(p).outputTokens,
) {
  if (!p.model.trim())
    throw new ProviderError(
      "MODEL",
      "Choose a model in Settings before generating.",
    );
  const adapter = inferenceAdapter(p);
  const filter = answerFilter();
  const continuation: NonNullable<Turn["continuation"]> = {
    identity: modelIdentity(p),
  };
  const ollama = p.kind === "ollama";
  let response: Response;
  try {
    response = await fetch(base(p) + adapter.path, {
      method: "POST",
      headers: headers(p),
      body: JSON.stringify(
        adapter.request(
          p,
          [{ role: "system", content: SYSTEM }, ...messages],
          outputTokens,
        ),
      ),
      signal,
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (err: unknown) {
    signal.throwIfAborted();
    if (err instanceof ProviderError) throw err;
    const isLocal = endpointInfo(p.endpoint).location === "Local";
    throw new ProviderError(
      "CONNECTION",
      isLocal
        ? `Cannot reach Ollama at ${p.endpoint}. Ollama is not running or rejected the connection.`
        : `Cannot reach the inference server at ${p.endpoint}. Check server availability, host permissions, and network.`,
    );
  }
  if (!response.ok) {
    const error = await buildHttpError(response, p);
    if (response.status === 400 || response.status === 422)
      error.message +=
        " Review this model's supported parameters and output-token parameter in Advanced inference. No automatic retry or model substitution occurred.";
    throw error;
  }
  if (!response.body)
    throw new ProviderError("STREAM", "Provider returned no response stream.");
  try {
    if (response.headers.get("content-type")?.includes("application/json")) {
      const item = await providerJson(response);
      signal.throwIfAborted();
      if (item.error)
        throw new ProviderError(
          "RESPONSE",
          sanitizeError(
            typeof item.error === "string"
              ? item.error
              : (item.error.message ?? "Provider returned an error."),
            p.apiKey,
          ),
        );
      const message = ollama ? item.message : item.choices?.[0]?.message;
      if (message?.tool_calls?.length)
        throw new ProviderError(
          "UNSUPPORTED",
          "Provider requested unsupported tool calls.",
        );
      if (message) collectContinuation(continuation, message, false);
      const content = ollama
        ? item.message?.content
        : item.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim())
        throw new ProviderError("EMPTY", "Provider returned no answer text.");
      if (content.length > outputTokens * 8)
        throw new ProviderError(
          "RESPONSE",
          "Provider response exceeds the safe output limit.",
        );
      const visible = filter.push(content) + filter.finish();
      if (!visible.trim())
        throw new ProviderError(
          "EMPTY",
          "Provider supplied reasoning without a final answer.",
        );
      await onToken(visible);
      if (
        item.done_reason === "length" ||
        item.choices?.[0]?.finish_reason === "length"
      )
        await onToken(
          "\n\n[Output stopped at the configured token limit and may be incomplete.]",
        );
      return continuation;
    }
    let emitted = false;
    for await (const token of decodeStream(
      response.body,
      ollama,
      signal,
      (message) => collectContinuation(continuation, message, true),
    )) {
      const visible = filter.push(token);
      if (visible.trim()) emitted = true;
      if (visible) await onToken(visible);
    }
    const tail = filter.finish();
    if (tail.trim()) emitted = true;
    if (tail) await onToken(tail);
    if (!emitted)
      throw new ProviderError(
        "EMPTY",
        "Provider returned no answer text. Reasoning may have exhausted the output budget; configure more output capacity.",
      );
    return continuation;
  } catch (error) {
    if (error instanceof ProviderError)
      error.message = sanitizeError(error.message, p.apiKey);
    throw error;
  }
}
export async function testConnection(
  p: Provider,
  inference = endpointInfo(p.endpoint).location === "Local",
): Promise<DiagnosticReport> {
  const steps: DiagnosticStep[] = [];
  const normalizedBase = base(p);
  const isLocal = endpointInfo(p.endpoint).location === "Local";

  let tagsRes: Response;
  try {
    tagsRes = await fetch(
      normalizedBase + (p.kind === "ollama" ? "/api/tags" : "/models"),
      {
        headers: headers(p),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
  } catch {
    const msg = isLocal
      ? `Cannot reach Ollama at ${p.endpoint}. Ollama is not running. Start Ollama ('ollama serve' or open the Ollama desktop app).`
      : `Endpoint ${p.endpoint} is unreachable. Check network connectivity, endpoint URL and host permissions.`;
    steps.push({ name: "Server Reachability", status: "fail", message: msg });
    return {
      ok: false,
      provider: p.kind,
      model: p.model || "(none)",
      endpoint: p.endpoint,
      connectionStatus: "Unreachable / Server down",
      corsStatus: "Cannot reach server",
      modelStatus: "Unknown",
      inferenceStatus: "Skipped",
      models: [],
      steps,
      summary: msg,
    };
  }
  steps.push({
    name: "Server Reachability",
    status: "pass",
    message: `Connected to ${p.endpoint} (${p.kind})`,
  });

  if (!tagsRes.ok) {
    if (tagsRes.status === 403) {
      const msg =
        p.kind === "ollama"
          ? "Ollama rejected this browser extension origin (HTTP 403 Forbidden). Set OLLAMA_ORIGINS with this extension's origin and restart Ollama."
          : "Provider refused this extension origin or credentials (HTTP 403). Check CORS/origin settings.";
      steps.push({
        name: "Browser Origin Acceptance",
        status: "fail",
        message: msg,
      });
      return {
        ok: false,
        provider: p.kind,
        model: p.model || "(none)",
        endpoint: p.endpoint,
        connectionStatus: `HTTP ${tagsRes.status}`,
        corsStatus: "Rejected (HTTP 403 Forbidden)",
        modelStatus: "Not verified due to CORS refusal",
        inferenceStatus: "Skipped",
        models: [],
        steps,
        summary: msg,
      };
    }
    if (tagsRes.status === 401) {
      const msg =
        "Authentication failed (HTTP 401). Verify your API key in Settings.";
      steps.push({
        name: "Browser Origin Acceptance",
        status: "fail",
        message: msg,
      });
      return {
        ok: false,
        provider: p.kind,
        model: p.model || "(none)",
        endpoint: p.endpoint,
        connectionStatus: `HTTP ${tagsRes.status}`,
        corsStatus: "HTTP 401 Unauthorized",
        modelStatus: "Not verified due to auth failure",
        inferenceStatus: "Skipped",
        models: [],
        steps,
        summary: msg,
      };
    }
    if (tagsRes.status === 404) {
      const msg = `Endpoint returned HTTP 404. Verify the API base URL for ${p.kind}.`;
      steps.push({ name: "API Endpoint", status: "fail", message: msg });
      return {
        ok: false,
        provider: p.kind,
        model: p.model || "(none)",
        endpoint: p.endpoint,
        connectionStatus: "HTTP 404 Not Found",
        corsStatus: "Unknown",
        modelStatus: "Unknown",
        inferenceStatus: "Skipped",
        models: [],
        steps,
        summary: msg,
      };
    }
    const msg = `Server returned HTTP ${tagsRes.status}.`;
    steps.push({
      name: "Browser Origin Acceptance",
      status: "fail",
      message: msg,
    });
    return {
      ok: false,
      provider: p.kind,
      model: p.model || "(none)",
      endpoint: p.endpoint,
      connectionStatus: `HTTP ${tagsRes.status}`,
      corsStatus: `HTTP ${tagsRes.status}`,
      modelStatus: "Unknown",
      inferenceStatus: "Skipped",
      models: [],
      steps,
      summary: msg,
    };
  }
  steps.push({
    name: "Browser Origin Acceptance",
    status: "pass",
    message: "Origin accepted by server (HTTP 200 OK)",
  });

  if (p.kind === "openrouter" || p.endpoint.includes("openrouter.ai")) {
    if (p.apiKey) {
      const keyInfo = await openRouterKeyInfo(p);
      if (keyInfo) {
        const usageStr =
          keyInfo.usage !== undefined ? `$${keyInfo.usage.toFixed(4)}` : "N/A";
        const limitStr =
          keyInfo.limitRemaining !== null &&
          keyInfo.limitRemaining !== undefined
            ? `$${keyInfo.limitRemaining.toFixed(4)}`
            : keyInfo.limit === null
              ? "No key-specific cap reported (not an account balance)"
              : "N/A";
        const tierStr =
          keyInfo.isFreeTier === true
            ? "Free tier reported"
            : keyInfo.isFreeTier === false
              ? "Non-free tier reported"
              : "Tier not reported";
        const rateLimitStr = keyInfo.rateLimit
          ? ` (${keyInfo.rateLimit.requests} req / ${keyInfo.rateLimit.interval})`
          : "";
        steps.push({
          name: "OpenRouter Key & Quota Status",
          status: "pass",
          message: `Key verified: "${keyInfo.label || "active"}". Usage: ${usageStr}, Remaining allowance: ${limitStr}, Status: ${tierStr}${rateLimitStr}`,
        });
      } else {
        steps.push({
          name: "OpenRouter Key & Quota Status",
          status: "warn",
          message:
            "Unable to retrieve key usage details from OpenRouter /api/v1/key endpoint.",
        });
      }
    } else {
      steps.push({
        name: "OpenRouter Key & Quota Status",
        status: "warn",
        message:
          "No API key provided. OpenRouter requires an API key for inference.",
      });
    }
  }

  let modelList: string[];
  try {
    const data = await providerJson(tagsRes);
    const rawList: unknown = p.kind === "ollama" ? data.models : data.data;
    if (!Array.isArray(rawList)) {
      throw new Error("Endpoint did not return a valid models array.");
    }
    modelList = rawList
      .filter(
        (x) =>
          p.kind !== "ollama" ||
          !Array.isArray(x.capabilities) ||
          x.capabilities.includes("completion"),
      )
      .map((x) => String(p.kind === "ollama" ? x.name : x.id));
  } catch (err: unknown) {
    const msg = `Failed to parse models: ${err instanceof Error ? err.message : "Unknown format"}`;
    steps.push({ name: "Available Models", status: "fail", message: msg });
    return {
      ok: false,
      provider: p.kind,
      model: p.model || "(none)",
      endpoint: p.endpoint,
      connectionStatus: "Connected (HTTP 200)",
      corsStatus: "Accepted (HTTP 200)",
      modelStatus: "Failed to parse models",
      inferenceStatus: "Skipped",
      models: [],
      steps,
      summary: msg,
    };
  }

  if (modelList.length === 0) {
    steps.push({
      name: "Available Models",
      status: "warn",
      message:
        "No completion-capable models found on server. Install one yourself.",
    });
  } else {
    steps.push({
      name: "Available Models",
      status: "pass",
      message: `${modelList.length} model(s) available: ${modelList.slice(0, 4).join(", ")}${modelList.length > 4 ? "..." : ""}`,
    });
  }

  const selectedModel = p.model.trim();
  if (!selectedModel || !inference) {
    steps.push({
      name: "Selected Model",
      status: "warn",
      message: selectedModel
        ? `Selected: ${selectedModel}. Inference was not requested.`
        : "No model selected. Choose an installed model from the list and test again.",
    });
    return {
      ok: true,
      provider: p.kind,
      model: selectedModel || "(none)",
      endpoint: p.endpoint,
      connectionStatus: "Connected (HTTP 200)",
      corsStatus: "Accepted (HTTP 200)",
      modelStatus: `${modelList.length} models available; selected: ${selectedModel || "(none)"}`,
      inferenceStatus: "Skipped (not requested or no model selected)",
      models: modelList,
      steps,
      summary:
        "Model-list connection succeeded. No inference was requested; use Test Connection to explicitly test a model.",
    };
  }

  const modelInstalled = modelList.some(
    (m) =>
      m === selectedModel ||
      m.startsWith(selectedModel + ":") ||
      selectedModel.startsWith(m + ":"),
  );
  if (!modelInstalled) {
    const msg =
      p.kind === "ollama"
        ? `Selected model '${selectedModel}' is not installed in Ollama. Available: ${modelList.join(", ")}. Run 'ollama pull ${selectedModel}'.`
        : `Selected model '${selectedModel}' was not found in the provider's model list. Available: ${modelList.slice(0, 5).join(", ")}.`;
    steps.push({ name: "Selected Model", status: "fail", message: msg });
    return {
      ok: false,
      provider: p.kind,
      model: selectedModel,
      endpoint: p.endpoint,
      connectionStatus: "Connected (HTTP 200)",
      corsStatus: "Accepted (HTTP 200)",
      modelStatus: `Missing (installed: ${modelList.join(", ")})`,
      inferenceStatus: "Skipped",
      models: modelList,
      steps,
      summary: msg,
    };
  }
  steps.push({
    name: "Selected Model",
    status: "pass",
    message: `Model '${selectedModel}' is available on the server`,
  });

  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(new Error("Test inference timed out after 30 seconds.")),
    30000,
  );
  let streamed = "";
  try {
    const ollama = p.kind === "ollama";
    const testRes = await fetch(
      normalizedBase + (ollama ? "/api/chat" : "/chat/completions"),
      {
        method: "POST",
        headers: headers(p),
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "user", content: "Reply with the single word OK." },
          ],
          stream: true,
          ...(ollama
            ? { options: { num_predict: 5, num_ctx: 2048 } }
            : { max_tokens: 5 }),
        }),
        signal: controller.signal,
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );

    if (!testRes.ok) throw await buildHttpError(testRes, p);
    if (!testRes.body) throw new Error("Server returned no response stream.");

    for await (const token of decodeStream(
      testRes.body,
      ollama,
      controller.signal,
    )) {
      streamed += token;
    }

    if (!streamed.trim())
      throw new ProviderError("FORMAT", "Provider returned no answer text.");

    steps.push({
      name: "Inference Test",
      status: "pass",
      message: "Minimal test prompt completed successfully",
    });
    steps.push({
      name: "Streaming Support",
      status: "pass",
      message: `Streaming verified (received tokens: "${sanitizeError(streamed.trim(), p.apiKey).slice(0, 20)}")`,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? sanitizeError(err.message, p.apiKey)
        : "Inference test failed.";
    steps.push({ name: "Inference & Streaming", status: "fail", message: msg });
    return {
      ok: false,
      provider: p.kind,
      model: selectedModel,
      endpoint: p.endpoint,
      connectionStatus: "Connected (HTTP 200)",
      corsStatus: "Accepted (HTTP 200)",
      modelStatus: `Available (${selectedModel})`,
      inferenceStatus: `Failed: ${msg}`,
      models: modelList,
      steps,
      summary: `Inference failed: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }

  return {
    ok: true,
    provider: p.kind,
    model: selectedModel,
    endpoint: p.endpoint,
    connectionStatus: "Connected (HTTP 200 OK)",
    corsStatus: "Accepted (HTTP 200 OK)",
    modelStatus: `Installed and ready (${selectedModel})`,
    inferenceStatus: "Passed (streaming response verified)",
    models: modelList,
    steps,
    summary:
      p.kind === "ollama"
        ? `All ${steps.length} checks passed! Connected to Ollama with model '${selectedModel}' and verified local streaming inference.`
        : `All ${steps.length} checks passed! Connected to ${p.kind} with model '${selectedModel}' and verified streaming inference.`,
  };
}

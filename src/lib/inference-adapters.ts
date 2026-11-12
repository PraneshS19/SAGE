import type { Provider, Turn } from "./schema";
import {
  effectiveCapabilities,
  modelIdentity,
  type Capabilities,
} from "./inference-config";
import { endpointInfo } from "./security";

export interface InferenceAdapter {
  path: string;
  request(
    provider: Provider,
    messages: { role: string; content: string }[],
    outputTokens: number,
  ): Record<string, unknown>;
}
export function parameterSupport(p: Provider, name: string) {
  const caps = effectiveCapabilities(p).metadata;
  const known = p.inference?.supportedParameters ?? caps?.supportedParameters;
  return (
    known?.includes(name) ??
    (p.kind === "ollama" && ["temperature", "top_p"].includes(name))
  );
}
export function inferenceWarnings(p: Provider) {
  const config = p.inference;
  const omitted = [
    config?.temperature !== undefined && !parameterSupport(p, "temperature")
      ? "temperature"
      : "",
    config?.topP !== undefined && !parameterSupport(p, "top_p") ? "top_p" : "",
    config?.reasoningEffort &&
    !parameterSupport(
      p,
      p.kind === "ollama"
        ? "think"
        : p.kind === "openrouter"
          ? "reasoning"
          : "reasoning_effort",
    )
      ? "reasoning effort"
      : "",
    config?.structuredOutput &&
    !parameterSupport(p, p.kind === "ollama" ? "format" : "response_format")
      ? "structured output"
      : "",
  ].filter(Boolean);
  return omitted.length
    ? [
        `Not sent because support is unknown or unsupported: ${omitted.join(", ")}. Discover capabilities or explicitly configure endpoint support.`,
      ]
    : [];
}
function conversation(
  p: Provider,
  messages: { role: string; content: string }[],
) {
  return messages.map((m) => {
    const turn = m as Turn;
    const meta =
      turn.continuation?.identity === modelIdentity(p)
        ? turn.continuation
        : undefined;
    return {
      role: m.role,
      content: m.content,
      ...(meta?.reasoningDetails && p.kind !== "ollama"
        ? { reasoning_details: meta.reasoningDetails }
        : {}),
      ...(meta?.thinking && p.kind === "ollama"
        ? { thinking: meta.thinking }
        : {}),
    };
  });
}
const ollama: InferenceAdapter = {
  path: "/api/chat",
  request(p, messages, outputTokens) {
    const c = p.inference;
    return {
      model: p.model.trim(),
      messages: conversation(p, messages),
      stream: effectiveCapabilities(p).streaming,
      options: {
        num_ctx: effectiveCapabilities(p).context,
        num_predict: outputTokens,
        ...(c?.temperature !== undefined && parameterSupport(p, "temperature")
          ? { temperature: c.temperature }
          : {}),
        ...(c?.topP !== undefined && parameterSupport(p, "top_p")
          ? { top_p: c.topP }
          : {}),
      },
      ...(c?.reasoningEffort && parameterSupport(p, "think")
        ? { think: c.reasoningEffort }
        : {}),
      ...(c?.structuredOutput && parameterSupport(p, "format")
        ? { format: "json" }
        : {}),
    };
  },
};
const compatible: InferenceAdapter = {
  path: "/chat/completions",
  request(p, messages, outputTokens) {
    const c = p.inference;
    const reasoningParameter =
      p.kind === "openrouter" ? "reasoning" : "reasoning_effort";
    return {
      model: p.model.trim(),
      messages: conversation(p, messages),
      stream: effectiveCapabilities(p).streaming,
      [c?.outputParameter ?? "max_tokens"]: outputTokens,
      ...(c?.temperature !== undefined && parameterSupport(p, "temperature")
        ? { temperature: c.temperature }
        : {}),
      ...(c?.topP !== undefined && parameterSupport(p, "top_p")
        ? { top_p: c.topP }
        : {}),
      ...(c?.reasoningEffort && parameterSupport(p, reasoningParameter)
        ? {
            [reasoningParameter]:
              p.kind === "openrouter"
                ? { effort: c.reasoningEffort }
                : c.reasoningEffort,
          }
        : {}),
      ...(c?.structuredOutput && parameterSupport(p, "response_format")
        ? { response_format: { type: "json_object" } }
        : {}),
    };
  },
};
export const inferenceAdapter = (p: Provider) =>
  p.kind === "ollama" ? ollama : compatible;
const positive = (x: unknown): number | undefined =>
  typeof x === "number" && Number.isSafeInteger(x) && x > 0 ? x : undefined;
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
export async function discoverCapabilities(p: Provider): Promise<Capabilities> {
  const root = endpointInfo(p.endpoint).url.href.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
  };
  const read = async (path: string, body?: unknown) => {
    const response = await fetch(root + path, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(`Metadata endpoint returned HTTP ${response.status}.`);
    try {
      return object(await response.json());
    } catch {
      throw new Error("Metadata endpoint returned invalid JSON.");
    }
  };
  const result: Capabilities = {
    identity: modelIdentity(p),
    observedAt: Date.now(),
    streaming: "unknown",
    reasoning: "unknown",
    structuredOutput: "unknown",
    tools: "unknown",
    notes: [],
  };
  try {
    if (p.kind === "ollama") {
      const data = await read("/api/show", { model: p.model });
      const info = object(data.model_info);
      const arch =
        typeof info["general.architecture"] === "string"
          ? info["general.architecture"]
          : undefined;
      result.advertisedContext = positive(
        arch ? info[arch + ".context_length"] : undefined,
      );
      const caps = Array.isArray(data.capabilities)
        ? data.capabilities
        : undefined;
      result.reasoning = caps
        ? caps.includes("thinking")
          ? "supported"
          : "unsupported"
        : "unknown";
      result.tools = caps
        ? caps.includes("tools")
          ? "supported"
          : "unsupported"
        : "unknown";
      result.streaming = "supported";
      result.structuredOutput = "supported"; // Native API format contract; schema compliance remains untrusted.
      result.supportedParameters = [
        "temperature",
        "top_p",
        "format",
        ...(result.reasoning === "supported" ? ["think"] : []),
      ];
      try {
        const ps = await read("/api/ps");
        const loaded = Array.isArray(ps.models)
          ? ps.models
              .map(object)
              .find((m) => m.name === p.model || m.model === p.model)
          : undefined;
        result.runtimeContext = positive(loaded?.context_length);
      } catch {
        result.notes.push(
          "Runtime context unavailable; configured num_ctx will be requested explicitly.",
        );
      }
    } else {
      const data = await read("/models");
      const model = Array.isArray(data.data)
        ? data.data.map(object).find((m) => m.id === p.model)
        : undefined;
      if (!model)
        throw new Error(
          "Selected model metadata unavailable; enter validated runtime settings.",
        );
      result.advertisedContext = positive(model.context_length);
      const top = object(model.top_provider);
      result.maxOutputTokens = positive(
        top.max_completion_tokens ?? model.max_output_tokens,
      );
      const params = Array.isArray(model.supported_parameters)
        ? model.supported_parameters.filter(
            (x): x is string => typeof x === "string",
          )
        : undefined;
      result.supportedParameters = params;
      result.streaming =
        typeof model.streaming === "boolean"
          ? model.streaming
            ? "supported"
            : "unsupported"
          : "unknown";
      result.reasoning = params
        ? params.includes("reasoning") || params.includes("reasoning_effort")
          ? "supported"
          : "unsupported"
        : "unknown";
      result.structuredOutput = params
        ? params.includes("response_format")
          ? "supported"
          : "unsupported"
        : "unknown";
      result.tools = params
        ? params.includes("tools")
          ? "supported"
          : "unsupported"
        : "unknown";
      result.notes.push(
        "Advertised provider capacity is not a measured runtime allocation. Confirm the configured context for your selected endpoint.",
      );
    }
  } catch (error) {
    result.notes.push(
      error instanceof Error && !error.message.includes(p.apiKey || "\0")
        ? error.message
        : "Capability discovery unavailable. Configure validated limits manually.",
    );
  }
  return result;
}

// Explicit reasoning fields never enter final-answer text. Continuation stays bound
// to the exact endpoint/model; callers may retain it in trusted conversation state.
export function collectContinuation(
  current: NonNullable<Turn["continuation"]>,
  message: Record<string, unknown>,
  streamed: boolean,
) {
  if (typeof message.thinking === "string")
    current.thinking = (current.thinking ?? "") + message.thinking;
  if (Array.isArray(message.reasoning_details)) {
    current.reasoningDetails ??= [];
    for (const raw of message.reasoning_details) {
      const part = object(raw);
      const index = typeof part.index === "number" ? part.index : undefined;
      const found =
        streamed && index !== undefined
          ? current.reasoningDetails.find((d) => d.index === index)
          : undefined;
      if (!found) current.reasoningDetails.push(structuredClone(part));
      else
        for (const [key, value] of Object.entries(part)) {
          if (
            ["text", "data", "summary"].includes(key) &&
            typeof value === "string" &&
            typeof found[key] === "string"
          )
            found[key] += value;
          else found[key] = value;
        }
    }
  }
  if (JSON.stringify(current).length > 1000000)
    throw new Error(
      "Provider continuation metadata exceeds the storage safety limit; response stopped.",
    );
}

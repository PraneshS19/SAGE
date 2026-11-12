import { z } from "zod";

// Configurable product resource policy, not a model or model-family table.
const capacity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const support = z.enum(["supported", "unsupported", "unknown"]);
export const capabilitySchema = z.object({
  identity: z.string(),
  observedAt: z.number(),
  advertisedContext: capacity.optional(),
  runtimeContext: capacity.optional(),
  maxOutputTokens: capacity.optional(),
  streaming: support,
  reasoning: support,
  structuredOutput: support,
  tools: support,
  supportedParameters: z.array(z.string()).optional(),
  notes: z.array(z.string()),
});
export const inferenceSchema = z.object({
  outputTokens: capacity.optional(),
  noteTokens: capacity.optional(),
  safetyTokens: z.number().int().nonnegative().optional(),
  bytesPerToken: z.number().min(1).max(8).optional(),
  maxRequests: z.number().int().min(1).max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(86400000).optional(),
  streaming: z.boolean().optional(),
  outputParameter: z.enum(["max_tokens", "max_completion_tokens"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  structuredOutput: z.boolean().optional(),
  supportedParameters: z.array(z.string().max(80)).max(40).optional(),
  evidenceFraction: z.number().min(0).max(0.5).optional(),
});
export type Capabilities = z.infer<typeof capabilitySchema>;
export type InferenceConfig = z.infer<typeof inferenceSchema>;
export const FALLBACK_CONTEXT = 4096;
export const DEFAULT_POLICY = {
  outputFraction: 0.125,
  noteFraction: 0.0625,
  safetyFraction: 0.0625,
  bytesPerToken: 3,
  maxRequests: 63,
  timeoutMs: 240000,
};
type Configured = {
  kind: string;
  endpoint: string;
  model: string;
  contextWindow: number;
  inference?: InferenceConfig;
  capabilities?: Capabilities;
};
export const modelIdentity = (
  p: Pick<Configured, "kind" | "endpoint" | "model">,
) => JSON.stringify([p.kind, p.endpoint.replace(/\/+$/, ""), p.model]);
export function effectiveCapabilities(p: Configured) {
  const metadata =
    p.capabilities?.identity === modelIdentity(p) ? p.capabilities : undefined;
  const config = p.inference ?? {};
  // Configured context is an explicit request to Ollama, an operator assertion elsewhere.
  // Advertised capacity never silently upgrades that assertion.
  const context = Math.min(
    p.contextWindow,
    metadata?.advertisedContext ?? Infinity,
  );
  const outputTokens = Math.min(
    config.outputTokens ?? Math.floor(context * DEFAULT_POLICY.outputFraction),
    metadata?.maxOutputTokens ?? Infinity,
  );
  const noteTokens = Math.min(
    config.noteTokens ?? Math.floor(context * DEFAULT_POLICY.noteFraction),
    outputTokens,
  );
  const safetyTokens =
    config.safetyTokens ?? Math.ceil(context * DEFAULT_POLICY.safetyFraction);
  if (
    outputTokens < 1 ||
    noteTokens < 1 ||
    outputTokens + safetyTokens >= context
  )
    throw new Error(
      "Output capacity and safety reserve leave no input context. Adjust this model's inference settings.",
    );
  const bytesPerToken = config.bytesPerToken ?? DEFAULT_POLICY.bytesPerToken;
  return {
    context,
    outputTokens,
    noteTokens,
    safetyTokens,
    bytesPerToken,
    summaryBytes: Math.floor(noteTokens * bytesPerToken),
    evidenceFraction: config.evidenceFraction ?? 0.3,
    maxRequests: config.maxRequests ?? DEFAULT_POLICY.maxRequests,
    timeoutMs: config.timeoutMs ?? DEFAULT_POLICY.timeoutMs,
    streaming: config.streaming ?? metadata?.streaming !== "unsupported",
    metadata,
    warnings: [
      `Effective context: ${context.toLocaleString()} tokens; configured ${p.contextWindow.toLocaleString()}; advertised ${metadata?.advertisedContext?.toLocaleString() ?? "unknown"}; observed runtime ${metadata?.runtimeContext?.toLocaleString() ?? "unknown"}.`,
      `Token counts are estimates (UTF-8 bytes / ${bytesPerToken}), not an exact tokenizer. Safety reserve: ${safetyTokens}.`,
      ...(metadata?.notes ?? []),
    ],
  };
}
export function countTokens(
  text: string,
  bytesPerToken = DEFAULT_POLICY.bytesPerToken,
) {
  return Math.ceil(new TextEncoder().encode(text).length / bytesPerToken);
}

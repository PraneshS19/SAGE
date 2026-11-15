import { useState } from "react";
import type { Provider } from "../lib/schema";
import {
  effectiveCapabilities,
  type InferenceConfig,
  type Capabilities,
} from "../lib/inference-config";
import { endpointInfo } from "../lib/security";
import { rpc } from "../lib/client";
export function InferenceSettings({
  provider,
  update,
}: {
  provider: Provider;
  update: (patch: Partial<Provider>) => void;
}) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const change = (patch: Partial<InferenceConfig>) =>
    update({ inference: { ...provider.inference, ...patch } });
  let description: string;
  try {
    description = effectiveCapabilities(provider).warnings.join(" ");
  } catch (error) {
    description = String(error);
  }
  return (
    <details>
      <summary>Advanced inference and model capabilities</summary>
      <p className="muted">
        Settings apply to this endpoint and model. Advertised capacity is not a
        runtime allocation. Save after editing. Blank numeric fields use
        proportional, model-independent defaults.
      </p>
      <label>
        Context window (tokens)
        <input
          type="number"
          min={2048}
          max={Number.MAX_SAFE_INTEGER}
          step={1024}
          value={provider.contextWindow}
          onChange={(event) =>
            update({ contextWindow: Number(event.target.value) })
          }
        />
      </label>
      <button
        type="button"
        disabled={loading || !provider.model}
        onClick={async () => {
          setLoading(true);
          try {
            const origins = [endpointInfo(provider.endpoint).origin];
            if (
              !(await chrome.permissions.contains({ origins })) &&
              !(await chrome.permissions.request({ origins }))
            )
              throw new Error("Provider permission denied.");
            const capabilities = await rpc<Capabilities>({
              type: "capabilities",
              provider,
            });
            update({ capabilities });
            setStatus(
              "Metadata retrieved without inference. Review context and Save; no advertised capacity was silently adopted.",
            );
          } catch (error) {
            setStatus(
              error instanceof Error ? error.message : "Discovery failed.",
            );
          } finally {
            setLoading(false);
          }
        }}
      >
        Discover selected model capabilities
      </button>
      <button type="button" onClick={() => update({ capabilities: undefined })}>
        Clear advertised metadata
      </button>
      <p role="status">{status}</p>
      <p className="muted">{description}</p>
      {provider.capabilities && (
        <p>
          Streaming: {provider.capabilities.streaming}; reasoning:{" "}
          {provider.capabilities.reasoning}; structured output:{" "}
          {provider.capabilities.structuredOutput}; tools:{" "}
          {provider.capabilities.tools} (SAGE does not execute tools).
        </p>
      )}
      {(
        [
          ["outputTokens", "Maximum output tokens", 1],
          ["noteTokens", "Intermediate output tokens", 1],
          ["safetyTokens", "Context safety reserve", 0],
          ["bytesPerToken", "Estimated UTF-8 bytes per token", 1],
          ["maxRequests", "Maximum reviewed requests per plan", 1],
          ["timeoutMs", "Job timeout (milliseconds)", 1000],
          ["temperature", "Temperature (only if supported)", 0],
          ["topP", "Top P (only if supported)", 0],
        ] as const
      ).map(([key, label, min]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={min}
            step={
              key === "temperature" || key === "topP" || key === "bytesPerToken"
                ? "any"
                : 1
            }
            value={provider.inference?.[key] ?? ""}
            onChange={(e) =>
              change({
                [key]:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      ))}
      <label>
        Response delivery
        <select
          value={
            provider.inference?.streaming === undefined
              ? "auto"
              : String(provider.inference.streaming)
          }
          onChange={(e) =>
            change({
              streaming:
                e.target.value === "auto"
                  ? undefined
                  : e.target.value === "true",
            })
          }
        >
          <option value="auto">Use capability metadata</option>
          <option value="true">Streaming</option>
          <option value="false">Non-streaming JSON</option>
        </select>
      </label>
      {provider.kind !== "ollama" && (
        <label>
          Output token parameter
          <select
            value={provider.inference?.outputParameter ?? "max_tokens"}
            onChange={(e) =>
              change({
                outputParameter: e.target.value as
                  "max_tokens" | "max_completion_tokens",
              })
            }
          >
            <option>max_tokens</option>
            <option>max_completion_tokens</option>
          </select>
        </label>
      )}
      <label>
        Reasoning effort
        <select
          value={provider.inference?.reasoningEffort ?? ""}
          onChange={(e) =>
            change({
              reasoningEffort: (e.target.value ||
                undefined) as InferenceConfig["reasoningEffort"],
            })
          }
        >
          <option value="">Provider default</option>
          <option>low</option>
          <option>medium</option>
          <option>high</option>
        </select>
      </label>
      <label>
        Supported optional parameters (comma-separated override)
        <input
          value={provider.inference?.supportedParameters?.join(", ") ?? ""}
          placeholder="Use discovered metadata unless overridden"
          onChange={(e) =>
            change({
              supportedParameters: e.target.value.trim()
                ? e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : undefined,
            })
          }
        />
      </label>
      <p className="muted">
        Only configure parameters your endpoint documents. Unknown optional
        parameters are omitted with a warning in review. Rejected parameters
        stop visibly; SAGE never silently retries a paid call or drops the
        output limit. Reasoning fields are kept separate from final answers.
      </p>
    </details>
  );
}

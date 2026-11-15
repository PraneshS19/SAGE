import { useState } from "react";
import { RotateCw, Zap } from "lucide-react";
import type { Provider, ModelInfo } from "../lib/schema";
import { rpc } from "../lib/client";

export function ModelSelector({
  provider,
  onModelChange,
}: {
  provider: Provider;
  onModelChange: (model: string) => Promise<void>;
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canonicalId = (id: string) =>
    provider.kind === "ollama" ? id.replace(/:latest$/, "") : id;
  const current = models?.find(
    (item) => canonicalId(item.id) === canonicalId(provider.model),
  );
  const availability =
    models === null
      ? "Availability unchecked"
      : current
        ? "Available"
        : provider.model
          ? "Selected model unavailable"
          : "Choose a model";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const list = await rpc<ModelInfo[]>({ type: "modelsDetail" });
    setModels(list);
    setMessage(
      list.length
        ? "Models refreshed."
        : "The provider returned no compatible models.",
    );
  }

  return (
    <div className="model-control">
      <div className="model-selection">
        <select
          aria-label="Select AI Model"
          value={current?.id ?? provider.model}
          disabled={busy}
          onChange={(event) => {
            const model = event.target.value;
            void run(() => onModelChange(model));
          }}
        >
          {!current && (
            <option value={provider.model}>
              {provider.model || "Choose a model"}
            </option>
          )}
          {models?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.id}
            </option>
          ))}
        </select>
        <details className="model-options">
          <summary>Models</summary>
          <div className="model-popover">
            <small>{availability}</small>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              <RotateCw size={14} /> Refresh models
            </button>
            {provider.kind === "ollama" && provider.model && (
              <button
                type="button"
                disabled={busy || current?.isLoaded}
                onClick={() =>
                  void run(async () => {
                    await rpc({ type: "preloadModel", model: provider.model });
                    await refresh();
                    setMessage("Model loaded into memory.");
                  })
                }
              >
                <Zap size={14} />{" "}
                {current?.isLoaded ? "Loaded in memory" : "Preload model"}
              </button>
            )}
            {current && (
              <dl className="model-details">
                {current.parameterSize && (
                  <>
                    <dt>Parameters</dt>
                    <dd>{current.parameterSize}</dd>
                  </>
                )}
                {current.quantization && (
                  <>
                    <dt>Quantization</dt>
                    <dd>{current.quantization}</dd>
                  </>
                )}
                {current.sizeFormatted && (
                  <>
                    <dt>Model size</dt>
                    <dd>{current.sizeFormatted}</dd>
                  </>
                )}
                {current.vramFormatted && (
                  <>
                    <dt>Memory</dt>
                    <dd>{current.vramFormatted}</dd>
                  </>
                )}
              </dl>
            )}
          </div>
        </details>
      </div>
      {(busy || message) && (
        <small role="status">{busy ? "Working with provider…" : message}</small>
      )}
      {error && (
        <small className="model-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

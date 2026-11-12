import { useCallback, useEffect, useState } from "react";
import {
  RotateCw,
  Zap,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Cpu,
} from "lucide-react";
import type { Provider, ModelInfo } from "../lib/schema";
import { rpc } from "../lib/client";

export function ModelSelector({
  provider,
  onModelChange,
  compact = false,
  onError,
  onNotice,
}: {
  provider: Provider;
  onModelChange: (model: string, contextWindow?: number) => Promise<void>;
  compact?: boolean;
  onError?: (err: string) => void;
  onNotice?: (notice: string) => void;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState<string | null>(null);
  const [missingModel, setMissingModel] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setPreloadStatus(null);
    try {
      const list = await rpc<ModelInfo[]>({ type: "modelsDetail" });
      setModels(list);

      // Check if currently selected model is available
      if (provider.model) {
        const found = list.some(
          (m) =>
            m.id === provider.model ||
            m.name === provider.model ||
            m.id.startsWith(provider.model + ":") ||
            provider.model.startsWith(m.id + ":"),
        );
        if (!found) {
          setMissingModel(provider.model);
          if (onError) {
            onError(
              `Selected model '${provider.model}' is unavailable on this provider. Available: ${list.map((m) => m.name).join(", ") || "(none)"}.`,
            );
          }
        } else {
          setMissingModel(null);
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load models list.";
      if (onError) onError(msg);
    } finally {
      setLoading(false);
    }
  }, [provider.model, onError]);

  // Discovery is user-triggered: opening a surface must not contact a cloud provider.
  useEffect(() => {
    setModels([]);
    setMissingModel(null);
  }, [provider.kind, provider.endpoint]);

  const handleSelect = async (modelId: string) => {
    if (!modelId || modelId === provider.model) return;
    try {
      await onModelChange(modelId);
      setMissingModel(null);
      if (onNotice) {
        onNotice(`Switched model to ${modelId}.`);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to switch model.";
      if (onError) onError(msg);
    }
  };

  const handlePreload = async () => {
    if (!provider.model || preloading) return;
    setPreloading(true);
    setPreloadStatus("Preloading into memory...");
    try {
      const res = await rpc<{ ok: boolean; durationMs: number }>({
        type: "preloadModel",
        model: provider.model,
      });
      const secs = (res.durationMs / 1000).toFixed(1);
      const msg = `Model '${provider.model}' loaded into memory in ${secs}s. Generation speed still depends on the model and device.`;
      setPreloadStatus(msg);
      if (onNotice) onNotice(msg);
      // Refresh to update memory status
      await fetchModels();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to preload model.";
      setPreloadStatus(`Preload failed: ${msg}`);
      if (onError) onError(msg);
    } finally {
      setPreloading(false);
    }
  };

  const currentInfo = models.find(
    (m) =>
      m.id === provider.model ||
      m.name === provider.model ||
      m.id.startsWith(provider.model + ":") ||
      provider.model.startsWith(m.id + ":"),
  );

  if (compact) {
    return (
      <div className="model-selector-compact">
        <select
          aria-label="Select AI Model"
          value={provider.model}
          disabled={loading || preloading}
          onChange={(e) => void handleSelect(e.target.value)}
          style={missingModel ? { borderColor: "#e53e3e" } : undefined}
        >
          {models.length === 0 ? (
            <option value={provider.model}>
              {provider.model
                ? `${provider.model} (unverified)`
                : "No models found"}
            </option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.parameterSize ? ` (${m.parameterSize}` : ""}
                {m.quantization ? ` • ${m.quantization}` : ""}
                {m.sizeFormatted ? ` • ${m.sizeFormatted}` : ""}
                {m.parameterSize ? ")" : ""}
                {m.isLoaded ? " [⚡ In Memory]" : ""}
              </option>
            ))
          )}
        </select>

        <button
          type="button"
          className="icon-btn"
          title="Refresh models from server"
          aria-label="Refresh models"
          disabled={loading}
          onClick={() => void fetchModels()}
        >
          <RotateCw size={13} className={loading ? "spin" : ""} />
        </button>

        {provider.kind === "ollama" && provider.model && (
          <button
            type="button"
            className="icon-btn"
            title={
              currentInfo?.isLoaded
                ? "Model is loaded in memory"
                : "Preload model into memory"
            }
            aria-label="Preload model"
            disabled={preloading || currentInfo?.isLoaded}
            onClick={() => void handlePreload()}
            style={{
              color: currentInfo?.isLoaded ? "var(--green)" : "var(--text)",
              cursor: currentInfo?.isLoaded ? "default" : "pointer",
            }}
          >
            <Zap
              size={13}
              fill={currentInfo?.isLoaded ? "currentColor" : "none"}
            />
          </button>
        )}

        {currentInfo?.isLoaded && (
          <span
            className="memory-badge"
            title={
              currentInfo.vramFormatted
                ? `Using ${currentInfo.vramFormatted}`
                : "Active in memory"
            }
          >
            ⚡ In Memory
          </span>
        )}

        {missingModel && (
          <span
            className="error-badge"
            title="Selected model is not installed on this server"
          >
            <AlertTriangle size={12} /> Unavailable
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="model-selector-full">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <label
          htmlFor="sage-model-select"
          style={{ fontWeight: 600, fontSize: "14px", margin: 0 }}
        >
          Installed models
        </label>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            onClick={() => void fetchModels()}
            disabled={loading}
            style={{
              fontSize: "12px",
              padding: "3px 8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <RotateCw size={12} className={loading ? "spin" : ""} />
            {loading ? "Refreshing..." : "Refresh Models"}
          </button>

          {provider.kind === "ollama" && provider.model && (
            <button
              type="button"
              onClick={() => void handlePreload()}
              disabled={preloading || currentInfo?.isLoaded}
              style={{
                fontSize: "12px",
                padding: "3px 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Zap
                size={12}
                fill={currentInfo?.isLoaded ? "currentColor" : "none"}
              />
              {preloading
                ? "Loading..."
                : currentInfo?.isLoaded
                  ? "Loaded in Memory"
                  : "Preload Model"}
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <select
          id="sage-model-select"
          value={provider.model}
          disabled={loading || preloading}
          onChange={(e) => void handleSelect(e.target.value)}
          style={missingModel ? { borderColor: "#e53e3e" } : undefined}
        >
          {models.length === 0 ? (
            <option value={provider.model}>
              {provider.model
                ? `${provider.model} (unverified)`
                : "No models found"}
            </option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.parameterSize ? ` — ${m.parameterSize}` : ""}
                {m.quantization ? ` (${m.quantization})` : ""}
                {m.sizeFormatted ? ` • ${m.sizeFormatted}` : ""}
                {m.isLoaded ? " [⚡ Loaded in Memory]" : ""}
              </option>
            ))
          )}
        </select>
      </div>

      {missingModel && (
        <div
          style={{
            background: "rgba(229, 62, 62, 0.1)",
            border: "1px solid #e53e3e",
            borderRadius: "6px",
            padding: "8px 10px",
            fontSize: "12px",
            color: "#e53e3e",
            marginBottom: "10px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={16} />
          <div>
            <strong>Model unavailable:</strong> '{missingModel}' is not
            available on this provider. Refresh discovery or choose an available
            model.
          </div>
        </div>
      )}

      {preloadStatus && (
        <div
          style={{
            fontSize: "12px",
            color: preloadStatus.includes("failed")
              ? "#e53e3e"
              : "var(--green)",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {preloadStatus.includes("failed") ? (
            <AlertTriangle size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {preloadStatus}
        </div>
      )}

      {currentInfo && (
        <div className="model-details-grid">
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>
              Parameters
            </div>
            <div style={{ fontWeight: 600 }}>
              {currentInfo.parameterSize || "N/A"}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>
              Quantization
            </div>
            <div style={{ fontWeight: 600 }}>
              {currentInfo.quantization || "N/A"}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>
              Download Size
            </div>
            <div style={{ fontWeight: 600 }}>
              {currentInfo.sizeFormatted || "N/A"}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>
              Memory Status
            </div>
            <div
              style={{
                fontWeight: 600,
                color: currentInfo.isLoaded ? "var(--green)" : "inherit",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {currentInfo.isLoaded ? (
                <>
                  <Cpu size={12} />
                  <span>In VRAM ({currentInfo.vramFormatted || "Active"})</span>
                </>
              ) : (
                <>
                  <HardDrive size={12} />
                  <span>On Disk (not loaded)</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

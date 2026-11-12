import { InferenceSettings } from "./InferenceSettings";
import { selectModel } from "../lib/model-profiles";
import { modelIdentity } from "../lib/inference-config";
import { useEffect, useState, useRef } from "react";
import {
  defaults,
  type Settings,
  type Provider,
  type DiagnosticReport,
} from "../lib/schema";
import { endpointInfo } from "../lib/security";
import { rpc, openWorkspace } from "../lib/client";
import { ModelSelector } from "./ModelSelector";
const endpoints: Record<Provider["kind"], string> = {
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234/v1",
  llamacpp: "http://127.0.0.1:8080/v1",
  openrouter: "https://openrouter.ai/api/v1",
  custom: "https://example.com/v1",
};
export function SettingsView({
  settings,
  onSave,
  onAction,
}: {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
  onAction: (action: () => Promise<void>) => Promise<void>;
}) {
  const [form, setForm] = useState(settings);
  const editedProviders = useRef<Partial<Record<Provider["kind"], Provider>>>(
    {},
  );
  const [started, setStarted] = useState(false);
  const [modelList, setModelList] = useState<string[]>([]);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState("General");
  const [permissions, setPermissions] = useState<string[]>([]);
  const settingsFingerprint = JSON.stringify(settings);
  useEffect(() => setForm(settings), [settingsFingerprint]);
  const provider = (value: Partial<Provider>) =>
    setForm((current) => {
      if (
        value.capabilities &&
        value.capabilities.identity !== modelIdentity(current.provider)
      )
        return current;
      return { ...current, provider: { ...current.provider, ...value } };
    });
  const chooseProvider = (kind: Provider["kind"]) => {
    editedProviders.current[form.provider.kind] = form.provider;
    const next = editedProviders.current[kind] ??
      settings.providerProfiles?.[kind] ?? {
        ...defaults.provider,
        kind,
        endpoint: endpoints[kind],
      };
    setForm({ ...form, provider: next });
    setModelList([]);
    setReport(null);
    setMessage("");
    setSection("AI Providers");
  };
  const finish = () =>
    onAction(async () => {
      if (!form.provider.model.trim())
        throw new Error("Choose a chat model first.");
      await onSave({ ...form, onboarded: true });
      await openWorkspace();
    });
  const save = () =>
    onAction(async () => {
      endpointInfo(form.provider.endpoint);
      await onSave(form);
      setMessage("Settings saved.");
    });
  async function connect() {
    const info = endpointInfo(form.provider.endpoint);
    const access = { origins: [info.origin] };
    if (
      !(await chrome.permissions.contains(access)) &&
      !(await chrome.permissions.request(access))
    )
      throw new Error(
        "Endpoint permission was declined. No connection was attempted.",
      );
    const rep = await rpc<DiagnosticReport>({
      type: "testConnection",
      provider: form.provider,
      inference: false,
    });
    setReport(rep);
    setModelList(rep.models);
    setMessage(
      `${rep.ok ? "Connected." : "Connection check failed."} ${rep.models.length} models available. ${rep.summary}`,
    );
  }
  async function runDiagnostics() {
    if (
      endpointInfo(form.provider.endpoint).location !== "Local" &&
      !confirm(
        "Send the test prompt “Reply with the single word OK.” to this provider? Up to 5 output tokens; provider charges or quota may apply. No page content is included.",
      )
    )
      return;
    const rep = await rpc<DiagnosticReport>({
      type: "testConnection",
      provider: form.provider,
      inference: true,
    });
    setReport(rep);
    if (rep.models && rep.models.length > 0) {
      setModelList(rep.models);
    }
    setMessage(
      rep.ok
        ? `Connection verified: ${rep.summary}`
        : `Connection test failed: ${rep.summary}`,
    );
  }
  return (
    <div className="settings-layout">
      <aside aria-label="Settings sections">
        {[
          "General",
          "AI Providers",
          "Privacy and Permissions",
          "Blocked Websites",
          "Skills",
          "History and Data",
          "Appearance",
          "About SAGE",
        ].map((s) => (
          <button
            aria-current={section === s ? "page" : undefined}
            key={s}
            onClick={() => {
              setSection(s);
              setMessage("");
            }}
          >
            {s}
          </button>
        ))}
      </aside>
      <section className="settings-content">
        <div className="eyebrow">MAKE SAGE YOURS</div>
        <h1>{section}</h1>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {section === "General" && (
          <>
            <h2>
              {settings.onboarded
                ? "Your research, your rules."
                : "Welcome to SAGE."}
            </h2>
            <p>
              AI assistance for your browser, with your privacy under your
              control.
            </p>
            <p>
              Summarize webpages, ask about documents, and compare sources using
              your preferred model. Review what SAGE sends before every answer.
            </p>
            {!settings.onboarded && !started ? (
              <button className="primary" onClick={() => setStarted(true)}>
                Get Started
              </button>
            ) : (
              <div className="onboarding">
                <h3>Local AI</h3>
                <p>
                  Run a model on your computer. Install and start a local
                  server, then install a compatible chat model. Once set up,
                  local inference can work offline.
                </p>
                <button onClick={() => chooseProvider("ollama")}>
                  Set up Local AI
                </button>
                <h3>Cloud AI</h3>
                <p>
                  Connect with your own API key. Your selected prompt and
                  sources go to the provider after review. Internet access is
                  required and usage charges or limits may apply.
                </p>
                <button onClick={() => chooseProvider("openrouter")}>
                  Set up Cloud AI
                </button>
              </div>
            )}
          </>
        )}
        {section === "AI Providers" && (
          <>
            <p>
              Connect directly to an inference endpoint. No SAGE backend and no
              automatic fallback.
            </p>
            <label>
              Provider
              <select
                aria-label="Provider"
                value={form.provider.kind}
                onChange={(e) =>
                  chooseProvider(e.target.value as Provider["kind"])
                }
              >
                <option value="ollama">Ollama</option>
                <option value="lmstudio">LM Studio</option>
                <option value="llamacpp">llama.cpp</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom OpenAI-compatible API</option>
              </select>
            </label>
            <label>
              Endpoint
              <input
                type="url"
                value={form.provider.endpoint}
                onChange={(e) => provider({ endpoint: e.target.value })}
              />
            </label>
            <p className="muted">
              OpenAI-compatible endpoints include /v1. Ollama uses its native
              API. Remote endpoints require HTTPS. Private IPs are labeled
              Network; DNS names are conservatively labeled Cloud.
            </p>
            <label>
              API key (if required)
              <input
                type="password"
                autoComplete="off"
                value={form.provider.apiKey}
                onChange={(e) => provider({ apiKey: e.target.value })}
              />
            </label>
            <p className="muted">
              Stored in extension-controlled local storage, not an encrypted
              hardware vault. Never included in page scripts or exported
              history.
            </p>
            <div
              className="button-row"
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "8px",
              }}
            >
              <button type="button" onClick={() => void onAction(connect)}>
                {report && !report.ok
                  ? "Retry Connection"
                  : "Grant endpoint access & test connection"}
              </button>
              <button
                type="button"
                onClick={() => void onAction(runDiagnostics)}
              >
                Test Connection
              </button>
            </div>
            {report && (
              <div
                className="diagnostic-box"
                style={{
                  border: "1px solid var(--border, #ccc)",
                  borderRadius: "6px",
                  padding: "12px",
                  margin: "8px 0 14px",
                  background: "rgba(128, 128, 128, 0.05)",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  {report.ok
                    ? "Provider Diagnostics: Connection available (see individual checks)"
                    : "⚠️ Provider Diagnostics: Action Needed"}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "4px 12px",
                    fontSize: "12px",
                    marginBottom: "10px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--border, #ddd)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Selected Provider:</span>
                  <span>{report.provider}</span>
                  <span style={{ fontWeight: 600 }}>Model Name:</span>
                  <span>{report.model}</span>
                  <span style={{ fontWeight: 600 }}>API Endpoint:</span>
                  <code>{report.endpoint}</code>
                  <span style={{ fontWeight: 600 }}>Connection Status:</span>
                  <span>{report.connectionStatus}</span>
                  <span style={{ fontWeight: 600 }}>Origin/CORS Status:</span>
                  <span>{report.corsStatus}</span>
                  <span style={{ fontWeight: 600 }}>Model Availability:</span>
                  <span>{report.modelStatus}</span>
                  <span style={{ fontWeight: 600 }}>Inference Test:</span>
                  <span>{report.inferenceStatus}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {report.steps.map((s, idx) => (
                    <li
                      key={idx}
                      style={{
                        fontSize: "12px",
                        margin: "3px 0",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "6px",
                      }}
                    >
                      <span>
                        {s.status === "pass"
                          ? "🟢"
                          : s.status === "warn"
                            ? "🟡"
                            : "🔴"}
                      </span>
                      <span>
                        <strong>{s.name}:</strong> {s.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ModelSelector
              provider={form.provider}
              onModelChange={async (m, ctx) => {
                const nextProvider = {
                  ...selectModel(form, m),
                  ...(ctx ? { contextWindow: ctx } : {}),
                };
                setForm({ ...form, provider: nextProvider });
                await onSave({ ...form, provider: nextProvider });
                setMessage(`Switched active model to ${m}.`);
              }}
              onError={(err) => setMessage(err)}
              onNotice={(not) => setMessage(not)}
            />
            {modelList.length > 0 && (
              <label>
                Discovered models
                <select
                  aria-label="Discovered models"
                  value={
                    modelList.includes(form.provider.model)
                      ? form.provider.model
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value)
                      provider(selectModel(form, e.target.value));
                  }}
                >
                  <option value="">Choose a model</option>
                  {modelList.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            {report &&
              form.provider.kind === "ollama" &&
              !modelList.length &&
              report.connectionStatus.includes("200") && (
                <p>
                  No compatible local models were found. Choose a model from the
                  Ollama library, run <code>ollama pull &lt;model-tag&gt;</code>
                  , then retry the connection.
                </p>
              )}
            <label>
              Chat model
              <input
                list="models"
                value={form.provider.model}
                placeholder="Discover or enter a model ID"
                onChange={(e) => provider(selectModel(form, e.target.value))}
              />
              <datalist id="models">
                {modelList.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <label>
              Context window (tokens)
              <input
                type="number"
                min={2048}
                max={Number.MAX_SAFE_INTEGER}
                step={1024}
                value={form.provider.contextWindow}
                onChange={(e) =>
                  provider({ contextWindow: Number(e.target.value) })
                }
              />
            </label>
            <p className="muted">
              Configure the effective runtime window, not just the advertised
              maximum. Output and safety reserves adapt to this window and can
              be configured below. No source content is silently dropped.
            </p>
            <InferenceSettings provider={form.provider} update={provider} />
            <details
              open={
                report?.provider === "ollama" &&
                /403/.test(
                  report.summary +
                    report.corsStatus +
                    report.steps.map((s) => s.message).join(" "),
                )
                  ? true
                  : undefined
              }
            >
              <summary>Local server setup & connection troubleshooting</summary>
              <p>
                Ollama: run <code>ollama serve</code> or launch the Ollama
                Windows app. Install your model with{" "}
                <code>ollama pull &lt;your-model-tag&gt;</code>. If Ollama
                returns 403 Forbidden, allow this extension origin in
                <code>OLLAMA_ORIGINS</code>:
              </p>
              <code className="wrap">
                {chrome.runtime.getURL("").replace(/\/$/, "")}
              </code>
              <button
                type="button"
                onClick={() =>
                  void onAction(async () => {
                    await navigator.clipboard.writeText(
                      chrome.runtime.getURL("").replace(/\/$/, ""),
                    );
                    setMessage("Extension origin copied.");
                  })
                }
              >
                Copy extension origin
              </button>
              <p style={{ marginTop: "6px" }}>
                PowerShell (preserves existing allowed origins):
              </p>
              <pre
                className="wrap"
                style={{ fontSize: "11px", padding: "6px" }}
              >
                {`$current = [System.Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'User')
$origin = "${chrome.runtime.getURL("").replace(/\/$/, "")}"
$new = if ($current) { "$current,$origin" } else { $origin }
[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', $new, 'User')`}
              </pre>
              <p>
                After setting, quit Ollama completely from the Windows Taskbar
                system tray and restart it.
              </p>
              <p>
                LM Studio: load a model, start the local server on port 1234,
                and allow the extension origin if required. llama.cpp: start
                llama-server with a chat model on port 8080. Never disable
                authentication on a server exposed to other devices.
              </p>
            </details>
            <button className="primary" onClick={() => void save()}>
              Save provider
            </button>
            {!settings.onboarded && (
              <button
                type="button"
                disabled={!form.provider.model.trim()}
                onClick={() => void finish()}
              >
                Finish setup & open workspace
              </button>
            )}
          </>
        )}
        {section === "Privacy and Permissions" && (
          <>
            <h2>Access is yours to grant.</h2>
            <p>
              SAGE makes no automatic provider requests. Each generation starts
              with a review of its provider, source text and exact prompt. Local
              is a network location, not a security guarantee.
            </p>
            <p>
              Active-tab access is temporary. Research and provider origins are
              optional grants. No broad website access is granted at
              installation. Incognito is disabled.
            </p>
            <button
              onClick={() =>
                void onAction(async () =>
                  setPermissions(
                    (await chrome.permissions.getAll()).origins ?? [],
                  ),
                )
              }
            >
              Inspect granted origins
            </button>
            {permissions.map((origin) => (
              <div className="permission" key={origin}>
                <code>{origin}</code>
                <button
                  onClick={() =>
                    void onAction(async () => {
                      await chrome.permissions.remove({ origins: [origin] });
                      setPermissions(
                        (await chrome.permissions.getAll()).origins ?? [],
                      );
                    })
                  }
                >
                  Revoke
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                void onAction(async () => {
                  await chrome.permissions.remove({ permissions: ["tabs"] });
                  setMessage("Tab-list permission revoked.");
                })
              }
            >
              Revoke tab-list access
            </button>
          </>
        )}
        {section === "Blocked Websites" && (
          <>
            <p>
              One domain per line. Entries also block their subdomains. Login,
              authentication, checkout, banking and patient URL patterns are
              always blocked.
            </p>
            <label>
              Blocked domains
              <textarea
                rows={12}
                value={form.blocked.join("\n")}
                onChange={(e) =>
                  setForm({ ...form, blocked: e.target.value.split("\n") })
                }
              />
            </label>
            <p className="muted">
              URL matching cannot identify every sensitive page. Inspect the
              extracted content before sending it.
            </p>
            <button className="primary" onClick={() => void save()}>
              Save blocklist
            </button>
          </>
        )}
        {section === "Skills" && (
          <>
            <p>
              Create, edit, search and import/export your local prompt templates
              in the workspace’s Skills tab. Skills cannot run tools, grant
              permissions or execute automatically.
            </p>
            <button onClick={() => void onAction(openWorkspace)}>
              Open workspace
            </button>
          </>
        )}
        {section === "History and Data" && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={form.history}
                onChange={(e) =>
                  setForm({ ...form, history: e.target.checked })
                }
              />{" "}
              Save completed conversations locally
            </label>
            <p>
              Disabled by default. Includes questions, answers, selected source
              passages and URLs. Disabling history does not delete previously
              saved conversations.
            </p>
            <label>
              Retention (days)
              <input
                type="number"
                min={1}
                max={365}
                value={form.retentionDays}
                onChange={(e) =>
                  setForm({ ...form, retentionDays: Number(e.target.value) })
                }
              />
            </label>
            <p className="muted">
              Expired conversations are removed on the next SAGE storage access.
              At most 50 conversations (approximately 6 MB) are kept. Session
              results persist until browser exit or explicit clearing.
            </p>
            <button className="primary" onClick={() => void save()}>
              Save retention
            </button>
            <div className="danger-zone">
              <button
                onClick={() =>
                  void onAction(async () => {
                    if (confirm("Delete all saved SAGE conversations?")) {
                      await rpc({ type: "historyDelete" });
                      setMessage("Saved history deleted.");
                    }
                  })
                }
              >
                Delete saved history
              </button>
              <button
                onClick={() =>
                  void onAction(async () => {
                    await rpc({ type: "clearSession" });
                    setMessage("Temporary context and jobs cleared.");
                  })
                }
              >
                Clear temporary context
              </button>
              <button
                onClick={() =>
                  void onAction(async () => {
                    if (
                      confirm(
                        "Delete all SAGE settings, keys, skills, history and temporary data? Browser host permissions must be revoked separately.",
                      )
                    ) {
                      await rpc({ type: "clearAll" });
                      setMessage("All SAGE stored data deleted.");
                    }
                  })
                }
              >
                Reset all SAGE data
              </button>
            </div>
          </>
        )}
        {section === "Appearance" && (
          <>
            <label>
              Theme
              <select
                value={form.theme}
                onChange={(e) =>
                  setForm({
                    ...form,
                    theme: e.target.value as Settings["theme"],
                  })
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button className="primary" onClick={() => void save()}>
              Save appearance
            </button>
          </>
        )}
        {section === "About SAGE" && (
          <>
            <h2>Your Private AI Research Companion</h2>
            <p>Version {chrome.runtime.getManifest().version} · Apache-2.0</p>
            <p>
              Local-first page intelligence, multi-source research and
              inspectable references. No telemetry, advertising or hosted SAGE
              service.
            </p>
            <p>
              Model answers can be inaccurate. Matched citations identify
              existing passages; they are not automatic factual verification.
              Web content can contain prompt injection. SAGE does not give
              models browser tools or permission controls.
            </p>
            <p>
              Helium, Chrome, Brave and Edge compatibility requires
              browser-specific validation. A full-tab workspace is provided when
              side panels are unavailable.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

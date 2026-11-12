import { auditGrounding, numericalRanges } from "../lib/grounding";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  BookOpen,
  Settings as SettingsIcon,
  ArrowUp,
  Square,
  Copy,
  PanelRight,
  Sun,
  Moon,
  Plus,
  FileText,
  Search,
  ShieldCheck,
  ExternalLink,
  RotateCcw,
  Clock,
} from "lucide-react";
import type { State, Source, Draft, Skill, Job, Settings } from "../lib/schema";
import { defaults, skillSchema } from "../lib/schema";
import { rpc, openWorkspace, pageTab } from "../lib/client";
import { endpointInfo, safeLink } from "../lib/security";
import {
  estimateTokens,
  references,
  citationDisplay,
  SYSTEM,
} from "../lib/context";
import { stepMessages } from "../lib/processing";
import { Dialog } from "./Dialog";
import { ModelSelector } from "./ModelSelector";
const Markdown = lazy(() =>
  import("./Markdown").then((m) => ({ default: m.Markdown })),
);
import { SettingsView } from "./Settings";
import "../styles/app.css";

const presets: Record<string, string> = {
  "TL;DR":
    "Give a 2–4 sentence TL;DR covering the main claim, decisive facts and important qualifications. Keep exact numerical values and cite sources. Do not add details missing from this source.",
  "Key Points":
    "Give 4–8 non-repetitive key points, prioritizing findings and limitations. Preserve precise numbers and terminology; cite supporting passages.",
  Detailed:
    "Write a structured summary with headings for purpose, evidence, findings, limitations and open questions. Preserve qualifications and exact numbers. Say when a section lacks evidence; cite source passages.",
  ELI5: "Explain this source in simple language, defining unfamiliar terms. Keep facts and qualifications accurate. Label any analogy as an analogy, and do not add invented source claims.",
};
type TabInfo = { id: number; title: string; url: string };
function exportText(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App({
  surface,
}: {
  surface: "popup" | "workspace" | "options";
}) {
  const [state, setState] = useState<State>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [workspace, setWorkspace] = useState("Page");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("TL;DR");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [active, setActive] = useState<chrome.tabs.Tab>();
  const [search, setSearch] = useState("");
  const [followup, setFollowup] = useState(true);
  const [longContent, setLongContent] = useState(true);
  const [skill, setSkill] = useState<Skill>();
  const file = useRef<HTMLInputElement>(null);
  const skillsFile = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const next = await rpc<State>({ type: "state" });
    setState(next);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message)));
    const listener = () => {
      void refresh().catch((e) => setError(String(e.message)));
    };
    chrome.storage.onChanged.addListener(listener);
    void pageTab()
      .then(setActive)
      .catch(() => {});
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);
  useEffect(() => {
    const theme = state?.settings.theme ?? "system";
    document.documentElement.dataset.theme = theme;
  }, [state?.settings.theme]);
  useEffect(() => {
    setExcluded([]);
  }, [state?.sources.map((s) => s.id).join(",")]);
  useEffect(() => {
    if (state?.selectionAction) {
      const q: Record<string, string> = {
        explain: "Explain the selected text.",
        summarize: "Summarize the selected text.",
        simplify: "Simplify the selected text.",
        translate: "Translate the selected text into English.",
        ask: "",
      };
      setQuestion(q[state.selectionAction] ?? "");
    }
  }, [state?.selectionAction]);
  const [cooldown, setCooldown] = useState<number>(0);
  const isSubmitting = useRef(false);

  useEffect(() => {
    if (
      !state?.job?.cooldownUntil ||
      state.job.draft.provider.endpoint !== state.settings.provider.endpoint ||
      state.job.draft.provider.model !== state.settings.provider.model
    ) {
      setCooldown(0);
      return;
    }
    const check = () => {
      const remaining = Math.max(
        0,
        Math.ceil((state.job!.cooldownUntil! - Date.now()) / 1000),
      );
      setCooldown(remaining);
    };
    check();
    if (state.job.cooldownUntil > Date.now()) {
      const interval = setInterval(check, 1000);
      return () => clearInterval(interval);
    }
  }, [
    state?.job?.cooldownUntil,
    state?.settings.provider.endpoint,
    state?.settings.provider.model,
  ]);

  const act = async (action: () => Promise<void>) => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };
  const settings = state?.settings ?? defaults;
  const sources = state?.sources ?? [];
  const job = state?.job;
  const running = job?.status === "running";
  const location = (() => {
    try {
      return endpointInfo(settings.provider.endpoint).location;
    } catch {
      return "Cloud";
    }
  })();
  async function extract(ids?: number[]) {
    const tab = ids ? undefined : await pageTab();
    const selected =
      ids ?? (tab?.id ? [tab.id] : active?.id ? [active.id] : []);
    if (!selected.length) throw new Error("Select a webpage first.");
    const result = await rpc<{ sources: Source[]; failures: string[] }>({
      type: "extract",
      tabIds: selected,
    });
    setExcluded([]);
    setFollowup(false);
    setNotice(
      result.failures.join("\n") ||
        `Extracted ${result.sources.length} source${result.sources.length === 1 ? "" : "s"}. Review passages below.`,
    );
    await refresh();
    return result.sources;
  }
  async function prepare(
    q: string,
    provided = sources,
    includePrevious = followup,
  ) {
    if (!q.trim())
      throw new Error("Enter a question or choose a summary preset.");
    const used = provided.length ? provided : await extract();
    const preview = await rpc<Draft>({
      type: "prepare",
      sourceIds: used.map((s) => s.id),
      passageIds: used
        .flatMap((s) => s.passages)
        .filter((p) => !excluded.includes(p.id))
        .map((p) => p.id),
      question: q,
      longContent,
      ...(includePrevious && provided.length > 0 && job?.status === "complete"
        ? { previousJobId: job.id }
        : {}),
    });
    setDraft(preview);
  }
  const saveSkills = async (skills: Skill[]) => {
    await rpc({ type: "settings", settings: { ...settings, skills } });
    await refresh();
  };
  function exportJob(item: Job) {
    exportText(
      "sage-research.md",
      `# ${item.draft.question}\n\n${citationDisplay(item.output, item.draft.sources)}\n\n## Sources\n${item.draft.sources.map((s) => `- ${s.title} ${s.url}`).join("\n")}\n\nPassage identifiers locate source text; they do not verify claim support.`,
    );
  }
  const header = (
    <header>
      <div className="brand">
        <span className="brand-mark">
          <BookOpen size={19} />
        </span>
        <div>
          <strong>SAGE</strong>
          <span className="eyebrow">PRIVATE RESEARCH</span>
        </div>
      </div>
      <div className="header-actions">
        <button
          className="icon"
          aria-label="Toggle theme"
          onClick={() =>
            void act(async () => {
              await rpc({
                type: "settings",
                settings: {
                  ...settings,
                  theme: settings.theme === "dark" ? "light" : "dark",
                },
              });
            })
          }
        >
          {settings.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        {surface === "popup" && (
          <button
            className="icon"
            aria-label="Open workspace"
            onClick={() => void act(openWorkspace)}
          >
            <PanelRight size={18} />
          </button>
        )}
        {surface !== "options" && (
          <button
            className="icon"
            aria-label="Settings"
            onClick={() => void chrome.runtime.openOptionsPage()}
          >
            <SettingsIcon size={18} />
          </button>
        )}
      </div>
    </header>
  );
  if (!state)
    return (
      <main className="app">
        {header}
        <p role="status">{error || "Opening your workspace…"}</p>
        {error && (
          <button
            onClick={() =>
              void act(async () => {
                if (
                  confirm(
                    "Reset all SAGE stored data to recover? This deletes settings, keys, skills and history.",
                  )
                ) {
                  await rpc({ type: "clearAll" });
                  await refresh();
                }
              })
            }
          >
            Reset SAGE data
          </button>
        )}
      </main>
    );
  return (
    <main className={`app ${surface}`}>
      {header}
      <div
        className="provider-strip"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className={`privacy ${location.toLowerCase()}`}>
            <span /> {location}
          </span>
          <span className="muted" style={{ fontSize: "12px" }}>
            {settings.provider.kind}
          </span>
        </div>
        <ModelSelector
          provider={settings.provider}
          compact={true}
          onModelChange={async (newModel, ctx) => {
            const updated = await rpc<Settings>({
              type: "switchModel",
              model: newModel,
              contextWindow: ctx,
            });
            setState((prev) => (prev ? { ...prev, settings: updated } : prev));
            setNotice(`Switched model to ${newModel}.`);
          }}
          onError={setError}
          onNotice={setNotice}
        />
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button className="text-button" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {loading && (
        <div className="progress" role="status">
          Working…
        </div>
      )}
      {surface === "options" ? (
        <SettingsView
          settings={settings}
          onSave={async (s) => {
            await rpc({ type: "settings", settings: s });
            await refresh();
          }}
          onAction={act}
        />
      ) : (
        <>
          {surface !== "popup" && (
            <nav aria-label="Workspace">
              {["Page", "Research", "Skills", "History"].map((name) => (
                <button
                  key={name}
                  aria-current={workspace === name ? "page" : undefined}
                  onClick={() => {
                    setWorkspace(name);
                    setSearch("");
                  }}
                >
                  {name}
                </button>
              ))}
            </nav>
          )}
          {(workspace === "Page" || workspace === "Research") && (
            <>
              <section className="intro">
                <div className="eyebrow">
                  {workspace === "Research"
                    ? "BRING YOUR SOURCES TOGETHER"
                    : "A LITTLE CLARITY, ON DEMAND"}
                </div>
                <h1>
                  {workspace === "Research"
                    ? "Find the bigger picture."
                    : "Understand what matters."}
                </h1>
                <p>
                  {workspace === "Research"
                    ? "Compare perspectives. Inspect the evidence. Keep control of your context."
                    : "Read deeply, ask better questions, and keep your research yours."}
                </p>
              </section>
              {!settings.onboarded && (
                <div className="notice">
                  <strong>Start with a local model.</strong>
                  <p>
                    Connect Ollama or another provider in Settings. No account
                    required.
                  </p>
                  <button onClick={() => void chrome.runtime.openOptionsPage()}>
                    Set up SAGE <ExternalLink size={14} />
                  </button>
                </div>
              )}
              {workspace === "Research" ? (
                <section className="card">
                  <div className="section-heading">
                    <h2>Research sources</h2>
                    <button
                      onClick={() =>
                        void act(async () => {
                          if (
                            !(await chrome.permissions.request({
                              permissions: ["tabs"],
                            }))
                          )
                            throw new Error("Tab-list permission declined.");
                          setTabs(await rpc<TabInfo[]>({ type: "tabs" }));
                        })
                      }
                    >
                      Choose tabs
                    </button>
                  </div>
                  {tabs.map((t) => (
                    <label className="tab-row" key={t.id}>
                      <input
                        type="checkbox"
                        checked={picked.includes(t.id)}
                        onChange={(e) =>
                          setPicked(
                            e.target.checked
                              ? [...picked, t.id]
                              : picked.filter((id) => id !== t.id),
                          )
                        }
                      />
                      <span>
                        {t.title}
                        <small>{new URL(t.url).hostname}</small>
                      </span>
                    </label>
                  ))}
                  {picked.length > 0 && (
                    <button
                      onClick={() =>
                        void act(async () => {
                          const origins = [
                            ...new Set(
                              tabs
                                .filter((t) => picked.includes(t.id))
                                .map((t) => new URL(t.url).origin + "/*"),
                            ),
                          ];
                          if (!(await chrome.permissions.request({ origins })))
                            throw new Error(
                              "Source access declined. No content was read.",
                            );
                          await extract(picked);
                        })
                      }
                    >
                      Extract {picked.length} selected tabs
                    </button>
                  )}
                  <div className="chips">
                    {[
                      "Compare",
                      "Common Points",
                      "Differences",
                      "Research Synthesis",
                    ].map((q) => (
                      <button
                        key={q}
                        disabled={!sources.length || running}
                        onClick={() =>
                          void act(() =>
                            prepare(
                              q === "Compare"
                                ? "Compare each source, shared conclusions, differences and contradictions. Include a Markdown comparison table and a source-backed synthesis."
                                : q,
                            ),
                          )
                        }
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="card current-page">
                  <div className="source-icon">
                    <FileText size={21} />
                  </div>
                  <div>
                    <span className="eyebrow">
                      {sources.length ? "SELECTED CONTEXT" : "CURRENT PAGE"}
                    </span>
                    <h2>
                      {sources[0]?.title ||
                        active?.title ||
                        "Open a webpage to begin"}
                    </h2>
                    <small>
                      {sources[0]?.kind === "pdf" || sources[0]?.kind === "docx"
                        ? `Local ${sources[0].kind.toUpperCase()}`
                        : sources[0]?.url || active?.url
                          ? (() => {
                              try {
                                return new URL(
                                  sources[0]?.url || active?.url || "",
                                ).hostname;
                              } catch {
                                return "Extension workspace";
                              }
                            })()
                          : "No page selected"}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    disabled={loading || running}
                    onClick={() =>
                      void act(async () => {
                        await extract();
                      })
                    }
                  >
                    {sources.length ? "Refresh" : "Extract"}
                  </button>
                </section>
              )}
              {workspace === "Page" && (
                <div className="summary-controls">
                  <select
                    aria-label="Summary style"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    {Object.keys(presets).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    className="primary"
                    disabled={loading || running || cooldown > 0}
                    onClick={() =>
                      void act(async () => {
                        setFollowup(false);
                        await prepare(presets[mode]!, sources, false);
                      })
                    }
                  >
                    <BookOpen size={16} />{" "}
                    {cooldown > 0 ? `Cooldown (${cooldown}s)` : "Summarize"}
                  </button>
                  <button
                    className="icon"
                    title="Import PDF or DOCX"
                    aria-label="Import PDF or DOCX"
                    onClick={() => file.current?.click()}
                  >
                    <FileText size={18} />
                  </button>
                </div>
              )}
              <input
                hidden
                ref={file}
                type="file"
                accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected)
                    void act(async () => {
                      if (selected.size > 25 * 1024 * 1024)
                        throw new Error(
                          "Document is larger than the 25 MB import limit.",
                        );
                      if (/\.docx$/i.test(selected.name)) {
                        const { extractDocx } =
                          await import("../features/docx");
                        const document = await extractDocx(
                          await selected.arrayBuffer(),
                        );
                        await rpc({
                          type: "importDocx",
                          name: selected.name,
                          ...document,
                        });
                      } else if (/\.pdf$/i.test(selected.name)) {
                        const { extractPdf } = await import("../features/pdf");
                        const pages = await extractPdf(
                          await selected.arrayBuffer(),
                        );
                        await rpc({
                          type: "importPdf",
                          name: selected.name,
                          pages,
                        });
                      } else
                        throw new Error(
                          "Choose a PDF or DOCX file. Other document formats are unsupported.",
                        );
                      setFollowup(false);
                      await refresh();
                    });
                  e.target.value = "";
                }}
              />
              <label className="followup">
                <input
                  type="checkbox"
                  checked={longContent}
                  onChange={(e) => {
                    setLongContent(e.target.checked);
                    setFollowup(false);
                  }}
                />
                Process oversized context in batches (review request count
                first)
              </label>
              {sources.length > 0 && (
                <details className="context">
                  <summary>
                    {sources.length} source{sources.length === 1 ? "" : "s"} · ~
                    {estimateTokens(
                      sources
                        .flatMap((s) => s.passages)
                        .filter((p) => !excluded.includes(p.id))
                        .map((p) => p.text)
                        .join(""),
                    ).toLocaleString()}{" "}
                    context tokens <span>Inspect & exclude</span>
                  </summary>
                  <p className="muted">
                    Only checked passages will be included. Token counts are
                    estimates. Source text is untrusted.
                  </p>
                  {sources.map((s) => (
                    <div key={s.id}>
                      <h3>
                        {s.title} <span className="muted">{s.kind}</span>
                      </h3>
                      {s.metadata && (
                        <p className="muted">
                          {s.metadata.wordCount.toLocaleString()} words ·{" "}
                          {s.metadata.method} ·{" "}
                          {s.metadata.language || "language unknown"} · snapshot{" "}
                          {new Date(s.metadata.extractedAt).toLocaleString()}.
                          Refresh after page changes.
                        </p>
                      )}
                      {s.metadata?.warnings?.map((w) => (
                        <p key={w} className="notice">
                          {w}
                        </p>
                      ))}
                      <button
                        onClick={() => {
                          const ids = s.passages.map((p) => p.id);
                          setExcluded(
                            excluded.some((id) => ids.includes(id))
                              ? excluded.filter((id) => !ids.includes(id))
                              : [...excluded, ...ids],
                          );
                          setFollowup(false);
                        }}
                      >
                        Include / exclude this source
                      </button>
                      {s.passages.map((p) => (
                        <label className="passage" key={p.id}>
                          <input
                            type="checkbox"
                            checked={!excluded.includes(p.id)}
                            onChange={(e) => {
                              setExcluded(
                                e.target.checked
                                  ? excluded.filter((id) => id !== p.id)
                                  : [...excluded, p.id],
                              );
                              setFollowup(false);
                            }}
                          />
                          <span>
                            <small>
                              {p.section ? `${p.section} · ` : ""}
                              {p.page ? `Page ${p.page} · ` : ""}
                              {p.seconds !== undefined
                                ? `${Math.floor(p.seconds / 60)}:${String(p.seconds % 60).padStart(2, "0")} · `
                                : ""}
                              {p.id}
                            </small>
                            {p.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </details>
              )}
              {job ? (
                <section className="answer" aria-label="AI response">
                  <div className="section-heading">
                    <span className="eyebrow">
                      {job.status === "running"
                        ? "GENERATING"
                        : job.status.toUpperCase()}{" "}
                      · SAGE
                    </span>
                    <div className="header-actions">
                      <button
                        className="icon"
                        aria-label="Copy output"
                        onClick={() =>
                          void act(async () => {
                            await navigator.clipboard.writeText(
                              citationDisplay(job.output, job.draft.sources),
                            );
                            setNotice("Copied output.");
                          })
                        }
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        className="icon"
                        aria-label="Regenerate"
                        disabled={running}
                        onClick={() =>
                          void act(async () => {
                            setFollowup(false);
                            const d = await rpc<Draft>({
                              type: "prepare",
                              sourceIds: sources.map((s) => s.id),
                              passageIds: sources
                                .flatMap((s) => s.passages)
                                .filter((p) => !excluded.includes(p.id))
                                .map((p) => p.id),
                              question: job.draft.question,
                              longContent: !!job.draft.plan || longContent,
                            });
                            setDraft(d);
                          })
                        }
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => exportJob(job)}
                      >
                        Export
                      </button>
                    </div>
                  </div>
                  <h3>{job.title || job.draft.question}</h3>
                  <small>
                    Answer context:{" "}
                    {job.draft.sources.map((s) => s.title).join(" · ")} ·{" "}
                    {job.draft.provider.kind} / {job.draft.provider.model}
                  </small>
                  <Suspense fallback={<p>Rendering response…</p>}>
                    <Markdown
                      sourceLinks={false}
                      text={
                        citationDisplay(job.output, job.draft.sources) ||
                        (running
                          ? "Loading model into memory & preparing response… (initial generation may take a few seconds)"
                          : "No answer was generated. Check the job status and error below.")
                      }
                    />
                  </Suspense>
                  {job.progress && (
                    <p role="status">
                      Step {job.progress.step} / {job.progress.total} ·{" "}
                      {job.progress.stage}
                      {job.status === "running" ? " in progress" : ""}
                    </p>
                  )}
                  {job.draft.plan && (
                    <p>
                      Coverage:{" "}
                      {job.summaries?.filter(
                        (s) =>
                          job.draft.plan!.steps.find(
                            (step) => step.id === s.stepId,
                          )?.kind === "map",
                      ).length ?? 0}{" "}
                      /{" "}
                      {
                        job.draft.plan.steps.filter((s) => s.kind === "map")
                          .length
                      }{" "}
                      source batches processed.{" "}
                      {job.status === "complete"
                        ? "Synthesis finished. Processing coverage does not establish claim support."
                        : "Analysis is partial until all batches and synthesis finish."}
                    </p>
                  )}
                  {job.draft.plan && !running && job.status !== "complete" && (
                    <button
                      onClick={() =>
                        void act(async () =>
                          setDraft(
                            await rpc<Draft>({
                              type: "prepareResume",
                              jobId: job.id,
                            }),
                          ),
                        )
                      }
                    >
                      Review retry from failed step
                    </button>
                  )}
                  {!!job.summaries?.length && (
                    <details>
                      <summary>
                        Inspect {job.summaries.length} intermediate notes (lossy
                        model output)
                      </summary>
                      {job.summaries.map((s) => (
                        <div key={s.stepId}>
                          {s.recovered && (
                            <p className="notice">
                              Used bounded source excerpts because the model
                              notes exceeded their{" "}
                              {s.recovered === "size" ? "byte" : "token"} limit.
                              Excerpts are selective.
                            </p>
                          )}
                          <h3>Step {s.stepId + 1}</h3>
                          <pre className="wrap">{s.text}</pre>
                          <small>
                            Derived from {s.passageIds.length} selected
                            passages. Original references remain inspectable
                            below.
                          </small>
                        </div>
                      ))}
                    </details>
                  )}
                  {job.error && (
                    <div className="alert" role="alert">
                      <p style={{ margin: 0 }}>{job.error}</p>
                      {cooldown > 0 && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            padding: "4px 8px",
                            borderRadius: "4px",
                            background: "rgba(221, 107, 32, 0.15)",
                            color: "#dd6b20",
                            marginTop: "8px",
                          }}
                        >
                          <Clock size={13} /> Rate limit cooldown active:{" "}
                          {cooldown}s remaining before you can retry
                        </div>
                      )}
                    </div>
                  )}
                  <p className="evidence-note">
                    AI interpretation can be wrong. A matched reference
                    identifies source text; it does not verify that the passage
                    supports the claim.
                  </p>
                  {!!job.output &&
                    !references(job.output, job.draft.sources).some(
                      (r) => r.passage,
                    ) && (
                      <p className="notice">
                        No valid passage references were supplied. Support for
                        this answer is unverified.
                      </p>
                    )}
                  {!!job.output && (
                    <details className="evidence-note">
                      <summary>
                        Evidence checks: semantic support unverified
                      </summary>
                      <p>
                        {
                          auditGrounding(job.output, job.draft.sources)
                            .explanation
                        }
                      </p>
                      <p>
                        Numerical expressions not found verbatim in cited
                        passages:{" "}
                        {auditGrounding(
                          job.output,
                          job.draft.sources,
                        ).missingValues.join(", ") ||
                          "None detected (not proof of correctness)"}
                        .
                      </p>
                      {numericalRanges(job.draft.sources).map((range) => (
                        <p key={range.unit}>
                          Deterministically computed from literal source
                          mentions: {range.unit}, minimum {range.minimum.value},
                          maximum {range.maximum.value} ({range.mentions}{" "}
                          mentions). {range.limitation}
                        </p>
                      ))}
                      {auditGrounding(job.output, job.draft.sources).quotes.map(
                        (q, i) => (
                          <p key={i}>
                            {q.found
                              ? "Exact quotation found"
                              : "Quotation not found"}
                            : {q.quote}
                          </p>
                        ),
                      )}
                    </details>
                  )}
                  <div className="citations">
                    {references(job.output, job.draft.sources).map((ref) => (
                      <details key={ref.id}>
                        <summary>
                          {ref.passage
                            ? "Passage found"
                            : "Unverified reference"}{" "}
                          · {ref.id}
                        </summary>
                        {ref.passage ? (
                          <>
                            <p>
                              {ref.source!.title}
                              {ref.passage.page
                                ? ` · Page ${ref.passage.page}`
                                : ""}
                              {ref.passage.section
                                ? ` · ${ref.passage.section}`
                                : ""}
                            </p>
                            <blockquote>{ref.passage.text}</blockquote>
                            <button
                              onClick={() =>
                                void act(async () => {
                                  await rpc({
                                    type: "navigate",
                                    sourceId: ref.source!.id,
                                    passageId: ref.id,
                                  });
                                })
                              }
                              disabled={!ref.source?.url}
                            >
                              Open source <ExternalLink size={13} />
                            </button>
                          </>
                        ) : (
                          <p>
                            This reference does not match a selected passage.{" "}
                            {ref.source?.url && safeLink(ref.source.url) ? (
                              <a
                                href={ref.source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open the identified source (precise passage
                                unavailable)
                              </a>
                            ) : (
                              "No supporting source could be identified."
                            )}
                          </p>
                        )}
                      </details>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="empty">
                  <BookOpen size={28} />
                  <h3>Your next insight starts here.</h3>
                  <p>
                    Summarize a page or ask a question.
                    <br />
                    You’ll review exactly what SAGE sends.
                  </p>
                  <div className="privacy-note">
                    <ShieldCheck size={14} /> No telemetry. No automatic cloud
                    sharing.
                  </div>
                </div>
              )}
              <section className="composer">
                <label className="sr-only" htmlFor="question">
                  Ask about your sources
                </label>
                <textarea
                  id="question"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (cooldown > 0) {
                        setError(
                          `Rate limit cooldown active. Please wait ${cooldown}s before submitting.`,
                        );
                        return;
                      }
                      if (!loading && !running && question.trim()) {
                        void act(() => prepare(question));
                      }
                    }
                  }}
                  placeholder={
                    workspace === "Research"
                      ? "What connects these sources?"
                      : "Ask about this page, or type / for a skill…"
                  }
                />
                {question.startsWith("/") && (
                  <div className="slash">
                    {settings.skills
                      .filter((s) =>
                        s.name
                          .toLowerCase()
                          .includes(question.slice(1).toLowerCase()),
                      )
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setQuestion(s.prompt)}
                        >
                          {s.name}
                        </button>
                      ))}
                  </div>
                )}
                <div className="composer-footer">
                  <span>
                    {sources.length
                      ? `${sources.length} selected source${sources.length > 1 ? "s" : ""}`
                      : "Current page"}{" "}
                    · {location.toLowerCase()}
                  </span>
                  {running ? (
                    <button
                      aria-label="Stop generation"
                      onClick={() =>
                        void act(async () => {
                          await rpc({ type: "cancel", jobId: job.id });
                        })
                      }
                    >
                      <Square size={14} /> Stop
                    </button>
                  ) : (
                    <button
                      className="primary icon"
                      aria-label="Review and send question"
                      disabled={loading || cooldown > 0}
                      onClick={() => void act(() => prepare(question))}
                    >
                      <ArrowUp size={18} />
                    </button>
                  )}
                </div>
              </section>
              {job?.status === "complete" && (
                <label className="followup">
                  <input
                    type="checkbox"
                    checked={followup}
                    onChange={(e) => setFollowup(e.target.checked)}
                  />{" "}
                  Include previous conversation (shown in prompt review)
                </label>
              )}
            </>
          )}
          {workspace === "Skills" && (
            <section>
              <div className="intro">
                <div className="eyebrow">YOUR REPEATABLE THINKING TOOLS</div>
                <h1>A skill for every question.</h1>
                <p>Local prompt templates. Run only when you choose.</p>
              </div>
              <div className="toolbar">
                <Search size={16} />
                <input
                  aria-label="Search skills"
                  placeholder="Search skills"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  onClick={() =>
                    setSkill({
                      id: crypto.randomUUID(),
                      name: "",
                      description: "",
                      prompt: "",
                      contextMode: "page",
                    })
                  }
                >
                  <Plus size={15} /> New
                </button>
              </div>
              {settings.skills
                .filter((s) =>
                  (s.name + s.description)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((s) => (
                  <article className="card skill" key={s.id}>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <div className="toolbar">
                      <button
                        onClick={() => {
                          setQuestion(s.prompt);
                          setWorkspace("Page");
                          if (
                            s.contextMode === "selection" &&
                            !sources.every((x) => x.kind === "selection")
                          )
                            setNotice(
                              "This skill prefers selection context. Select text on a page and use the SAGE context menu first.",
                            );
                        }}
                      >
                        Use skill
                      </button>
                      <button
                        className="text-button"
                        disabled={loading}
                        onClick={() => setSkill(s)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          void act(() =>
                            saveSkills(
                              settings.skills.filter((x) => x.id !== s.id),
                            ),
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              <div className="toolbar">
                <button
                  onClick={() =>
                    exportText(
                      "sage-skills.json",
                      JSON.stringify(settings.skills, null, 2),
                      "application/json",
                    )
                  }
                >
                  Export skills
                </button>
                <button onClick={() => skillsFile.current?.click()}>
                  Import skills
                </button>
              </div>
              <input
                hidden
                type="file"
                accept="application/json"
                ref={skillsFile}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void act(async () => {
                      if (f.size > 1000000)
                        throw new Error("Skills file exceeds 1 MB.");
                      const imported = skillSchema
                        .array()
                        .max(100)
                        .parse(JSON.parse(await f.text()));
                      await saveSkills([
                        ...new Map(
                          [...settings.skills, ...imported].map((s) => [
                            s.id,
                            s,
                          ]),
                        ).values(),
                      ]);
                    });
                  e.target.value = "";
                }}
              />
              {skill && (
                <form
                  className="card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await saveSkills([
                        ...settings.skills.filter((s) => s.id !== skill.id),
                        skill,
                      ]);
                      setSkill(undefined);
                    });
                  }}
                >
                  <h2>Edit skill</h2>
                  <label>
                    Name
                    <input
                      required
                      maxLength={80}
                      value={skill.name}
                      onChange={(e) =>
                        setSkill({ ...skill, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Description
                    <input
                      maxLength={300}
                      value={skill.description}
                      onChange={(e) =>
                        setSkill({ ...skill, description: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Prompt
                    <textarea
                      aria-label="Prompt"
                      required
                      maxLength={8000}
                      rows={6}
                      value={skill.prompt}
                      onChange={(e) =>
                        setSkill({ ...skill, prompt: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Preferred context
                    <select
                      value={skill.contextMode}
                      onChange={(e) =>
                        setSkill({
                          ...skill,
                          contextMode: e.target.value as Skill["contextMode"],
                        })
                      }
                    >
                      <option value="page">Page</option>
                      <option value="selection">Selection</option>
                    </select>
                  </label>
                  <div className="toolbar">
                    <button className="primary" disabled={loading}>
                      Save skill
                    </button>
                    <button type="button" onClick={() => setSkill(undefined)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
          {workspace === "History" && (
            <section>
              <div className="intro">
                <div className="eyebrow">STORED ON THIS DEVICE</div>
                <h1>Pick up the thread.</h1>
                <p>
                  {settings.history
                    ? `History enabled · ${settings.retentionDays} day retention · up to 50 conversations.`
                    : "History is off. Existing saved conversations remain until you delete them."}
                </p>
              </div>
              <input
                aria-label="Search history"
                placeholder="Search conversations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {state.history
                .filter((j) =>
                  ((j.title ?? "") + j.draft.question + j.output)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((j) => (
                  <article className="card" key={j.id}>
                    <small>{new Date(j.created).toLocaleString()}</small>
                    <h3>{j.title || j.draft.question}</h3>
                    <div className="toolbar">
                      <button
                        onClick={() =>
                          void act(async () => {
                            await rpc({ type: "restore", id: j.id });
                            setWorkspace("Page");
                            setFollowup(true);
                          })
                        }
                      >
                        Open
                      </button>
                      <button onClick={() => exportJob(j)}>Export</button>
                      <button
                        onClick={() =>
                          void act(async () => {
                            const title = prompt(
                              "Conversation name",
                              j.title || j.draft.question,
                            );
                            if (title?.trim())
                              await rpc({
                                type: "historyRename",
                                id: j.id,
                                title: title.trim().slice(0, 120),
                              });
                          })
                        }
                      >
                        Rename
                      </button>
                      <button
                        onClick={() =>
                          void act(async () => {
                            await rpc({ type: "historyDelete", id: j.id });
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              {!state.history.length && (
                <p className="empty">No saved conversations.</p>
              )}
              {state.historyWarning && (
                <p className="alert">{state.historyWarning}</p>
              )}
              <button
                onClick={() =>
                  void act(async () => {
                    if (
                      confirm(
                        "Delete all saved conversations from this device?",
                      )
                    )
                      await rpc({ type: "historyDelete" });
                  })
                }
              >
                Clear all history
              </button>
            </section>
          )}
        </>
      )}
      <footer>
        Your Private AI Research Companion <span>○ SAGE</span>
      </footer>
      {draft && (
        <Dialog onClose={() => setDraft(undefined)}>
          <div className="eyebrow">PRIVACY INSPECTOR</div>
          <h2 id="inspector-title">Review before you send.</h2>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <p className={location === "Local" ? "notice" : "alert"}>
            {location === "Local"
              ? "This request goes to a loopback endpoint on your device. The server’s own handling is outside SAGE’s control."
              : `This content will leave your device for a ${location.toLowerCase()} endpoint. Review the provider’s data handling before continuing.`}
          </p>
          <dl>
            <dt>Provider</dt>
            <dd>
              {draft.provider.kind} ·{" "}
              {draft.provider.model || "No model selected"}
            </dd>
            <dt>Endpoint</dt>
            <dd>{draft.provider.endpoint}</dd>
            <dt>Sources</dt>
            <dd>
              {draft.sources
                .map((s) => (s.url ? new URL(s.url).hostname : s.title))
                .join(", ")}
            </dd>
            <dt>Budget</dt>
            <dd>
              ~{draft.tokens.toLocaleString()} /{" "}
              {draft.provider.contextWindow.toLocaleString()} tokens, including
              response reserve
            </dd>
          </dl>
          <p>
            {draft.excludedCount ?? 0} passages excluded. Only the sources below
            are authorized.
          </p>
          {draft.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          {draft.plan && (
            <div className="notice">
              <strong>
                {draft.plan.steps.length - (draft.resume?.length ?? 0)}{" "}
                sequential requests
              </strong>
              <p>
                Up to ~{draft.plan.inputTokenUpperBound.toLocaleString()} input
                tokens and {draft.plan.outputTokenUpperBound.toLocaleString()}{" "}
                output tokens across this plan. Cloud charges depend on your
                chosen model. Each step uses only selected source text or notes
                generated by earlier approved steps. Synthesis prompts contain
                generated notes that do not exist yet; the exact templates and
                bounds are below.
              </p>
            </div>
          )}
          <details>
            <summary>
              {draft.plan
                ? "Approved request templates and selected source text"
                : "Exact outgoing system prompt, context and conversation"}
            </summary>
            <pre>
              {JSON.stringify(
                draft.plan
                  ? draft.plan.steps
                      .slice(draft.resume?.length ?? 0)
                      .map((step) => ({
                        step: step.id + 1,
                        kind: step.kind,
                        outputTokens: step.outputTokens,
                        messages: [
                          { role: "system", content: SYSTEM },
                          ...stepMessages(draft, step, draft.resume),
                        ],
                      }))
                  : [{ role: "system", content: SYSTEM }, ...draft.messages],
                null,
                2,
              )}
            </pre>
          </details>
          <p className="muted">
            To exclude sections, cancel and uncheck passages in “Inspect &
            exclude”. No request has been sent yet.
          </p>
          <div className="toolbar">
            <button
              className="primary"
              autoFocus
              disabled={loading || cooldown > 0}
              onClick={() =>
                void act(async () => {
                  await rpc({ type: "start", draftId: draft.id });
                  setDraft(undefined);
                  setQuestion("");
                  setFollowup(true);
                  await refresh();
                })
              }
            >
              {cooldown > 0 ? `Cooldown (${cooldown}s)` : "Confirm & send"}
            </button>
            <button onClick={() => setDraft(undefined)}>Cancel</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

import { discoverCapabilities } from "../lib/inference-adapters";
import { effectiveCapabilities, modelIdentity } from "../lib/inference-config";
import { selectModel, modelProfile } from "../lib/model-profiles";
import { defineBackground } from "wxt/utils/define-background";
import {
  requestSchema,
  type Request,
  type Source,
  type Job,
  type Draft,
  type State,
  type Turn,
  type Provider,
  type Settings,
} from "../lib/schema";
import {
  getSettings,
  history,
  saveHistory,
  clearResearchCheckpoint,
  loadResearchCheckpoint,
  saveResearchCheckpoint,
} from "../lib/storage";
import { assertPage, endpointInfo, trustedSender } from "../lib/security";
import { hash, passages, canonical } from "../lib/context";
import { prepareResearch, executePlan } from "../lib/processing";
import {
  generate,
  models,
  modelsDetail,
  preloadModel,
  testConnection,
  ProviderError,
} from "../lib/provider";
import type { Extracted } from "../lib/extraction";

export default defineBackground(() => {
  const controllers = new Map<string, AbortController>();
  const tasks = new Map<string, Promise<void>>();
  let busy = false;
  const ready = (async () => {
    await chrome.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    const { job: sessionJob } = (await chrome.storage.session.get("job")) as {
      job?: Job;
    };
    const job =
      sessionJob ?? (await loadResearchCheckpoint().catch(() => undefined));
    if (job && (job.status === "running" || !sessionJob)) {
      job.status = "interrupted";
      job.error =
        "The browser stopped the background worker. Partial output is preserved. Review and regenerate to retry.";
      await chrome.storage.session.set({
        job,
        ...(!sessionJob ? { sources: job.draft.sources } : {}),
      });
    }
  })();
  const menus = {
    explain: "Explain Selection",
    summarize: "Summarize Selection",
    simplify: "Simplify Selection",
    translate: "Translate Selection",
    ask: "Ask SAGE",
  };
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    void (async () => {
      await ready;
      await chrome.contextMenus.removeAll();
      for (const [id, title] of Object.entries(menus))
        chrome.contextMenus.create({ id, title, contexts: ["selection"] });
      if (reason === "install") await chrome.runtime.openOptionsPage();
    })().catch(() => {});
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Invoke panel in the user gesture before any awaited storage operation.
    const opening =
      typeof chrome.sidePanel?.open === "function" &&
      tab?.windowId !== undefined
        ? chrome.sidePanel.open({ windowId: tab.windowId }).catch(() =>
            chrome.tabs.create({
              url: chrome.runtime.getURL("/sidepanel.html"),
            }),
          )
        : chrome.tabs.create({ url: chrome.runtime.getURL("/sidepanel.html") });
    void (async () => {
      await ready;
      await opening;
      const settings = await getSettings();
      if (!tab?.url || tab.incognito || !info.selectionText)
        throw new Error(
          "Selection unavailable or private browsing is not supported.",
        );
      assertPage(tab.url, settings.blocked);
      if (info.selectionText.length > 300000)
        throw new Error("Selected text is too large.");
      const id = "s" + hash(tab.url + "#selection" + info.selectionText);
      const source: Source = {
        id,
        title: tab.title ?? "Selected text",
        url: tab.url,
        tabId: tab.id,
        kind: "selection",
        passages: passages(info.selectionText, id),
      };
      await chrome.storage.session.set({
        sources: [source],
        selectionAction: String(info.menuItemId),
      });
    })().catch(async (error: unknown) => {
      await chrome.storage.session.set({
        selectionError:
          error instanceof Error ? error.message : "Selection failed.",
      });
    });
  });
  async function sourcePolicy(s: Source, checkNavigation = false) {
    const settings = await getSettings();
    if (s.kind !== "pdf" && s.kind !== "docx")
      assertPage(s.url, settings.blocked);
    if (checkNavigation && s.tabId) {
      let tab: chrome.tabs.Tab | undefined;
      try {
        tab = await chrome.tabs.get(s.tabId);
      } catch {
        /* Closed source remains a labeled snapshot. */
      }
      if (tab?.incognito)
        throw new Error("Private source tabs are not supported.");
      if (tab?.url && tab.url.split("#")[0] !== s.url.split("#")[0])
        throw new Error(
          "A source tab navigated after extraction. Refresh the source before sending; old context was not transmitted.",
        );
    }
  }
  async function providerPermission(endpoint: string) {
    const { origin } = endpointInfo(endpoint);
    if (!(await chrome.permissions.contains({ origins: [origin] })))
      throw new Error(
        "Provider permission missing. Open Settings and grant access to this endpoint.",
      );
  }
  const hasContinuation = (m: Turn["continuation"]) =>
    !!(m?.thinking || m?.reasoningDetails?.length);
  async function run(job: Job, provider: Provider) {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error(
            "Generation reached the configured timeout. Review completed work or adjust this model's timeout.",
          ),
        ),
      effectiveCapabilities(provider).timeoutMs,
    );
    let flushed = 0;
    const checkpoint = () =>
      saveResearchCheckpoint(job).catch(() => {
        /* Session checkpoint remains available. */
      });
    try {
      const onToken = async (token: string) => {
        job.output += token;
        if (
          job.output.length >
          effectiveCapabilities(provider).outputTokens * 8
        )
          throw new Error("Response exceeds the safe output limit.");
        job.updated = Date.now();
        if (Date.now() - flushed > 150) {
          await chrome.storage.session.set({ job });
          flushed = Date.now();
        }
      };
      if (job.draft.plan) {
        await executePlan(
          job.draft,
          controller.signal,
          (messages, signal, token, limit) =>
            generate(provider, messages, signal, token, limit),
          async (step, summaries) => {
            job.progress = {
              step: step.id + 1,
              total: job.draft.plan!.steps.length,
              stage: step.kind,
            };
            job.summaries = [...summaries];
            job.updated = Date.now();
            await chrome.storage.session.set({ job });
            await checkpoint();
          },
          onToken,
        );
      } else {
        const continuation = await generate(
          provider,
          job.draft.messages,
          controller.signal,
          onToken,
        );
        if (hasContinuation(continuation)) job.continuation = continuation;
      }
      if (
        job.output.includes(
          "[Output stopped at the configured token limit and may be incomplete.]",
        )
      )
        throw new Error(
          "The answer reached its output limit. Partial text is preserved. Review the model's output capacity before retrying.",
        );
      job.status = "complete";
    } catch (error) {
      job.status = controller.signal.aborted ? "cancelled" : "error";
      if (controller.signal.aborted) {
        job.error =
          controller.signal.reason instanceof Error
            ? controller.signal.reason.message
            : "Generation stopped.";
      } else if (error instanceof ProviderError) {
        job.error = error.message;
        if (
          error.rateLimit?.retryAfterSeconds &&
          error.rateLimit.retryAfterSeconds > 0
        ) {
          job.cooldownSeconds = error.rateLimit.retryAfterSeconds;
          job.cooldownUntil =
            Date.now() + error.rateLimit.retryAfterSeconds * 1000;
        }
      } else {
        job.error =
          error instanceof Error ? error.message : "Generation failed.";
      }
    } finally {
      clearTimeout(timer);
      controllers.delete(job.id);
      job.updated = Date.now();
      job.draft.provider.apiKey = "";
      await chrome.storage.session.set({ job });
      if (job.status === "complete") {
        try {
          await clearResearchCheckpoint();
          await saveHistory(job);
        } catch {
          job.error =
            "Answer completed, but local history could not be saved. Export the answer or clear old data.";
          await chrome.storage.session.set({ job });
        }
      } else await checkpoint();
    }
  }
  async function handle(message: Request): Promise<unknown> {
    await ready;
    // Recovery must remain possible even when stored settings fail schema validation.
    if (message.type === "clearAll") {
      if (busy || controllers.size)
        throw new Error("Stop generation before deleting data.");
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
      return true;
    }
    const settings = await getSettings();
    switch (message.type) {
      case "state": {
        const s = (await chrome.storage.session.get([
          "sources",
          "draft",
          "job",
          "selectionAction",
          "selectionError",
        ])) as Partial<State> & { selectionError?: string };
        const publicSettings = structuredClone(settings);
        const state: State = {
          settings: publicSettings,
          sources: s.sources ?? [],
          draft: s.draft,
          job: s.job,
          history: await history(),
          historyWarning: (await chrome.storage.local.get("historyWarning"))
            .historyWarning as string | undefined,
          selectionAction: s.selectionAction,
        };
        if (s.selectionError) {
          await chrome.storage.session.remove("selectionError");
          throw new Error(s.selectionError);
        }
        return state;
      }
      case "settings": {
        if (busy)
          throw new Error("Wait for the current provider operation to finish.");
        if (
          controllers.size &&
          !!settings.persistCheckpoints !==
            !!message.settings.persistCheckpoints
        )
          throw new Error(
            "Stop generation before changing checkpoint retention.",
          );
        endpointInfo(message.settings.provider.endpoint);
        busy = true;
        try {
          if (
            canonical(settings.provider) !==
            canonical(message.settings.provider)
          ) {
            for (const controller of controllers.values())
              controller.abort(
                new Error(
                  "Provider configuration changed. Previous generation was cancelled.",
                ),
              );
            await Promise.allSettled([...tasks.values()]);
          }
          await chrome.storage.local.set({
            settings: {
              ...message.settings,
              modelProfiles: {
                ...settings.modelProfiles,
                ...message.settings.modelProfiles,
                [modelIdentity(settings.provider)]: modelProfile(
                  settings.provider,
                ),
                [modelIdentity(message.settings.provider)]: modelProfile(
                  message.settings.provider,
                ),
              },
              providerProfiles: {
                ...settings.providerProfiles,
                [settings.provider.kind]: settings.provider,
                [message.settings.provider.kind]: message.settings.provider,
              },
            },
          });
          await chrome.storage.session.remove("draft");
          if (!message.settings.persistCheckpoints)
            await clearResearchCheckpoint();
          return true;
        } finally {
          busy = false;
        }
      }
      case "capabilities":
        await providerPermission(message.provider.endpoint);
        return discoverCapabilities(message.provider);
      case "models":
        await providerPermission(settings.provider.endpoint);
        return models(settings.provider);
      case "modelsDetail":
        await providerPermission(settings.provider.endpoint);
        return modelsDetail(settings.provider);
      case "preloadModel":
        await providerPermission(settings.provider.endpoint);
        return preloadModel(settings.provider, message.model);
      case "switchModel": {
        if (busy) throw new Error("Another provider operation is in progress.");
        busy = true;
        try {
          await providerPermission(settings.provider.endpoint);
          const available = await models(settings.provider);
          const target = message.model.trim();
          if (!available.some((m) => m === target || m === target + ":latest"))
            throw new Error(
              `Model '${target}' is not installed or available on this provider.`,
            );
          for (const controller of controllers.values())
            controller.abort(
              new Error(
                "Model was switched by user. Previous generation was cancelled.",
              ),
            );
          await Promise.allSettled([...tasks.values()]);
          const updatedSettings: Settings = {
            ...settings,
            provider: {
              ...selectModel(settings, target),
              ...(message.contextWindow
                ? { contextWindow: message.contextWindow }
                : {}),
            },
          };
          updatedSettings.modelProfiles = {
            ...settings.modelProfiles,
            [modelIdentity(settings.provider)]: modelProfile(settings.provider),
            [modelIdentity(updatedSettings.provider)]: modelProfile(
              updatedSettings.provider,
            ),
          };
          await chrome.storage.local.set({ settings: updatedSettings });
          await chrome.storage.session.remove("draft");
          return updatedSettings;
        } finally {
          busy = false;
        }
      }
      case "testConnection": {
        const p = message.provider ?? settings.provider;
        await providerPermission(p.endpoint);
        return testConnection(p, message.inference);
      }
      case "tabs":
        if (!(await chrome.permissions.contains({ permissions: ["tabs"] })))
          throw new Error("Grant tab-list access to select research sources.");
        return (await chrome.tabs.query({ currentWindow: true }))
          .filter((t) => !t.incognito && /^https?:/.test(t.url ?? ""))
          .map((t) => ({ id: t.id, title: t.title, url: t.url }));
      case "extract": {
        const sources: Source[] = [];
        const failures: string[] = [];
        for (const tabId of message.tabIds) {
          try {
            const tab = await chrome.tabs.get(tabId);
            if (!tab.url || tab.incognito)
              throw new Error("Page unavailable or private.");
            assertPage(tab.url, settings.blocked);
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ["extract.js"],
            });
            const result = (await chrome.tabs.sendMessage(tabId, {
              type: "SAGE_EXTRACT",
            })) as { ok: boolean; data: Extracted; error?: string };
            if (!result.ok)
              throw new Error(result.error ?? "Extraction failed.");
            const current = await chrome.tabs.get(tabId);
            if (current.url !== tab.url || result.data.url !== tab.url)
              throw new Error("Page navigated during extraction. Try again.");
            assertPage(result.data.url, settings.blocked);
            const id = "s" + hash(result.data.url + "\n" + result.data.text);
            const source: Source = {
              id,
              title: result.data.title,
              url: result.data.url,
              tabId,
              kind: result.data.kind,
              metadata: result.data.metadata,
              passages: result.data.segments
                ? result.data.segments.map((s, i) => ({
                    id: `${id}-p${i + 1}-${hash(s.text)}`,
                    text: s.text,
                    seconds: s.seconds,
                  }))
                : passages(result.data.text, id),
            };
            sources.push(source);
          } catch (error) {
            failures.push(
              `Tab ${tabId}: ${error instanceof Error ? error.message : "Could not extract this source."}`,
            );
          }
        }
        if (!sources.length) throw new Error(failures.join("\n"));
        await chrome.storage.session.set({ sources });
        await chrome.storage.session.remove(["draft", "selectionAction"]);
        return { sources, failures };
      }
      case "importDocx": {
        const id = "s" + hash(message.name + message.text);
        const source: Source = {
          id,
          title: message.name,
          url: "",
          kind: "docx",
          passages: passages(message.text, id),
          metadata: {
            method: "docx-body-xml",
            wordCount: message.text.split(/\s+/).length,
            extractedAt: Date.now(),
            warnings: message.warnings,
          },
        };
        await chrome.storage.session.set({ sources: [source] });
        await chrome.storage.session.remove(["draft", "selectionAction"]);
        return [source];
      }
      case "importPdf": {
        if (message.pages.join("").length > 600000)
          throw new Error(
            "PDF exceeds the 600,000 character limit. Import a shorter document.",
          );
        const id = "s" + hash(message.name + message.pages.join(""));
        const source: Source = {
          id,
          title: message.name,
          url: "",
          kind: "pdf",
          passages: message.pages.flatMap((text, i) =>
            passages(text, id + "-page" + (i + 1), { page: i + 1 }),
          ),
        };
        if (!source.passages.length)
          throw new Error(
            "PDF has no extractable text. Scanned documents require OCR.",
          );
        await chrome.storage.session.set({ sources: [source] });
        await chrome.storage.session.remove(["draft", "selectionAction"]);
        return [source];
      }
      case "prepare": {
        const saved = await chrome.storage.session.get(["sources", "job"]);
        const available = (saved.sources ?? []) as Source[];
        const sources = message.sourceIds
          .map((id) => {
            const source = available.find((s) => s.id === id);
            if (!source) throw new Error("Source expired. Extract it again.");
            return {
              ...source,
              passages: source.passages.filter((p) =>
                message.passageIds.includes(p.id),
              ),
            };
          })
          .filter((s) => s.passages.length);
        if (!sources.length) throw new Error("Select at least one passage.");
        for (const source of sources) await sourcePolicy(source, true);
        let previous: Turn[] = [];
        if (message.previousJobId) {
          const old = saved.job as Job | undefined;
          if (
            !old ||
            old.id !== message.previousJobId ||
            old.status !== "complete"
          )
            throw new Error(
              "Previous conversation is not available. Start a new conversation.",
            );
          if (canonical(old.draft.sources) !== canonical(sources))
            throw new Error(
              "Context changed. Start a new conversation so excluded passages cannot leak through prior messages.",
            );
          if (old.draft.plan)
            throw new Error(
              "This answer used compressed multi-step context. Start a fresh question so its source selection and processing plan can be reviewed.",
            );
          if (
            old.draft.messages.some(
              (m) =>
                hasContinuation(m.continuation) &&
                m.continuation?.identity !== modelIdentity(settings.provider),
            )
          )
            throw new Error(
              "Reasoning conversation belongs to a different endpoint/model. Start a new conversation; required metadata is never sent across providers.",
            );
          previous = [
            ...old.draft.messages,
            {
              role: "assistant",
              content: old.output,
              ...(hasContinuation(old.continuation) &&
              old.continuation?.identity === modelIdentity(settings.provider)
                ? { continuation: old.continuation }
                : {}),
            },
          ];
        }
        const draft = prepareResearch(
          sources,
          message.question,
          { ...settings.provider, apiKey: "" },
          previous,
          message.longContent ?? false,
        );
        draft.excludedCount =
          available.flatMap((s) => s.passages).length -
          sources.flatMap((s) => s.passages).length;
        await chrome.storage.session.set({ draft });
        return draft;
      }
      case "prepareResume": {
        if (busy || controllers.size)
          throw new Error("Stop generation before preparing a retry.");
        const { job: old } = (await chrome.storage.session.get("job")) as {
          job?: Job;
        };
        if (
          !old ||
          old.id !== message.jobId ||
          !old.draft.plan ||
          old.status === "complete"
        )
          throw new Error("No interrupted processing plan is available.");
        if (
          canonical(old.draft.provider) !==
          canonical({ ...settings.provider, apiKey: "" })
        )
          throw new Error(
            "Provider changed. Restore the original provider or review a new plan.",
          );
        for (const source of old.draft.sources)
          await sourcePolicy(source, true);
        const resume = structuredClone(old.summaries ?? []);
        const draft: Draft = {
          ...old.draft,
          id: crypto.randomUUID(),
          created: Date.now(),
          resume,
          warnings: [
            ...old.draft.warnings,
            `Reuse ${resume.length} completed steps; retry the failed step and remaining steps only. This is a new consent; previous transmissions cannot be retracted.`,
          ],
        };
        await chrome.storage.session.set({ draft });
        return draft;
      }
      case "start": {
        const { job: prevJob } = (await chrome.storage.session.get("job")) as {
          job?: Job;
        };
        if (
          prevJob?.cooldownUntil &&
          prevJob.cooldownUntil > Date.now() &&
          prevJob.draft.provider.endpoint === settings.provider.endpoint &&
          prevJob.draft.provider.model === settings.provider.model
        ) {
          const rem = Math.ceil((prevJob.cooldownUntil - Date.now()) / 1000);
          throw new Error(
            `Rate-limit cooldown active. Please wait ${rem}s before retrying.`,
          );
        }
        if (busy || controllers.size)
          throw new Error("A generation is already running. Stop it first.");
        busy = true;
        try {
          const { draft } = (await chrome.storage.session.get("draft")) as {
            draft?: Draft;
          };
          if (
            !draft ||
            draft.id !== message.draftId ||
            Date.now() - draft.created > 600000
          )
            throw new Error("This preview expired. Review the context again.");
          if (
            canonical(draft.provider) !==
            canonical({ ...settings.provider, apiKey: "" })
          )
            throw new Error("Provider changed. Review a new preview.");
          for (const source of draft.sources) await sourcePolicy(source, true);
          await providerPermission(settings.provider.endpoint);
          if (!draft.resume?.length) await clearResearchCheckpoint();
          const job: Job = {
            id: crypto.randomUUID(),
            status: "running",
            draft,
            output: "",
            created: Date.now(),
            updated: Date.now(),
          };
          await chrome.storage.session.set({ job });
          await chrome.storage.session.remove("draft");
          const task = run(job, settings.provider);
          tasks.set(job.id, task);
          void task.finally(() => tasks.delete(job.id)).catch(() => {});
          return job.id;
        } finally {
          busy = false;
        }
      }
      case "cancel":
        controllers
          .get(message.jobId)
          ?.abort(new Error("Stopped by you. Partial output is preserved."));
        return true;
      case "historyDelete":
        await chrome.storage.local.set({
          history: message.id
            ? (await history()).filter((j) => j.id !== message.id)
            : [],
        });
        return true;
      case "historyRename": {
        const saved = await history();
        if (!saved.some((j) => j.id === message.id))
          throw new Error("Conversation no longer exists.");
        await chrome.storage.local.set({
          history: saved.map((j) =>
            j.id === message.id
              ? { ...j, title: message.title.trim() || j.draft.question }
              : j,
          ),
        });
        return true;
      }
      case "restore": {
        if (busy || controllers.size)
          throw new Error("Stop generation before restoring a conversation.");
        const job = (await history()).find((j) => j.id === message.id);
        if (!job) throw new Error("Conversation no longer exists.");
        await chrome.storage.session.set({ job, sources: job.draft.sources });
        return true;
      }
      case "clearSession":
        if (busy || controllers.size)
          throw new Error(
            "Stop generation before starting a new conversation.",
          );
        await clearResearchCheckpoint();
        await chrome.storage.session.clear();
        return true;
      case "navigate": {
        const stored = await chrome.storage.session.get(["sources", "job"]);
        const sources: Source[] = [
          ...((stored.sources ?? []) as Source[]),
          ...((stored.job as Job | undefined)?.draft.sources ?? []),
        ];
        const source = sources.find((s) => s.id === message.sourceId);
        const passage = source?.passages.find(
          (p) => p.id === message.passageId,
        );
        if (!source || !passage || !source.url)
          throw new Error("Original page unavailable for this source.");
        await sourcePolicy(source);
        const target = new URL(source.url);
        if (passage.seconds !== undefined)
          target.searchParams.set("t", String(passage.seconds));
        else
          target.hash =
            ":~:text=" + encodeURIComponent(passage.text.slice(0, 160));
        if (source.tabId) {
          try {
            const tab = await chrome.tabs.get(source.tabId);
            if (tab.url?.split("#")[0] === source.url.split("#")[0]) {
              await chrome.tabs.update(source.tabId, {
                active: true,
                url: target.href,
              });
              return true;
            }
          } catch {
            /* Original tab closed. */
          }
        }
        await chrome.tabs.create({ url: target.href });
        return true;
      }
    }
  }
  chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
    if (!trustedSender(sender, chrome.runtime.getURL("/"))) return false;
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      respond({ ok: false, error: "Invalid SAGE request." });
      return false;
    }
    void handle(parsed.data).then(
      (data) => respond({ ok: true, data }),
      (error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "Operation failed.",
        }),
    );
    return true;
  });
});

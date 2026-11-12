import { defaults, settingsSchema, type Settings, type Job } from "./schema";
import { validHistory } from "./history-validation";
export function migrateSettings(raw: unknown): Settings {
  if (raw === undefined) return structuredClone(defaults);
  const result = settingsSchema.safeParse(raw);
  if (!result.success)
    throw new Error(
      "Stored settings are incompatible or damaged. Export your data or clear SAGE storage to reset.",
    );
  return result.data;
}
export async function getSettings() {
  return migrateSettings((await chrome.storage.local.get("settings")).settings);
}
export async function history() {
  const settings = await getSettings();
  const data = await chrome.storage.local.get("history");
  const { jobs, rejected } = validHistory(data.history);
  const kept = jobs.filter(
    (j) => j.created > Date.now() - settings.retentionDays * 86400000,
  );
  if (rejected) {
    await chrome.storage.local.set({
      historyQuarantine: data.history,
      history: kept,
      historyWarning: `${rejected} invalid history record(s) were isolated. Valid conversations remain available. Reset all SAGE data also deletes quarantined records.`,
    });
  } else if (kept.length !== jobs.length)
    await chrome.storage.local.set({ history: kept });
  return kept;
}
export async function saveHistory(job: Job) {
  const settings = await getSettings();
  if (!settings.history) return;
  const safe = structuredClone(job);
  safe.draft.provider.apiKey = "";
  if (new TextEncoder().encode(JSON.stringify(safe)).length > 6_000_000)
    throw new Error(
      "Conversation exceeds the history size limit. Existing history was preserved; export this answer.",
    );
  const jobs = [
    safe,
    ...(await history()).filter((j) => j.id !== job.id),
  ].slice(0, 50);
  while (
    jobs.length > 1 &&
    new TextEncoder().encode(JSON.stringify(jobs)).length > 6_000_000
  )
    jobs.pop();
  await chrome.storage.local.set({ history: jobs });
}

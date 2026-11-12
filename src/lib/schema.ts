import { z } from "zod";
import {
  capabilitySchema,
  inferenceSchema,
  FALLBACK_CONTEXT,
} from "./inference-config";
export const providerSchema = z.object({
  kind: z.enum(["ollama", "lmstudio", "llamacpp", "openrouter", "custom"]),
  endpoint: z.string().max(2048),
  model: z.string().max(200),
  apiKey: z.string().max(1000),
  contextWindow: z.number().int().min(2048).max(Number.MAX_SAFE_INTEGER),
  inference: inferenceSchema.optional(),
  capabilities: capabilitySchema.optional(),
});
export const skillSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(80),
  description: z.string().max(300),
  prompt: z.string().min(1).max(8000),
  contextMode: z.enum(["page", "selection"]).default("page"),
});
export const settingsSchema = z.object({
  version: z.literal(1),
  provider: providerSchema,
  modelProfiles: z
    .record(
      z.string(),
      providerSchema.pick({
        contextWindow: true,
        inference: true,
        capabilities: true,
      }),
    )
    .optional(),
  providerProfiles: z
    .partialRecord(
      z.enum(["ollama", "lmstudio", "llamacpp", "openrouter", "custom"]),
      providerSchema,
    )
    .optional(),
  blocked: z.array(z.string().max(200)).max(200),
  history: z.boolean(),
  persistCheckpoints: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(365),
  theme: z.enum(["system", "light", "dark"]),
  onboarded: z.boolean(),
  skills: z.array(skillSchema).max(100),
});
export type Settings = z.infer<typeof settingsSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type Skill = z.infer<typeof skillSchema>;
export interface Passage {
  id: string;
  text: string;
  page?: number;
  seconds?: number;
  section?: string;
  offset?: number;
}
export interface Source {
  id: string;
  title: string;
  url: string;
  tabId?: number;
  kind: "page" | "selection" | "pdf" | "transcript" | "docx";
  passages: Passage[];
  metadata?: {
    domain?: string;
    language?: string;
    method: string;
    wordCount: number;
    extractedAt: number;
    warnings?: string[];
  };
}
export interface Turn {
  role: "user" | "assistant";
  content: string;
  continuation?: {
    identity: string;
    reasoningDetails?: Record<string, unknown>[];
    thinking?: string;
  };
}
export interface Draft {
  id: string;
  sources: Source[];
  question: string;
  provider: Provider;
  messages: Turn[];
  tokens: number;
  warnings: string[];
  created: number;
  plan?: ProcessingPlan;
  excludedCount?: number;
  resume?: SummaryArtifact[];
}
export interface PlanStep {
  id: number;
  kind: "map" | "reduce" | "final";
  passageIds?: string[];
  inputs?: number[];
  outputTokens: number;
  inputTokenUpperBound: number;
  includeNumericalEvidence?: boolean;
}
export interface ProcessingPlan {
  steps: PlanStep[];
  inputTokenUpperBound: number;
  outputTokenUpperBound: number;
  summaryByteLimit: number;
  excerptRecovery?: boolean;
}
export interface SummaryArtifact {
  stepId: number;
  text: string;
  passageIds: string[];
  recovered?: "size" | "length";
}
export interface RateLimitMetadata {
  retryAfterSeconds?: number;
  resetTimestampMs?: number;
  limitType?: "daily_quota" | "per_minute" | "upstream_capacity" | "general";
  limit?: string;
  remaining?: string;
  providerName?: string;
  rawMessage?: string;
}

export interface OpenRouterKeyInfo {
  label?: string;
  usage?: number;
  limit?: number | null;
  limitRemaining?: number | null;
  isFreeTier?: boolean;
  rateLimit?: {
    requests?: number;
    interval?: string;
  };
}

export interface Job {
  id: string;
  status: "running" | "complete" | "cancelled" | "error" | "interrupted";
  draft: Draft;
  output: string;
  error?: string;
  cooldownUntil?: number;
  cooldownSeconds?: number;
  created: number;
  updated: number;
  title?: string;
  progress?: { step: number; total: number; stage: string };
  summaries?: SummaryArtifact[];
  continuation?: Turn["continuation"];
}
export const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state") }),
  z.object({ type: z.literal("settings"), settings: settingsSchema }),
  z.object({ type: z.literal("models") }),
  z.object({ type: z.literal("capabilities"), provider: providerSchema }),
  z.object({ type: z.literal("tabs") }),
  z.object({
    type: z.literal("extract"),
    tabIds: z.array(z.number().int().nonnegative()).min(1).max(8),
  }),
  z.object({
    type: z.literal("importPdf"),
    name: z.string().min(1).max(200),
    pages: z.array(z.string().max(100000)).min(1).max(500),
  }),
  z.object({
    type: z.literal("importDocx"),
    name: z.string().min(1).max(200),
    text: z.string().min(1).max(600000),
    warnings: z.array(z.string().max(500)).max(20),
  }),
  z.object({
    type: z.literal("prepare"),
    sourceIds: z.array(z.string()).min(1).max(8),
    passageIds: z.array(z.string()).max(2000),
    question: z.string().min(1).max(8000),
    previousJobId: z.string().optional(),
    longContent: z.boolean().optional(),
  }),
  z.object({ type: z.literal("start"), draftId: z.string() }),
  z.object({ type: z.literal("prepareResume"), jobId: z.string() }),
  z.object({ type: z.literal("cancel"), jobId: z.string() }),
  z.object({ type: z.literal("historyDelete"), id: z.string().optional() }),
  z.object({
    type: z.literal("historyRename"),
    id: z.string(),
    title: z.string().min(1).max(120),
  }),
  z.object({ type: z.literal("restore"), id: z.string() }),
  z.object({ type: z.literal("clearSession") }),
  z.object({ type: z.literal("clearAll") }),
  z.object({
    type: z.literal("navigate"),
    sourceId: z.string(),
    passageId: z.string(),
  }),
  z.object({
    type: z.literal("testConnection"),
    provider: providerSchema.optional(),
    inference: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("modelsDetail"),
  }),
  z.object({
    type: z.literal("switchModel"),
    model: z.string().min(1).max(200),
    contextWindow: z
      .number()
      .int()
      .min(2048)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  }),
  z.object({
    type: z.literal("preloadModel"),
    model: z.string().min(1).max(200),
  }),
]);
export type Request = z.infer<typeof requestSchema>;
export interface ModelInfo {
  id: string;
  name: string;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  sizeBytes?: number;
  sizeFormatted?: string;
  contextLength?: number;
  isLoaded?: boolean;
  vramBytes?: number;
  vramFormatted?: string;
  modifiedAt?: string;
}
export interface DiagnosticStep {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
}
export interface DiagnosticReport {
  ok: boolean;
  provider: string;
  model: string;
  endpoint: string;
  connectionStatus: string;
  corsStatus: string;
  modelStatus: string;
  inferenceStatus: string;
  models: string[];
  steps: DiagnosticStep[];
  summary: string;
}
export interface State {
  settings: Settings;
  sources: Source[];
  draft?: Draft;
  job?: Job;
  history: Job[];
  selectionAction?: string;
  historyWarning?: string;
}
export const defaults: Settings = {
  version: 1,
  provider: {
    kind: "ollama",
    endpoint: "http://127.0.0.1:11434",
    model: "",
    apiKey: "",
    contextWindow: FALLBACK_CONTEXT,
  },
  blocked: [
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "proton.me",
    "paypal.com",
    "chase.com",
    "bankofamerica.com",
    "1password.com",
    "bitwarden.com",
    "mychart.org",
  ],
  history: false,
  retentionDays: 30,
  theme: "system",
  onboarded: false,
  skills: [
    {
      id: "explain",
      name: "Explain This",
      description: "Make the argument clear.",
      prompt: "Explain the main argument, its evidence and its limitations.",
      contextMode: "page",
    },
    {
      id: "weaknesses",
      name: "Find Weaknesses",
      description: "Inspect assumptions and gaps.",
      prompt:
        "Identify assumptions, unsupported claims and limitations. Distinguish evidence from your interpretation.",
      contextMode: "page",
    },
    {
      id: "notes",
      name: "Study Notes",
      description: "Turn a source into useful notes.",
      prompt:
        "Create structured study notes with definitions and five review questions.",
      contextMode: "page",
    },
  ],
};

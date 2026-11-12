import { z } from "zod";
import { providerSchema, type Job } from "./schema";
const passage = z.object({
  id: z.string(),
  text: z.string(),
  page: z.number().int().positive().optional(),
  seconds: z.number().nonnegative().optional(),
  section: z.string().optional(),
  offset: z.number().optional(),
});
const source = z
  .object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    tabId: z.number().optional(),
    kind: z.enum(["page", "pdf", "docx", "selection", "transcript"]),
    passages: z.array(passage),
  })
  .passthrough();
const turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  continuation: z
    .object({
      identity: z.string(),
      thinking: z.string().optional(),
      reasoningDetails: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .optional(),
});
const step = z.object({
  id: z.number().int().nonnegative(),
  kind: z.enum(["map", "reduce", "final"]),
  passageIds: z.array(z.string()).optional(),
  inputs: z.array(z.number().int().nonnegative()).optional(),
  outputTokens: z.number().positive(),
  inputTokenUpperBound: z.number().nonnegative(),
  includeNumericalEvidence: z.boolean().optional(),
});
const jobSchema = z
  .object({
    id: z.string(),
    status: z.enum([
      "complete",
      "error",
      "cancelled",
      "interrupted",
      "running",
    ]),
    output: z.string(),
    created: z.number().finite(),
    updated: z.number().finite(),
    title: z.string().optional(),
    error: z.string().optional(),
    progress: z
      .object({
        step: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        stage: z.string(),
      })
      .optional(),
    summaries: z
      .array(
        z.object({
          stepId: z.number().int().nonnegative(),
          text: z.string(),
          passageIds: z.array(z.string()),
          recovered: z.enum(["size", "length"]).optional(),
        }),
      )
      .max(1000)
      .optional(),
    draft: z
      .object({
        id: z.string(),
        question: z.string(),
        sources: z.array(source),
        provider: providerSchema,
        messages: z.array(turn),
        tokens: z.number(),
        warnings: z.array(z.string()),
        created: z.number(),
        plan: z
          .object({
            steps: z.array(step).max(1000),
            inputTokenUpperBound: z.number(),
            outputTokenUpperBound: z.number(),
            summaryByteLimit: z.number(),
            excerptRecovery: z.boolean().optional(),
          })
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();
export function validHistory(raw: unknown): { jobs: Job[]; rejected: number } {
  if (raw === undefined) return { jobs: [], rejected: 0 };
  if (!Array.isArray(raw)) return { jobs: [], rejected: 1 };
  const jobs: Job[] = [];
  let rejected = 0;
  for (const item of raw) {
    const parsed = jobSchema.safeParse(item);
    if (parsed.success) {
      const job = parsed.data as Job;
      job.draft.provider.apiKey = "";
      jobs.push(job);
    } else rejected++;
  }
  return { jobs, rejected };
}

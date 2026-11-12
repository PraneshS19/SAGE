import { it, expect } from "vitest";
import { validHistory } from "../../src/lib/history-validation";
import { defaults } from "../../src/lib/schema";
import { makeDraft, passages } from "../../src/lib/context";
it("restores existing v1 records while rejecting corrupt neighbors and removing credentials", () => {
  const draft = makeDraft(
    [
      {
        id: "s",
        title: "Title",
        url: "https://example.com",
        kind: "page",
        passages: passages("Evidence", "s"),
      },
    ],
    "Question",
    { ...defaults.provider, apiKey: "private" },
  );
  const job = {
    id: "j",
    created: 1,
    updated: 2,
    status: "complete",
    output: "Answer",
    draft,
    title: "Renamed",
  };
  const result = validHistory([job, { id: "broken" }, null]);
  expect(result.rejected).toBe(2);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]?.title).toBe("Renamed");
  expect(result.jobs[0]?.draft.provider.apiKey).toBe("");
  expect(draft.provider.apiKey).toBe("private");
});
it("handles corrupted containers and refuses invalid source types", () => {
  expect(validHistory("invalid").rejected).toBe(1);
  expect(validHistory(undefined).jobs).toEqual([]);
});

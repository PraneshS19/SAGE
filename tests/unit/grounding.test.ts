import { expect, it } from "vitest";
import { answerFilter } from "../../src/lib/answer-filter";
import {
  numericalEvidence,
  auditGrounding,
  numericalRanges,
} from "../../src/lib/grounding";
import type { Source } from "../../src/lib/schema";
const sources: Source[] = [
  {
    id: "s-facts",
    kind: "page",
    title: "Facts",
    url: "https://example.org",
    passages: [
      {
        id: "s-facts-p1",
        text: "The pilot had 42 participants. Water use fell 12%. The count was 71 observations.",
      },
    ],
  },
];
it("keeps exact numerical evidence separate from generated claims", () => {
  const records = numericalEvidence(sources);
  expect(records.map((r) => r.quote)).toContain(
    "The pilot had 42 participants.",
  );
  const result = auditGrounding(
    "The pilot had 67 participants [s-facts-p1].",
    sources,
  );
  expect(result.missingValues).toContain("67 participants");
  expect(result.status).toBe("Unable to verify");
  expect(
    auditGrounding("42 participants proved causation [s-facts-p1].", sources)
      .status,
  ).toBe("Unable to verify");
});
it("distinguishes exact quotations from unsupported quotations", () => {
  const result = auditGrounding(
    '"Water use fell 12%." "There was no uncertainty." [s-facts-p1]',
    sources,
  );
  expect(result.quotes.map((q) => q.found)).toEqual([true, false]);
});
it("never emits tagged reasoning split across stream boundaries", () => {
  const f = answerFilter();
  let text = "";
  for (const chunk of [
    "<thi",
    "nk>private",
    " reasoning</th",
    "ink>Final ",
    "answer",
  ])
    text += f.push(chunk);
  text += f.finish();
  expect(text).toBe("Final answer");
});
it("does not call unfinished reasoning a completed answer", () => {
  const f = answerFilter();
  expect(f.push("<analysis>hidden")).toBe("");
  expect(() => f.finish()).toThrow("reasoning block");
});

it("computes scoped literal ranges without endorsing model aggregates", () => {
  const input = [
    {
      ...sources[0]!,
      passages: [
        {
          id: "s-p1",
          text: "Batch A contained 42 observations. Batch B contained 71 observations.",
        },
      ],
    },
  ];
  const result = numericalRanges(input);
  expect(result[0]?.minimum.value).toBe(42);
  expect(result[0]?.maximum.value).toBe(71);
  expect(result[0]?.mentions).toBe(2);
});

it("does not borrow numeric support from a reference attached to another claim", () => {
  const other = {
    ...sources[0]!,
    id: "s-other",
    passages: [
      { id: "s-other-p1", text: "The follow-up had 67 participants." },
    ],
  };
  const audit = auditGrounding(
    "The pilot had 67 participants [s-facts-p1]. The follow-up had 67 participants [s-other-p1].",
    [...sources, other],
  );
  expect(audit.missingValues).toContain("67 participants");
});

# Local model evaluation for the v0.2 development milestone

The alpha remains version 0.1.1. Acceptance thresholds were recorded in BETA_ACCEPTANCE_CRITERIA.md before running the new corpus. Both installed models used the same seven inputs at configured 4,096 tokens, 512 final output tokens and 256 intermediate output tokens. No models were downloaded. The 20-passage, 40-passage and 60-passage sources contained 13,462, 26,942 and 40,422 characters respectively. See the JSON artifacts for exact counts and raw output.

| Model      | Nonempty results | Long source coverage  | Failure                                                                               |
| ---------- | ---------------: | --------------------- | ------------------------------------------------------------------------------------- |
| Phi-3 3.8B |              4/7 | 0/2, 0/4, 0/5 batches | First intermediate request exceeded the byte budget or reached its output-token limit |
| Qwen2.5 3B |              6/7 | 2/2, 4/4, 5/5 batches | Largest input stopped during reduction after 7 of 9 planned requests                  |

Phi-3 stopped after 7.3–8.4 seconds on the long cases. Qwen completed the 20- and 40-passage cases in 6.5 and 18.0 seconds, and stopped the largest after 19.6 seconds. All source batches finishing is distinct from final synthesis finishing. No automatic retries ran.

Both models reached the output limit on the three-source comparison. Counting only nonempty answers without an output-limit marker or a recorded error, completion was 3/7 for Phi-3 and 5/7 for Qwen.

Both short answers preserved 42 participants and 12% lower water use. The Qwen 40-passage answer reported the correct literal range of 42 to 61, after the earlier run reported 54 to 61. This is one observation, with prompts and numeric evidence changed between runs. Qwen's returned long answers used noncanonical citation syntax and neither yielded a validated bracketed passage reference. Phi-3 emitted noncanonical references and recognized unmatched references. Neither model met the full quality gate. Raw outputs also show why literal-value matching cannot establish entailment.

The planner now adds exact excerpts where they fit and calculates scoped minimum and maximum values from literal unit mentions. These calculations do not establish a study-wide range. Evidence checks identify missing literal values and nonmatching quotations and do not label model interpretation as verified. The corpus is too small and lacks comprehensive claim annotations for a general accuracy or unsupported-claim rate.

Raw evidence: [Phi-3](archive/model-architecture/evidence/beta-phi3-3-8b-evaluation.json), [Qwen](archive/model-architecture/evidence/beta-qwen2-5-3b-evaluation.json), [earlier Qwen run](archive/model-architecture/evidence/beta-qwen-before-ranges.json). Historical alpha findings are preserved in [the archive](archive/alpha-0.1.1/MODEL_EVALUATION.md).

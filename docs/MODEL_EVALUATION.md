# 0.1.3 real Ollama evaluation

Predefined [gates](RELIABILITY_GATES.md) cover the previous seven fixtures and three held-out questions. Each model used 4,096 configured tokens, 256 intermediate output tokens and 512 final output tokens. A completion here excludes provider output-limit markers. It does not establish correctness.

| Model        | Complete | Long completed | Long map coverage | Recovered intermediate steps |
| ------------ | -------: | -------------: | ----------------- | ---------------------------- |
| `phi3:3.8b`  |     7/10 |            2/3 | 2/2, 4/4, 5/5     | 2, 6, 7                      |
| `qwen2.5:3b` |     9/10 |            3/3 | 2/2, 4/4, 5/5     | 0, 1, 3                      |

Phi-3 exhausted final output on the 40-passage case and two direct tasks. Qwen exhausted output on the direct comparison. Long times were 27.4, 52.7 and 92.2 seconds for Phi-3 and 8.1, 24.7 and 38.5 seconds for Qwen. The runs were sequential per model and reflect local workload and hardware.

In the held-out table both models gave 61 South samples and 7 faults. Both described the open/closed disagreement at 09:00. Both said the total cost could not be determined. Phi-3 also inferred a lower bound of 91 euros from a deposit, which the text does not establish on its own. Qwen cited both conflicting records but gave no recognized bracketed reference for the missing-cost case. Phi-3 used noncanonical labels in the table and conflict cases. The recorded parser predates the final camel-case passage label normalization. The original outputs are retained.

Qwen's 20-passage maximum was 47 despite also listing 51. Its 40-passage minimum was 54 instead of 42. Phi-3's 20-passage extrema were correct, but its largest answer contained malformed IDs and incomplete representation of the batches. These failures keep the quality gate open. Structural matches, claim-local literal checks and model completion are separate measurements. No semantic accuracy percentage is inferred from this corpus.

[Phi-3 raw results](evidence/reliability/phi3-3-8b-evaluation.json) · [Qwen raw results](evidence/reliability/qwen2-5-3b-evaluation.json)

---

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

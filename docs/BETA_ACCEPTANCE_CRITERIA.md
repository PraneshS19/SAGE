# v0.2 architecture and evaluation acceptance criteria

Defined before the new real-model runs. Keep the alpha version until all beta gates pass.

Architecture: arbitrary model IDs and 4K/32K/128K configurations must require no code changes; larger windows must permit larger source batches/direct requests; every request must include output/safety capacity; provenance and citations must be invariant. Metadata must distinguish advertised/observed/configured context. Reasoning fields must never render as final answers, and required continuation must stay bound to endpoint/model. Unknown optional parameters are omitted with review warnings; rejection must not trigger an unapproved retry.

Real-model thresholds (each installed model separately): all seven selected corpus tasks must complete without hidden truncation; every planned source batch must complete; zero nonexistent recognized citation IDs; exact supplied short-fixture numbers; exact known minimum/maximum values when an aggregate is claimed; no unsupported causal claims. A missing or omitted aggregate is not counted as numerically correct. Inspect full answers manually against the original fixture. Literal value matches are diagnostic, not factual-accuracy scores. No universal unsupported-claim rate is inferred without sentence-level gold annotation.

Native Helium, authorized live cloud acceptance, long PDF/DOCX stress and existing privacy/recovery gates remain separate. Deterministic acceptance does not substitute for them. Git is not initialized in this workspace; no release branch was created. The alpha source baseline and reports are preserved in docs/archive/alpha-0.1.1.

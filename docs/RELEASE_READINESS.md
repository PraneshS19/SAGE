# 0.1.3 release decision

**Functional Alpha. Public beta gates remain open.** Adaptive planning and controlled recovery pass the deterministic checks. Both installed models processed every long source batch, but Phi-3 stopped during one final synthesis and Qwen reported incorrect extrema. Live Helium verified the packaged extension, including a long DOCX workflow, but its output did not establish the requested full range. Live paid cloud inference and GPT-OSS 120B remain unverified. See [quality results](MODEL_EVALUATION.md) and [0.1.3 verification](RELEASE_VERIFICATION.md).

---

> Current distribution: Functional Alpha 0.1.2. The 0.1.1 architecture assessment below records the prior milestone. See [portable release verification](RELEASE_VERIFICATION.md) for current installation evidence.

# Release readiness for the v0.2 milestone

**Functional alpha 0.1.1 remains the release classification.** The model-agnostic architecture scenarios pass in deterministic tests. The live long-document quality gate remains open. The release version and unpacked path are retained to preserve the extension ID and existing data.

| Gate                            | Result                         | Evidence                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model-agnostic planning         | Pass with simulated models     | 4K and 32K produce different batch sizes. 128K uses a direct request on the same source. Model switches restore configured context and leave passage IDs intact.                                                                                                                     |
| Adapter and capability handling | Pass with controlled responses | Advertised, configured and observed contexts are distinct. Streaming/JSON, reasoning separation and optional parameter filtering are covered.                                                                                                                                        |
| Local research correctness      | Fails the beta gate            | Phi-3 stops on the three long cases. Qwen completes two and stops during reduction on the largest. Noncanonical references and unverified claims remain.                                                                                                                             |
| Native Helium                   | Partial                        | Toolbar activation, popup and side-panel opening were observed in a sandboxed dedicated profile. The native Explain Selection action opened the side panel with the selected source and a prepared question. Panel persistence and full native permission/reload checks remain open. |
| Live cloud and GPT-OSS 120B     | Unverified                     | No authorized cloud account test was requested. The 120B model was unavailable on the local server.                                                                                                                                                                                  |
| Privacy and recovery            | Bounded                        | Review, cancellation, isolated credential storage and checkpoint recovery are exercised by controlled tests. Long PDF/DOCX stress and full restart recovery of unfinished jobs remain unverified.                                                                                    |

The next acceptance work is to make intermediate evidence reliably fit the approved request budget and validate factual claims on repeated long webpage, PDF and DOCX runs. See [evaluation](MODEL_EVALUATION.md), [architecture](MODEL_ARCHITECTURE.md) and [test report](TEST_REPORT.md). The folder has no Git repository, so the requested release branch could not be created. The source and reports from the original alpha are under `docs/archive/alpha-0.1.1`.

The final sandboxed browser suites passed 14 cases each in Helium, Edge and Brave. The real Helium workflow restored history after full restart, recorded zero nonlocal extension requests, and preserved a Phi-3 answer that reached its token limit as partial. The deterministic results and packaged alpha do not close the live quality gate.

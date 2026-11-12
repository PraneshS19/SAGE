# 0.1.3 limitations

Both local test models processed all three long fixtures. Final completion and factual fidelity still vary. Qwen reported incorrect extrema on two inputs, and Phi-3 hit the output limit on a third long case. Recovered evidence is selective. No semantic verifier guarantees source support. Unsupported or noncanonical citations can be missing or displayed as unverified. A latest-job checkpoint survives restart only with opt-in and within its size and age limits. GPT-OSS 120B and live cloud inference were unavailable for verification. See [model evaluation](MODEL_EVALUATION.md) and [release gates](RELIABILITY_GATES.md).

---

# Known limitations — Functional alpha 0.1.1

- **Release blocker: long synthesis.** At 4K, Phi-3 stopped on all three long fixtures due to oversized notes or output limits. Qwen completed two and stopped during reduction on the largest after completing all five source batches. See MODEL_EVALUATION.md.
- **Release blocker: grounding.** Model prose can contain unsupported claims or noncanonical reference syntax. Literal-value checks and source IDs do not establish entailment. The live corpus did not meet the recorded quality thresholds.
- **P2: headless Helium.** Settings connect followed by article navigation produces net::ERR_ABORTED. Windowed testing passes; exact browser-internal cause is unproven. See HELIUM_COMPATIBILITY.md.
- **P2: native UI/accessibility.** Toolbar anchoring, native selection-menu gesture, native side panel, complete screen-reader/contrast/focus audit remain unverified. Full-tab fallback, labels and dialog Escape are tested, not WCAG certification.
- **P2: provider coverage.** Real Ollama verified; paid OpenRouter auth/quota and live LM Studio/llama.cpp/custom servers untested. Controlled HTTP/SSE/JSON tests are not live account acceptance.
- PDF supports local extractable text, not OCR/remote fetching. Empty-text PDF is tested, not a scanned-document corpus. DOCX supports basic body/headings/tables. Long PDF/DOCX and repeated progressive-size stress coverage remain incomplete.
- Long plans use per-model budgets and configurable request/time limits. Token counting is approximate. Session checkpoints survive worker restart, while browser-session loss removes them. Long PDF and DOCX quality remain unverified.
- Live YouTube transcript DOM remains unverified. Dynamic extraction, text fragments and sensitive-URL blocking are heuristic. Local storage is unencrypted; cancellation cannot retract transmitted content; exports outlive extension deletion.
- Chrome and remote CI were not run. No beta-ready, production-ready or guaranteed research accuracy claim is made.

The 0.1.2 distribution and onboarding changes do not resolve the earlier long-document, factual grounding or live cloud limitations. See [portable release verification](RELEASE_VERIFICATION.md) for current tested scope.

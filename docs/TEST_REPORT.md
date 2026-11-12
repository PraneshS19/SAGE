# 0.1.3 test report

Current regression and package results are in [release verification](RELEASE_VERIFICATION.md). Real model outputs and quality gates are separate in [model evaluation](MODEL_EVALUATION.md). This document preserves historical reports below.

---

> For Functional Alpha 0.1.2, see [release verification](RELEASE_VERIFICATION.md). This report records the preceding architecture milestone.

# v0.2 milestone verification, Functional alpha 0.1.1

Windows, Node 24.11.0 and npm 11.6.1. Helium 0.21.2.1 / Chromium 157.0.8103.50, Edge 157.0.4341.42 and Brave 157.1.99.56. Previous alpha evidence is preserved in [the archive](archive/alpha-0.1.1/TEST_REPORT.md). The current folder has no Git repository, so no release branch was created.

## Architecture acceptance

`tests/unit/model-agnostic.test.ts` and the browser context-switch case use an identical source with arbitrary model IDs and 4K, 32K and 128K configurations. The 4K and 32K cases plan different map sizes. The 128K case fits a direct request. Each plan fits the configured effective budget and retains the same passage IDs. Switching restores stored per-model context. Discovery distinguishes advertised capacity and current Ollama allocation. Controlled provider tests cover reasoning fields, tagged reasoning, streamed and JSON responses, optional unsupported parameters and bound continuation. No GPT-OSS 120B inference was executed.

The core changes are in `src/lib/inference-config.ts`, `inference-adapters.ts`, `model-profiles.ts`, `context.ts`, `processing.ts`, `grounding.ts`, `answer-filter.ts`, `provider.ts`, `schema.ts`, and `history-validation.ts`. `src/entrypoints/background.ts` connects them to permission checks, job state and stored settings. `src/components/InferenceSettings.tsx`, `Settings.tsx`, `App.tsx` and `ModelSelector.tsx` expose model configuration, review and evidence checks.

## Live model and native scope

Both installed Ollama models ran seven progressive corpus cases. Phi-3 generated nonempty answers for 4/7 and Qwen for 6/7. Both had a truncated comparison, so full completion was 3/7 and 5/7 respectively. No Phi long case completed. Two Qwen long cases completed, including the correct 42 to 61 literal range on the 40-passage case. Its largest case stopped at reduction after all five source batches. Valid citation syntax and complete factual coverage remain unreliable. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for exact call counts, timings and raw evidence. The harness tests completion of the evaluation procedure. Its pass does not imply a model quality pass.

Native sandboxed Helium showed the pinned toolbar popup and real side panel in a dedicated profile. In a second dedicated profile, native **Explain Selection** opened the panel and populated the explanation question and one selected source. Native keyboard shortcuts, panel persistence and reload remain unverified. The existing profile was not reset. Live cloud auth and billing, long PDF/DOCX stress and Chrome remain unverified.

## Recovered failures

- Reserving full numerical excerpts could overfill the final request. The planner now tests the full serialized request and explicitly records ledger omission when required.
- Empty continuation records incorrectly gated plain follow-ups after model switching. Only populated metadata is now retained and checked.
- A fixture that used a short stream could finish before Edge switched models. The cancellation fixture now holds that response open until cancellation.
- Parallel browser runs exposed a test-harness collision: Playwright cleaned the shared root that held the live browser profile. Playwright traces now use a dedicated subdirectory.
- Native inspection exposed Playwright's default no-sandbox flag. Current harnesses explicitly enable Chromium's sandbox. An earlier live Helium run also stopped at setup because Ollama was down. The server was restarted with the existing allowed origins.

The npm audit reported zero known advisories. Scope and residual risks are in [SECURITY_AUDIT.md](SECURITY_AUDIT.md). The release classification and open acceptance gates are in [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Final deterministic checks and package

| Check                        | Observed result                                           |
| ---------------------------- | --------------------------------------------------------- |
| TypeScript and ESLint        | Passed                                                    |
| Vitest                       | 110 passed, 2 optional live suites skipped                |
| Sandboxed windowed Helium    | 14 passed, 1 optional live test skipped (50.1 s)          |
| Sandboxed Edge               | 14 passed, 1 optional live test skipped (3.0 min)         |
| Sandboxed Brave              | 14 passed, 1 optional live test skipped (41.8 s)          |
| Production MV3 build and ZIP | Passed. 22 files match the build. No default host grants. |
| npm audit                    | Zero known advisories                                     |

Logs use the `beta-*-final-e2e.txt`, `archive/model-architecture/evidence/beta-tests.txt`, `archive/model-architecture/evidence/beta-typecheck.txt`, `archive/model-architecture/evidence/beta-lint.txt`, `archive/model-architecture/evidence/beta-build.txt` and `archive/model-architecture/evidence/beta-package.txt` names. The unpacked directory is `.output/chrome-mv3`. The ZIP is `.output/sage-extension-0.1.1-chrome.zip`, SHA-256 `37189a9fc1ab36f7397805c00be2ab9d5ce327403b5875680164cb4b738b2570`. The baseline ZIP remains in the 0.1.1 archive.

To upgrade in Helium, reload the existing SAGE extension from the same unpacked directory. For a first installation, use Developer mode and Load unpacked. The manifest remains at 0.1.1 while the beta gates are open.

## Final production Helium workflow

The unchanged production manifest ran in a separate sandboxed windowed profile. Actual Ollama permission and connectivity, discovery of both installed models, preload and model switching worked. Six of seven generations completed. The first Phi-3 webpage answer reached its output limit at 15.7 s and SAGE preserved it as partial. The follow-up, Qwen model switch, DOCX summary and question, text-PDF summary and multi-tab comparison completed in 3.7, 10.9, 3.7, 2.7, 3.7 and 4.8 s respectively. Preload took 7.2 s. These are individual workflow latencies.

Closing and reopening the popup document preserved the latest job. The renamed comparison survived full browser restart. Cancelling a cloud review before dispatch sent nothing. The recorded nonlocal extension request list is empty. The renderer heap snapshot used 12,509,220 bytes. The `storageBytes` field is JSON string length and recorded 14,439 local and 3,968 session characters. These are point samples, with no memory or throughput claim. See [raw workflow evidence](archive/model-architecture/evidence/beta-helium-final-workflows.json).

An independent same-environment rebuild reproduced the SHA-256 hashes of all 22 archived files. See `archive/model-architecture/evidence/beta-rebuild-verification.json`.

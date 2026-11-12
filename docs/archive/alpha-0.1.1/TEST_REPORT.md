# Test report — SAGE 0.1.1, 2026-11-11

**Release: Functional alpha.** Deterministic regressions and windowed Helium core workflows pass. Real long-summary reliability and semantic accuracy do not meet the beta gate. Earlier 0.1.0 reports are archived under archive/alpha-0.1.0.

## Environment and final regression

Windows / PowerShell, Node 24.11.0, npm 11.6.1. Helium 0.21.2.1 (Chromium 157.0.8103.50), Edge 157.0.4341.42, Brave 157.1.99.56. Browser runs use isolated profiles; the primary user profile and installed extension were not reset.

| Command / evidence                                             | Observed result                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| npm run typecheck — hardening-typecheck.txt                    | PASS                                                                                  |
| npm run lint — hardening-lint.txt                              | PASS                                                                                  |
| npm test — hardening-tests.txt                                 | 96 passed, 2 optional live suites skipped; 3.62 s                                     |
| npm run test:e2e, Helium, SAGE_HEADED=1 — helium-final-e2e.txt | 13 passed, 1 optional real test skipped; 43.3 s                                       |
| npm run test:e2e, Edge, SAGE_HEADED=0 — edge-final-e2e.txt     | 13 passed, 1 optional real test skipped; 36.1 s                                       |
| npm run test:e2e, Brave, SAGE_HEADED=0 — brave-final-e2e.txt   | 13 passed, 1 optional real test skipped; 37.5 s                                       |
| npm run build; npm run zip                                     | PASS; 22 packaged files, 762,261-byte ZIP                                             |
| npm audit --json — dependency-audit.json                       | Zero known vulnerabilities                                                            |
| Same-environment rebuild — rebuild-verification.json           | All 22 file hashes identical                                                          |
| ZIP comparison — package-verification.json                     | Every archive file equals production build; MV3 version 0.1.1; no default host grants |

An initial restricted-sandbox rerun produced 10 localhost EACCES failures. Rerunning with localhost/network permission passed; this environmental failure was not hidden or counted as a product pass. Browser fixture runs use a test copy with localhost/tabs pregranted. They do not prove native browser prompts, live model accuracy or paid-provider behavior. Optional real suites are separate from the deterministic count. No Chrome or remote CI execution is claimed.

To reproduce browser runs, set SAGE_BROWSER to the installed executable and SAGE_HEADED as above, then run npm run test:e2e. Use the Helium command in HELIUM_COMPATIBILITY.md. Real corpus: set SAGE_EVALUATE=1 and SAGE_MODEL to an installed tag, then run `npx vitest run tests/integration/real-evaluation.test.ts`. This sends original synthetic public fixtures to localhost. Real browser harness: `node scripts/helium-workflows.mjs`. The outage harness requires controlled external stop/restart synchronization; do not run it against an unrelated server process.

## Real integration evidence

The unchanged production manifest and original output path were loaded in temporary windowed Helium profiles. Origin: chrome-extension://<test-extension-id>. Actual UI host permission requests succeeded. Existing Ollama allowed origins were preserved; model switching required no environment changes or downloads.

[helium-workflows.json](../alpha-hardening/evidence/helium-workflows.json) records seven completed real generations:

| Workflow                | Model      | Elapsed  |
| ----------------------- | ---------- | -------- |
| Webpage summary         | phi3:3.8b  | 7,701 ms |
| Follow-up               | phi3:3.8b  | 3,676 ms |
| Model switch and answer | qwen2.5:3b | 8,315 ms |
| DOCX summary            | qwen2.5:3b | 4,646 ms |
| DOCX question           | qwen2.5:3b | 3,662 ms |
| Text PDF summary        | qwen2.5:3b | 3,694 ms |
| Multiple-tab comparison | qwen2.5:3b | 3,650 ms |

Preload completed in 4,054 ms. Popup-document closure, history rename and full browser restart restoration passed. Cloud configuration was previewed and cancelled before dispatch; extension request count did not increase. Recorded nonlocal extension requests: zero. Page requests are logged separately. The UI heap snapshot used 15,401,680 bytes; this is one renderer sample, not total browser RAM or a stress benchmark. The legacy `storageBytes` field actually measures JSON string length: local 15,707 and session 3,701 characters, not verified UTF-8 bytes.

[ollama-recovery.json](../alpha-hardening/evidence/ollama-recovery.json) records actual server-down detection and successful same-extension model discovery after restarting the identified Ollama server. The server was left running with its existing stored origins. No model files, user keys or user history were changed. Native toolbar/panel/context-menu gestures remain unverified; full-tab surfaces are verified.

## Real model correctness

Both installed models ran five corpus cases at context 4096. Phi-3 long processing stopped safely on oversized notes after 32.915 s. Qwen completed 11 requests in 35.174 s, but its numerical range and interpretations were wrong despite 14 recognized source references. See MODEL_EVALUATION.md and both *-hardening-evaluation.json artifacts. These are release blockers, not successful quality tests. Short document browser success is not evidence for long PDF/DOCX or repeated progressive-size stress.

## Fixes and regression additions

- context.ts / App.tsx: unique original reference mapping, invalid/ambiguous-ID warnings, removal of model-supplied citation URLs in display/copy/export, source metadata inspection.
- processing.ts / background.ts / schema.ts: increased bounded note/final budgets, source-order provenance, explicit partial coverage and reviewed retry from validated checkpoints; no duplicate completed work.
- provider.ts / Settings.tsx / ModelSelector.tsx: non-stream JSON support, empty-response rejection, diagnostic key redaction and safe parse errors, honest quota/missing-model messages, saved provider profiles and serialized active-request cancellation.
- security.ts: complete IPv4 checks prevent DNS-prefix misclassification and HTTP remote exposure.
- history-validation.ts / storage.ts: stronger optional-field validation and rejection of oversized single history entries before pruning existing records.
- UI styles: reduced-motion support; version derived from manifest. Package/lock version 0.1.1.

New regression cases cover malicious DNS prefixes, forged/ambiguous citations, v1 provider profiles, checkpoint retry, non-stream/empty responses, diagnostic credential handling and malformed JSON. E2E adds failed-step retry with exact remaining requests and provider changes during generation; PDF coverage now includes empty-text failure. Existing source exclusion, history, skills, worker interruption, stale navigation, permission denial and safe rendering checks remain passing.

## Security and release artifacts

See SECURITY_AUDIT.md for permissions, network/storage review, fixed findings and residual risks. Zero dependency advisories does not establish security. Live paid OpenRouter and other local API servers remain unverified; provider fixtures are explicitly mocks. No cloud spend, model download, persistent environment reset or primary-profile modification was performed.

Unpacked build: `.output/chrome-mv3`. ZIP: `.output/sage-extension-0.1.1-chrome.zip`.
SHA-256: `7f57900c3d6c99e04d24668a6169b6f80d53ee506c835c0588c6b26fbab857c1`.

For upgrade, open helium://extensions and Reload the existing extension pointing at the same absolute build directory. For a new installation, enable Developer mode and Load unpacked that directory. Do not uninstall or reset settings/history. Verify About shows 0.1.1 and explicitly test the selected local model. No store publication or beta certification is implied.

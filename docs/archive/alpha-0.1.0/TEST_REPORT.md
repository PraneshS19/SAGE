# Completion verification — 2026-11-11

**Release assessment: Functional alpha.** Core workflows, privacy boundaries and local integration work, but real answer quality, long synthesis and native-browser acceptance remain limited. Compilation is not evidence of research accuracy. All counts below are observed in this task; no earlier-agent claim is treated as a current pass.

## Commands and outcomes

Commands ran from `<local-workspace>` in PowerShell. Browser flags below are process-local test selection, not changes to user/Ollama environment configuration.

| Command / scope                                                                                                        | Result                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Baseline `npm run typecheck`, `npm run lint`, `npm test`                                                               | PASS — verified; 60 baseline tests                                                                                           |
| Baseline Edge E2E                                                                                                      | FAIL — tested and broken; one setup failure, seven skipped; fixed unsolicited discovery/settings refresh interference        |
| Final `npm run format`                                                                                                 | PASS — verified                                                                                                              |
| Final `npm run typecheck`                                                                                              | PASS — verified                                                                                                              |
| Final `npm run lint`                                                                                                   | PASS — verified                                                                                                              |
| Final `npm test`                                                                                                       | PASS — verified; **88 passed, two opt-in tests skipped**, nine passing files/two skipped                                     |
| `$env:SAGE_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm run test:e2e`                   | PASS — verified; **11 passed, one optional real-inference test skipped**, 23.4 s (final rerun)                               |
| `$env:SAGE_BROWSER='<local-workspace>\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe'; npm run test:e2e` | PASS — verified; **11 passed, one optional real-inference test skipped**, 25.2 s                                             |
| Helium E2E with `SAGE_BROWSER` set to its installed executable                                                         | PARTIAL — incomplete or limited; setup passed, fixture navigation aborted; see helium-test-output.txt                        |
| `$env:SAGE_EVALUATE='1'; npx vitest run tests/integration/real-evaluation.test.ts`                                     | Harness PASS — verified; one test recorded five real cases in 41.33 s. Answer quality PARTIAL/FAIL, not five accuracy passes |
| `$env:SAGE_WEB_EVALUATE='1'; npx vitest run tests/integration/real-webpages.test.ts`                                   | PASS — verified; MDN, Wikipedia, RFC HTML extracted; see real-extraction.json                                                |
| `node scripts/ollama-smoke.mjs` with `SAGE_MODEL=phi3:3.8b`                                                            | PASS — verified; actual local response, 4,668 ms in recorded evidence                                                        |
| Optional real extension inference (`SAGE_REAL_OLLAMA=1`)                                                               | BLOCKED — isolated test-copy origin received HTTP 403; host inference works                                                  |
| `npm audit --json`                                                                                                     | PASS — verified; zero reported vulnerabilities, dependency-audit.json                                                        |
| `node scripts/licenses.mjs`                                                                                            | PASS — verified; fflate included in inventory and bundled notices                                                            |
| `npm run build`, `npm run zip`                                                                                         | PASS — verified; 2.62 MB unpacked / 758.42 kB ZIP                                                                            |

An intermediate regression run found a test still reserving 512 output tokens for map steps after map output was bounded to 192. The assertion now uses the actual output budget supplied to inference. ESLint found the explicit control-character regex; replaced with equivalent character-code validation. Both issues were repaired and checks rerun. An earlier automatic approval-review usage limit interrupted live retesting; resumed checks completed after the user continued.

## Browser test scope

`tests/e2e/extension.spec.ts` loads the actual release files into isolated temporary profiles. Only the copied manifest pregrants localhost and tab-list access; assertions verify the production manifest has neither required host grants nor persistent content scripts. Deterministic provider responses exist only in tests, never in production.

Eleven passing Edge/Brave cases cover setup/no initial inference; explicit extraction/preview/streaming/popup closure; blocklist/permission/sender/storage denial; opt-in history/restoration/cancellation; interrupted-worker recovery; bundled local PDF extraction/page references; skills CRUD/search/use; workspace fallback/theme/corrupt-settings recovery; long-plan consent/cancel/exclusion/request counts/provenance; DOCX upload/history rename/export/model switching during generation; and three distinct sources/citation navigation/stale-tab rejection.

The optional twelfth case uses real Ollama. Its earlier 403 is not a successful browser-model test. No wildcard origin change was made to force it through. Native permission dialogs, actual toolbar popup lifetime, native side-panel gestures and screen-reader interaction remain manual acceptance items. Helium's isolated navigation probes succeeded without SAGE, with the unchanged production manifest, and with the pregranted test copy. The full suite still reproducibly aborts navigation after provider setup (one passed, one failed, ten not run). This unresolved workflow interaction is not evidence of complete Helium compatibility. Probe outputs are in helium-*-probe.txt.

## Actual integrations and quality

- Local Ollama exposed installed `phi3:3.8b` and `qwen2.5:3b`; only Phi-3 was used for recorded generation. Existing Ollama was started without changing its environment or downloading models. Smoke inference and the five-case evaluation used no credentials or cloud endpoint.
- Real public HTML: MDN AbortController (2,608 extracted characters), Wikipedia Scientific method (277,901), RFC 8259 (33,551). JSDOM ran no site scripts or subresource fetches. These are extraction tests, not authenticated/interactive website acceptance.
- Documents: generated valid PDF and DOCX files were processed by the real bundled parsers. DOCX tests also used hostile/oversized ZIP/XML fixtures. No private user document was transmitted.
- Cloud/alternative providers: controlled HTTP/SSE fixtures exercised parsing, cancellation and diagnostics. Live OpenRouter, LM Studio and llama.cpp were not verified. No paid cloud inference was requested.
- Phi-3 quality: short answers retain some numbers but malform citations and strengthen qualifications; technical output confuses attempts/retries; comparative output reaches its limit. The long case fails to produce a final answer because incomplete intermediate notes are now rejected. Full prose and rubric are in MODEL_EVALUATION.md and model-evaluation.json.

## Security verification

Fixed unsolicited model discovery; paid diagnostic inference without separate confirmation; overly broad OpenRouter key-host detection; invented quota/reset claims; missing configured-key redaction in streaming errors; and model-switch finalization races. Tests cover no implicit cloud inference, exact key-metadata destination, ambiguous Retry-After handling, streaming-secret redaction, unsafe Markdown protocols/images/scripts, hostile content-script messages/storage reads, source exclusion, stale navigation, corrupt history and DOCX macro/DTD/decompression limits. Models have no browser tool API. These checks do not prove prompt-injection immunity or constitute an independent penetration test.

## Significant files changed

| Files                                                                                                            | Purpose                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| src/lib/provider.ts; src/components/ModelSelector.tsx; Settings.tsx                                              | Explicit discovery/diagnostics, preload completion, honest rate diagnostics, key redaction, form stability                 |
| src/entrypoints/background.ts; src/lib/schema.ts                                                                 | Serialized switching, consented plans, source revalidation, DOCX/history actions and compatible optional schema fields     |
| src/lib/extraction.ts; src/features/youtube.ts; src/lib/context.ts                                               | Clean fallback, short text, heading/metadata provenance, valid timestamps and stronger source-grounding rules              |
| src/lib/processing.ts                                                                                            | Bounded explicit map/reduce planning/execution, cancellation, progress and incomplete-note guard                           |
| src/features/docx.ts; package.json; package-lock.json                                                            | Local bounded DOCX parsing using fflate                                                                                    |
| src/lib/history-validation.ts; storage.ts                                                                        | Preserve valid v1 records, quarantine corrupt entries, strip stored credentials                                            |
| src/components/App.tsx                                                                                           | Source-level exclusions, metadata, plan review/progress/notes, DOCX import, history rename and actual-output source labels |
| tests/fixtures/corpus.ts; tests/unit/processing.test.ts; history.test.ts; provider-safety.test.ts                | Original research corpus and new boundary tests                                                                            |
| tests/integration/corpus.test.ts; docx.test.ts; real-evaluation.test.ts; real-webpages.test.ts; provider.test.ts | Extraction/document/provider regression and explicit live evaluation                                                       |
| tests/e2e/extension.spec.ts                                                                                      | Expanded browser workflow checks and fresh isolated profiles                                                               |
| README.md; PLAN.md; docs/*; public/THIRD_PARTY_NOTICES.txt; .gitignore                                           | Updated evidence, limits, build instructions, notices and exclusion of transient server logs                               |

There is no Git repository metadata in this workspace, so this is an inspected significant-file inventory, not a claimed clean Git diff. Existing styling, manifest identity configuration, provider choices and storage version were preserved.

## Artifacts and remaining gates

Unpacked: `<local-workspace>\.output\chrome-mv3`.

Archive: `<local-workspace>\.output\sage-extension-0.1.0-chrome.zip`.

ZIP SHA-256: `C485BE0C8ECA7C8D9F4853BC9599A7F804622DB9AE413AD75AB050D93CC7DFA1`.

Final artifact check compared all 22 ZIP files byte-for-byte with the unpacked directory and verified no production host grants or persistent content scripts. Both checks passed. Screenshots were visually inspected; the workspace capture now waits for lazy Markdown rendering before capture.

Reload the existing SAGE card in Helium's `chrome://extensions` using this same directory; do not remove/reinstall or change its ID unnecessarily. Reopen settings and verify the existing local endpoint/model before a short reviewed prompt. Full manual steps are in README.md and KNOWN_LIMITATIONS.md. No store publish was performed. CI is configured but was not executed remotely in this task.

The complete 34-row result matrix is FEATURE_MATRIX.md. Remaining gates include successful real long-document synthesis, model-grounding quality, native Helium acceptance, exact-installed-origin inference, live authorized cloud verification, Chrome and assistive technology. Those prevent beta/release-candidate or production-ready classification.

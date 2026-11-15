# 0.1.3 Research Reliability and Accuracy

**Functional Alpha.** Built on `research-reliability-0.1.3` with the 0.1.2 portable ZIP left in place. New WXT output is `.output/v0.1.3/chrome-mv3` and the distribution is `dist/SAGE-0.1.3`. Installation requires only a compatible browser and the chosen inference provider. See [safe installation and updates](INSTALL.md).

## Work and evidence

1. Diagnosed intermediate size and token termination, pooled numeric evidence, citation formatting and loss of unfinished session state. See the [architecture](MODEL_ARCHITECTURE.md) and [quality thresholds](RELIABILITY_GATES.md).
2. Added disclosed excerpt recovery within the existing request budget, claim-local numeric checks and inert model links. Valid citations still navigate via original source records. Added independently opt-in, bounded restart checkpoints.
3. Verified the pipeline with controlled providers and real Phi-3 and Qwen. Completed analysis is distinct from factual quality. See the [model evaluation](MODEL_EVALUATION.md).

## Real Helium results

Windowed Helium 0.21.2.1 / Chromium 157.0.8103.50 loaded the unchanged versioned manifest in a fresh Windows profile. All eight generations completed, including webpage summary and follow-up, model switching, DOCX summary and Q&A, text PDF, long DOCX and multi-tab comparison. Output latency was 3.8–27.0 seconds. First visible tokens were sampled at roughly 2.8–23.0 seconds. These are one-run measurements.

The long DOCX completed all five steps in 27.0 seconds with one excerpt recovery. It described the observational limitation, but gave malformed references and did not provide the requested overall range of 31–54. The accuracy gate therefore remains open. The isolated Ollama server failure and reconnection took 18.3 seconds in this harness. History persisted after restart. Review cancellation sent no cloud request. Recorded nonlocal extension traffic was empty. [Live workflow data](evidence/reliability/helium-live.json)

The same-path 0.1.2 upgrade preserved the ID, settings, credential fields, skills, profiles and saved history in a dedicated profile. [Upgrade evidence](evidence/reliability/upgrade.json)

Native gestures, a long PDF stress test, macOS, Linux, a second computer, live cloud inference and GPT-OSS 120B were not independently verified in this milestone. The feature matrix retains those scope limits.

---

# SAGE 0.1.2 release verification

**Functional Alpha.** This milestone covers portable installation, onboarding and release engineering. The existing long-document and grounding limitations remain. See [release readiness](RELEASE_READINESS.md), [known limitations](KNOWN_LIMITATIONS.md) and the [34-feature inventory](FEATURE_MATRIX.md).

## Package and repository

`npm run release` builds WXT's production output and creates `dist/SAGE-Release`. The ZIP contains 22 runtime files with `manifest.json` at the root. The production manifest has the same required permissions, optional grants and CSP as the previous alpha. It has no default host grants, static content scripts or fixed manifest key. The verifier checks permitted paths, expected entrypoints, local HTML dependencies, the PDF worker, credential patterns and matching ZIP entries. The distribution places guides and SHA-256 checksums outside the runtime.

Source stays organized around WXT entrypoints and the existing components, adapters, extraction and storage modules. Prior raw evidence is archived by milestone. Server logs and test profiles are ignored. No production module or dependency was removed simply to reduce file count. [File inventory](FILE_INVENTORY.md)

An unpacked installation derives its origin from the installation. The runtime displays that origin and can copy it for Ollama setup. The build intentionally preserves the existing manifest identity behavior. A future signed store distribution would need its own identity and migration plan. [Chromium manifest key documentation](https://developer.chrome.com/docs/extensions/reference/manifest/key)

## Upgrade and setup verification

The same-path upgrade test installed the prior 0.1.1 ZIP in temporary Helium, seeded synthetic valid settings, a provider profile, a credential, a skill and saved history, and replaced its runtime with the 0.1.2 package. Relaunch preserved the exact extension ID, settings and history. [Upgrade evidence](evidence/portable/upgrade.json)

Fresh onboarding exercises the Cloud AI choice without contacting a cloud provider, then the Local AI choice, unavailable endpoint, empty model list, retry and dynamic model selection. The real local workflow loads the separate distribution in a fresh sandboxed Windows Helium profile and runs against an isolated Ollama process with the observed runtime origin. That is a clean same-machine installation test. macOS, Linux and a second physical computer are unverified. The guides use documented platform configuration steps.

Paid cloud inference and live OpenRouter credentials were not used. The controlled suites and review cancellation cover relevant privacy and provider behavior. The test does not demonstrate every remote endpoint, model or native browser feature. Model quality remains the independent beta gate.

## Checks completed on Windows

- TypeScript and ESLint passed. Vitest reported 110 passed and two optional live suites skipped. Controlled provider errors and cloud consent are covered separately from real Ollama.
- Helium 0.21.2.1, Chromium 157.0.8103.50. The final sandboxed production-derived suite passed 14 cases and skipped the optional live test. Earlier attempts exposed options-tab and file-input timing issues in the harness. The final test uses the install-opened options tab and the exact document input.
- Edge 157.0.4341.42 and Brave 157.1.99.56 each passed 14 deterministic cases with the final build and skipped one optional live test. Chrome and non-Windows browsers were not run for this milestone.
- A separate clean development directory ran `npm ci` successfully. Restricting Tailwind scanning to `src` removed checkout-dependent CSS. The clean rebuild and working release ZIP match byte for byte. All 28 distribution checksum entries verified. [Package inventory and SHA-256](evidence/portable/package.json)
- npm audit reported zero known advisories. The package and source pattern checks found no matching secret or fixed developer origin. These are scoped checks. [Advisory report](evidence/portable/npm-audit.json)

The final reproducible package completed seven live generations with Phi-3 and Qwen, including page follow-up, model switching, DOCX, text PDF and comparison. Browser restart restored history. Cloud review cancellation sent nothing, and the recorded nonlocal request list is empty. The models were already installed. Per-generation latency ranged from 2.8 to 11.5 seconds in the final run. The test server used only a process-scoped origin allowlist, and the user installation was not modified. [Final staged workflow](evidence/portable/helium-final.json)

Release scripts are available locally and configured in GitHub Actions. CI was not run remotely. The local Git baseline does not publish the source or package.

## Final deterministic and distribution checks

- TypeScript and ESLint passed. Vitest reported 113 passing and two optional live suites skipped. [Vitest log](evidence/reliability/vitest.txt)
- Sandboxed Helium, Edge 157.0.4341.42 and Brave 157.1.99.56 each passed 14 cases and skipped their opt-in live test. The shared suite checks cancellation with an explicitly held stream. The expanded batch test closes and relaunches the actual browser profile, confirms the retained completed step, and checks no inference runs before approval. [Helium](evidence/reliability/helium-e2e.txt) · [Edge](evidence/reliability/edge-e2e.txt) · [Brave](evidence/reliability/brave-e2e.txt)
- npm audit reported zero known advisories. The production manifest has no default host grants or fixed key. The source and package scans found no matching credential or machine-specific origin patterns. These checks are scoped. [Audit output](evidence/reliability/npm-audit.json)
- The versioned ZIP contains 22 runtime files. All 28 distribution checksums verified. An independent build using the locked dependency installation produced identical ZIP bytes. The 0.1.2 ZIP still matches its published local checksum. [Package record](evidence/reliability/package.json)
- The live test sampled a 5.6-second preload, 15,534,384 bytes of renderer heap in use, and JSON string lengths of 44,842 local and 4,061 session characters. The separate fixture startup sample was 624 ms. These are single samples. Extraction latency, peak memory and cross-device performance were not isolated.

ZIP: `dist/SAGE-0.1.3/sage-extension-0.1.3.zip`

SHA-256: `525d4c74803620643ecb4c2ecd3885dcd20c47a431370e10845fcd963cf9633e`

## Public-copy verification

The public copy uses GitHub noreply metadata, retains two development commits, and omits workstation-specific evidence listed in the [cleanup inventory](PUBLICATION_INVENTORY.md). The original repository and release use a separate local history. The public checkout pins runtime HTML and notices to LF for consistent packaging across Git checkout settings.

- On Windows, a locked install, TypeScript, ESLint and the fixture suites passed. Vitest recorded 113 passing tests and two opt-in suites skipped. Sandboxed Helium, Edge and Brave each passed all 14 controlled browser tests and skipped their opt-in live test. The fixtures include 4K, 32K and 128K context planning, citation consistency on model switches, and review of bounded long-document jobs.
- The extracted production ZIP ran seven live Ollama requests in Helium with Phi-3 and Qwen. The workflow covered webpage extraction and follow-up, model switching, DOCX, text PDF, tab comparison, cloud review cancellation, and history restoration across a browser restart. It recovered after restarting an isolated Ollama process and observed zero nonlocal extension requests. A separate Helium extension-manager reload, using an unpacked install of the final ZIP in a disposable profile, preserved synthetic local data.
- The comparison screenshot shows an answer with no valid citations. SAGE marked support unverified. Citation matching identifies a passage, and factual support still requires review.
- The release verifier checked 22 runtime files. All 28 distribution checksums matched. An independent clean checkout reproduced the same ZIP byte for byte. npm audit reported zero known vulnerabilities at verification time.

Public-copy ZIP SHA-256: `ae59a505042e9dbd6d8c566eb33fc13882ea339a6546014ece228d6cdc396f33`.

Publishing, hosted CI and release downloads require the separately authorized GitHub step. Live OpenRouter, GPT-OSS 120B, macOS and Linux remain unverified for this milestone.

## UI refinement verification

- TypeScript, ESLint, production packaging, and 113 unit and integration tests passed. Two opt-in Vitest tests were skipped. Helium, Edge and Brave each passed 15 controlled browser cases and skipped their opt-in live test. Cases include PDF and DOCX import, preserved source identities and citations, provider selection, history and privacy review.
- The final extracted ZIP completed seven separate live requests in Helium. Phi-3 streamed a page summary and follow-up. Qwen streamed after an explicit model switch and completed DOCX, text PDF and cross-tab workflows. Ollama recovered after its isolated process restarted. History was restored after a browser restart. Cancelling cloud review sent no request, and no nonlocal extension requests were observed.
- A real Helium toolbar click opened the packaged popup. The native selection menu opened the side panel and handed off Explain Selection. The controlled browsers also exercised the full-tab fallback.
- Reviewed light and dark screenshots and verified 320 px popup, side-panel and settings layouts. Keyboard checks exercised the model disclosure, focus at the privacy review heading, Escape dismissal and focus restoration. A 360 px packaged popup displayed a 12-section Markdown fixture with tables without page-level horizontal overflow. This covers the exercised surfaces and does not establish full assistive-technology or WCAG conformance. [Screenshot gallery](PRODUCT_AUDIT.md#visual-verification-gallery)
- The package verifier found 22 allowed runtime files. npm audit reported zero known vulnerabilities. The provider configuration, permission model and explicit cloud consent remain in effect.

The refined Functional Alpha archive has SHA-256 `cea7c7c48e89fb3029b80da637992f05b1104a85ce03b2b1ad21f2ae07eb2cf6`. Model-dependent factual grounding, citation quality, long-document synthesis, live OpenRouter, GPT-OSS 120B and non-Windows builds remain outside verified release scope.

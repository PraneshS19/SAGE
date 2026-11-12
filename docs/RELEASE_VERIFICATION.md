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

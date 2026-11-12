# SAGE implementation plan

The repository was empty on 2026-11-09. The supplied master build prompt is the product specification.

1. Establish WXT/React/strict TypeScript, manifest, local icons and build checks.
2. Implement policy, extraction, streaming providers and restart-safe session jobs.
3. Add popup/workspace/settings, context inspector, research, citations and skills.
4. Add selected-text actions, visible YouTube transcripts, local PDF extraction and opt-in history.
5. Verify with unit, integration and Chromium extension tests; document actual results and remaining limitations.

## Decisions

- No default host grants. Provider and selected research origins are requested from user gestures.
- All transmissions use a background-stored context draft and an explicit inspection step, including local sends. Consent is bound to the exact prompt and provider configuration.
- Content scripts are injected only following authorized extraction and cannot invoke privileged message handlers. Background rechecks URLs and policy.
- Service worker owns generation. Session storage persists drafts, jobs and results; interrupted jobs are marked on worker restart, never silently retried. This favors honest recoverability over artificial keep-alive.
- Citations verify passage existence, not semantic entailment. UI explicitly distinguishes these guarantees.
- The completion prompt supersedes manual-selection-only long content: explicit opt-in permits bounded map/synthesis plans with request counts, exclusions and token ceilings. No hidden requests or silent truncation.
- Incognito disabled in manifest; background also refuses incognito sources. History off by default.
- No automatic inference, provider discovery, remote images, analytics or cloud fallback.

See docs/VERIFICATION.md for completion evidence and release limitations.

## Execution record

The completion audit established a fresh 60-test baseline and found a browser setup regression and provider/privacy risks. Added provider consent/race fixes, source metadata and stale-tab checks, DOCX import, bounded long-content processing, history validation/rename and expanded tests. Final regression: 88 unit/integration tests; 11 browser tests each in Edge and Brave. Real Phi-3 and public HTML extraction were exercised. Phi-3 long synthesis stopped on truncated notes; Helium fixture navigation aborted; live cloud verification remains unperformed. See docs/TEST_REPORT.md and docs/FEATURE_MATRIX.md. Release classification: Functional alpha.

## Production hardening follow-up — 0.1.1

Windowed Helium completes all 13 deterministic browser cases, as do Edge and Brave. Real production-origin Helium verifies seven Ollama generations, switching, documents, history and server restart recovery. Fixed citation ambiguity/forged links, long-plan provenance/budgets/retry, provider switching/profile retention, DNS classification, diagnostics and history validation. Long research accuracy remains a release blocker; see current TEST_REPORT.md and RELEASE_READINESS.md.

# Security model and review notes

SAGE treats webpage, PDF, transcript and model text as untrusted data. Never include credentials in an issue report. For a suspected vulnerability, provide a minimal nonsensitive reproduction privately to the repository maintainer once a public repository and reporting channel are established; no security contact has been invented for this local project.

## Implemented controls

- No remote scripts, CDN UI, injected AI tools, telemetry or automatic model downloads.
- MV3 CSP restricts executable code and objects to the extension. PDF worker is bundled locally.
- React Markdown escapes text, skips raw HTML, strips executable URL protocols, suppresses all image rendering and opens allowed HTTP(S) links with `noopener noreferrer`.
- Background verifies sender ID and allowlisted extension-page URL, then validates request shape with Zod. Extracted page scripts cannot send privileged commands.
- API keys never go to injected scripts or exported history. Storage access is restricted to trusted extension contexts.
- Endpoints reject credentials, query strings, fragments, non-HTTP(S) protocols, wildcard addresses and the common metadata address. Nonprivate remote HTTP is rejected. Redirects are forbidden on provider requests, preventing authorization forwarding.
- Page policy is checked before injection, after extraction and before generation. Navigation races invalidate extraction.
- Drafts expire, are tied to provider configuration, and are consumed on explicit confirmation. New configuration invalidates pending drafts.
- Source data is JSON-encoded under a fixed system message. No tool execution or privilege expansion is available to the model.
- Missing stream termination is an error. Provider output limits add a visible warning; truncated intermediate notes stop synthesis. Cancellation uses AbortController; available partial output remains inspectable.
- Incognito is disabled and private source tabs are rejected.

## Important limits

This is not a formal penetration audit. URL policy does not resolve DNS or prevent every network-rebinding configuration. User-configured endpoints are trusted destinations; a provider can forward or retain data. Network labels do not certify server security. An extension origin permission covers the host, not just one port.

Prompt injection may still affect answer content. It cannot directly invoke browser APIs through the model because none are provided. Citation existence is not entailment checking. Text-fragment navigation may find a different repeated passage or fail to highlight; never present it as proof.

Session storage is temporary but can survive worker termination. Inference can be interrupted by MV3 lifecycle limits; no artificial keep-alive is used. Local keys are readable to someone with sufficient profile access. Host permissions remain after resetting SAGE’s stored data until explicitly revoked.

## Tests and release gate

Unit tests cover endpoint validation, blocklist boundaries, storage versions, unsafe rendering and unauthorized senders. Integration tests use a controlled HTTP server for streaming/cancellation/failures and DOM fixtures for extraction. Browser tests exercise the loaded extension. See TEST_REPORT.md and FEATURE_MATRIX.md for current results and scope.

Completion-audit fixes include diagnostic inference consent, exact canonical OpenRouter key-metadata destination, streaming-error key redaction, evidence-based quota messages, model-switch serialization, stale-tab rejection, validated history and bounded DOCX decompression. DOCX rejects macro entries and DTD/entity XML and never follows external relationships. Tests cover these boundaries, not every hostile document/parser vulnerability.

Before public distribution: manually test native permission prompts, supported browser versions, live provider configurations, accessibility with assistive technology, and long inference without developer-tools lifecycle effects. Review dependency notices and store disclosures. Do not call this build security-certified.

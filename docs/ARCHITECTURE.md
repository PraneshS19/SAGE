# Architecture

## Trust boundaries

1. Extension UI pages send runtime-validated discriminated requests.
2. Background validates the sender’s extension ID and exact popup/options/sidepanel URL. Website content scripts cannot invoke privileged handlers, even with the correct extension ID.
3. Background reads settings, validates page policy, and injects the extractor only after an explicit extraction request. Browser permission checks remain authoritative.
4. The isolated extractor clones the document, removes forms and active content, runs Readability and converts to Markdown. It never receives credentials.
5. Background checks the tab URL again after extraction to reject navigation races.
6. Background stores sources; UI can select stored IDs, not submit arbitrary webpage context or provider destinations. PDF/DOCX text is accepted only from trusted extension UI after user file selection. Sources retain extraction metadata and heading/page/timestamp references.
7. A prepared draft contains selected passages, conversation and an API-key-free snapshot of provider configuration. It expires after ten minutes. Settings changes invalidate it.
8. Confirmation consumes that exact draft, rechecks source policy, provider equality and host access, then starts a single job. No model output can call browser tools.

## Job lifecycle

`running → complete | cancelled | error`; after worker reactivation, previously running jobs become `interrupted`. A four-minute explicit timeout limits generation; the browser can terminate a worker earlier. Partial output is saved at most every 150 ms when tokens arrive, with a final write at completion. No keep-alive heartbeat or offscreen workaround is used.

Session storage holds current sources, a preview draft and the latest job. UI views subscribe to storage changes and reconnect by reading state. This survives popup closure; it does not promise survival across browser restart. API keys are passed only to the in-memory provider call, never stored in job snapshots or history. No automatic retry can duplicate a billed cloud request.

## Source and context model

Source IDs hash URL/content. Passage IDs combine source ID, sequence number and text hash. Paragraphs longer than 1,800 characters are split; PDF page numbers and transcript timestamps are preserved. These are deterministic identifiers, not cryptographic authenticity proofs. Text changes produce new IDs.

The selected model's configured context and capability metadata determine request budgets. UTF-8 byte estimates and the safety reserve are configurable. `processing.ts` tries direct generation first and plans sequential source batches and hierarchical reduction when needed. Its plan includes worst-case serialized notes and reserves output capacity. Runtime checks stop on empty, oversized or visibly incomplete notes. Excluded material stays out of all requests. Future model notes are unknown at approval time. See [model architecture](MODEL_ARCHITECTURE.md).

Provider changes wait for canceled jobs to finalize. Discovery is user-triggered. Diagnostics distinguish model-list access from explicitly requested inference; nonlocal diagnostic inference requires a separate cost/content confirmation. OpenRouter key metadata is fetched only for its exact canonical base URL.

Follow-ups include previous source-bearing messages. Therefore changing passages or sources requires starting a fresh conversation: exclusion cannot be undermined by old context. Reference validation checks passage existence; semantic support remains a user judgment.

## Storage and retention

Settings are schema-versioned (v1), validated at runtime, and default to Ollama loopback with no selected model. Unknown versions fail visibly rather than silently resetting credentials. Both storage areas are set to trusted extension contexts. History is opt-in, pruned by age on access, and bounded to 50 entries / approximately 6 MB by dropping oldest entries. Expiration is lazy, not an exact-time background deletion service.

History entries are independently validated, preserving compatible v1 records and valid neighbors. Invalid records are quarantined and reported; reset-all deletes quarantine. Source snapshots are retained for inspection/follow-ups. Stored jobs strip provider credentials. New metadata/plan fields are optional for old records.

## Platform decisions

WXT entrypoints generate MV3 manifests. Options use WXT’s HTML `manifest.open_in_tab` setting. Side-panel open failures fall back to a full-tab workspace. Chromium can supply `sender.tab` for extension pages; trust is established from the sender ID and exact extension URL, not absence of tab metadata.

Provider adapters share streaming parsing but preserve Ollama native NDJSON and OpenAI-compatible SSE differences. Fetch disallows redirects, omits credentials/cookies and referrers, and sends authorization only from configured extension storage. Generation does not expose arbitrary tool calls.

Official references: [WXT project structure](https://wxt.dev/guide/essentials/project-structure), [Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Hardening additions (0.1.1)

Optional v1 provider profiles preserve per-provider settings and keys in trusted local storage. Settings changes serialize cancellation and invalidate drafts. Failed/interrupted long jobs can prepare a fresh reviewed retry; completed-prefix notes must match original provenance and limits. Only remaining requests execute, sequentially. Browser-session loss clears these checkpoints. An individual oversized history entry is rejected before pruning existing history. Citation display, copy and Markdown export mark invalid recognized references and discard model-supplied citation URLs.

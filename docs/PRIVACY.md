# SAGE privacy notice

SAGE has no hosted service, accounts, analytics, advertising or tracking. This notice describes the release extension, not normal website traffic or WXT’s development server.

## Data access

SAGE reads a webpage only after an explicit extraction action. Research reads only selected tabs with browser-granted access. Text selection actions use only the selection. Readability removes common navigation, forms and editable fields, but cannot guarantee removal of every sensitive element. Extracted text can contain personal information. Always inspect it.

Sources include text, title, URL, extraction metadata and stable passage identifiers. PDF/DOCX import reads user-selected files entirely within the extension. DOCX external relationships are not fetched. Transcript support reads the opened YouTube transcript DOM; it does not retrieve hidden transcripts, listen to audio or process video frames.

## Storage

- `chrome.storage.local`: settings, per-provider profiles and API keys, blocklist, skills, theme and optional history.
- `chrome.storage.session`: current source text, draft prompt, conversation and job output. Removed by browser-session end or explicit clear. A service-worker restart does not clear this storage.
- API keys are not included in jobs or history, and content-script storage access is disabled. Local extension storage is not an encrypted vault. Someone with profile or machine access may be able to read it.
- History is disabled initially. When enabled it retains source text, URLs, questions and answers locally for the configured 1–365 days, at most 50 entries or approximately 6 MB. Oldest entries are removed to enforce size limits; expired entries are removed on access.
- Disabling history does not delete existing records. Incognito is disabled; incognito source tabs are also rejected in code.

## Network destinations

There are no automatic background provider checks or model downloads. The default configuration has **no extension-initiated non-loopback requests**. Even localhost discovery is user-triggered.

| Action            | Destination                                            | Sent data                                                                                                          |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Test connection   | Configured endpoint `/api/tags` or `/models`           | API key if configured; no source text                                                                              |
| Confirm inference | Configured endpoint `/api/chat` or `/chat/completions` | System rules, exact reviewed question, selected sources, included conversation, model ID and API key if configured |
| Open source       | User-selected source URL in a browser tab              | Ordinary browser navigation; text fragments or video timestamp may be included                                     |

Typical endpoints are Ollama `http://localhost:11434`, LM Studio `http://localhost:1234/v1`, llama.cpp `http://localhost:8080/v1`, and optional OpenRouter `https://openrouter.ai/api/v1`. A custom provider can have any explicitly configured and approved HTTP(S) origin under endpoint policy. Remote hosts require HTTPS. HTTP loopback and private IP addresses are allowed.

Local / Network / Cloud labels derive from URL location, never a custom display name. DNS names are classified conservatively as Cloud, including LAN names. A local server could itself forward requests elsewhere; SAGE cannot guarantee its behavior. Cloud and network providers can retain or further process data under their own policies. SAGE cannot revoke or delete data already transmitted to a provider.

Every generation requires review and confirmation of an expiring draft. The inspector shows the endpoint, selected sources, budget and outgoing prompt. Exclude individual passages before preparing it. Changing provider settings invalidates the draft. SAGE never silently switches providers.

Long-content opt-in approves a bounded sequence, counts, token ceilings and selected sources. Later requests contain derived notes whose exact contents cannot be known before execution; the inspector discloses this. Notes/provenance are stored with the job and optional history. No automatic retries or additional requests are added. Cancellation cannot retract completed transmissions.

Model refresh is explicit and does not generate text. Explicit Test Connection can send a minimal five-token inference request; nonlocal endpoints require separate confirmation showing possible cost. Canonical OpenRouter diagnostics can request key/account metadata. Diagnostics include no page text. Corrupt saved history is quarantined locally and cleared by Reset all.

## Permissions

- `activeTab`: temporary user-invoked active-page access.
- `scripting`: inject extraction into explicitly authorized pages.
- `storage`: local settings, session jobs and opt-in history.
- `contextMenus`: selected-text actions.
- `sidePanel`: persistent workspace where implemented by the browser.
- Optional `tabs`: list open tabs when selecting research sources.
- Optional HTTP(S) origins: provider requests and selected research tabs. Requests are narrowed to specific origins, although Chromium host patterns grant access across that host’s ports. Revoke them in Settings → Privacy and Permissions or browser extension settings.

## Deletion and export

History supports individual deletion, clear-all and Markdown export. Settings → History and Data can clear temporary context, delete saved history, or reset all SAGE stored data. Resetting data does not revoke browser-granted origins; revoke them separately. Uninstalling removes extension storage according to browser behavior. Exported files are outside SAGE’s deletion control.

## Remaining limits

Domain and sensitive-path blocking is best effort. A site can place sensitive data at an innocent URL. Prompt-injection wrappers do not guarantee model compliance. Model output is untrusted, raw HTML and automatic images are disabled, and models have no browser tools. Browser storage, inference software, provider policy and operating-system security remain outside this extension’s complete control.

A failed-step retry requires another reviewed draft. It sends remaining steps and validated completed notes, never silently retries a cloud request. Provider profiles preserve keys locally; no keys are added to job/history exports.

Capability discovery is an explicit settings action. It sends the selected model ID or requests the model list from the configured endpoint and sends no source text. Reasoning continuation may be saved with the current session and opt-in history. SAGE sends it only with a reviewed follow-up to the same provider, endpoint and model. Copy and export contain the visible answer and source references.

On a new installation, SAGE asks you to choose Local AI or Cloud AI. Connection discovery is explicit and sends provider metadata requests only. Use Save provider or Finish setup to persist the chosen configuration. The portable release contains runtime files and notices without browser-profile storage.

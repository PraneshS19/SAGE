# 0.1.3 security changes

Model-generated links render as text in answers. Source navigation still uses the trusted extracted source records and browser permissions. Recognized citation labels are resolved against a unique original passage, and model-supplied inline destinations are removed from answer text used for display, copy and export. A recognized reference does not establish relevance or truth.

Excerpt recovery uses only the selected step's original passage scope. Review discloses that excerpts can appear in later approved requests. There are no new permissions, automatic cloud calls or changes to manifest identity behavior. The restart option stores one local credential-free checkpoint only after opt-in. The snapshot contains sensitive selected text. Browser storage is not encrypted, and old checkpoints are expired on access. See the privacy guide for deletion behavior.

---

# Security audit — 0.1.1, 2026-11-11

This is a source review plus deterministic and local-browser verification, not a penetration-test certification. No Git metadata is present, so repository history could not be scanned for old secrets.

## Fixed findings

| Finding                                            | Cause and resolution                                                                                                                                        | Evidence                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| DNS names could be classified as private IPs       | Prefix-only IPv4 checks accepted names such as `10.attacker.example`; now require complete IPv4 patterns and reject HTTP remote endpoints                   | hardening.test.ts                                           |
| Provider changes could race active output          | Settings changes now cancel and await active tasks, invalidate drafts, and prevent history restoration during generation                                    | provider-change E2E                                         |
| Switching providers lost configuration             | Optional v1 provider profiles retain saved credentials and unsaved UI edits; jobs/history omit credentials                                                  | hardening unit and provider-change E2E                      |
| Model references could carry forged links          | Only unique original passage IDs resolve; ambiguous/invalid references are marked unverified, model links on citation labels removed in display/copy/export | hardening/context tests                                     |
| Diagnostics could expose custom credentials        | Stream errors and previews redact configured keys; JSON parse errors omit response bodies                                                                   | provider-safety tests; malformed-JSON diagnostic regression |
| Oversized history entry displaced existing history | Reject an individually oversized entry before pruning existing entries; validate progress/errors/summary artifacts                                          | history validation and storage review                       |

## Permissions and network

Required: activeTab, scripting, storage, contextMenus, sidePanel. Tabs and HTTP(S) host access are optional, requested for selected origins. No default host grants or static all-page content script. Incognito is disabled. Browser host grants cover an origin pattern, not a particular port. Background handlers validate extension senders, URLs and source policy again before dispatch.

Generation requires an expiring reviewed draft. Provider changes invalidate consent; retry requires a fresh review and skips only validated completed steps. Cancelling before dispatch sends nothing; cancellation after dispatch cannot retract data. Redirects are rejected, fetch omits cookies/referrers, no remote assets/telemetry or model tools are provided. Actual Helium local workflows recorded **zero nonlocal extension requests** and no cloud dispatch after cancellation. Ordinary page traffic is logged separately. Live paid OpenRouter behavior was not tested.

## Storage and untrusted content

Provider profiles and API keys are in trusted extension local storage, which is not encrypted. Session jobs include source text, results and intermediate notes. History is opt-in, capped and lazily expired; exported files remain outside deletion controls. Invalid history is quarantined, not silently discarded. User profile/history/keys were not reset during testing.

Extraction treats pages/documents as untrusted, strips editable/form content heuristically, and does not fetch DOCX external relationships. Models cannot call browser tools or change settings. Injection can still influence prose. Markdown suppresses raw HTML and automatic images and rejects executable URLs. A valid passage identifier proves existence, not that the passage supports a claim. No semantic verification guarantee is made.

## Dependency and residual assessment

The final npm audit reported zero known vulnerabilities; see dependency-audit.json. Zero known advisories is not proof of security. Large JSON responses can still consume memory before parsed-content limits apply. Extraction/blocklists are heuristics; native permission revocation and complete assistive-technology testing remain incomplete. Provider implementations, operating system and any forwarding local server are separate trust boundaries. There is no claim of a comprehensive external security audit.

## v0.2 development changes

Capability discovery is permission-gated and user-triggered. It contacts the configured endpoint for model metadata without source content. Model profiles omit API keys. Continuation fields are separate from answer text and are replayed only under the matching provider, endpoint and model. They remain sensitive local conversation data and can be retained by opt-in history. Optional unsupported parameters are omitted with an inspection warning. Rejected inference is not silently retried. Model tool calls are rejected. Chromium sandboxing is explicit in the revised browser harnesses. The fresh npm audit reported zero known advisories. See `archive/model-architecture/evidence/beta-dependency-audit.json`.

## 0.1.2 portability milestone

The runtime ZIP contains the allowlisted MV3 build and bundled notices. Installation guides and hashes ship alongside it. Onboarding uses explicit Local AI and Cloud AI choices and runs discovery only on request. Connection probes do not save a provider or send source text. The package's actual extension origin is shown in Settings for exact Ollama allowlisting. See RELEASE_VERIFICATION.md for the same-path upgrade and isolated profile results.

# Helium compatibility — 0.1.1

Verified on Windows, 2026-11-11, Helium 0.21.2.1 / Chromium 157.0.8103.50 at `<local-workspace>\AppData\Local\imput\Helium\Application\chrome.exe`.

## Reproduction and finding

The previous failure is reproducible in headless Helium after the Settings connect UI action: navigation to the localhost article aborts with `net::ERR_ABORTED`; CDP reports cancellation and the frame stays `about:blank`. The server receives model discovery but not the article request. Standalone navigation works; direct background connection RPC works. Disabling tracing and avoiding redundant permission requests did not resolve it. These observations isolate a headless/UI interaction; the exact internal browser cause is not proven.

Windowed Helium completes the full suite without security bypasses, timeout inflation, or substituting another browser. Use an isolated profile:

```powershell
$env:SAGE_BROWSER='<local-workspace>\AppData\Local\imput\Helium\Application\chrome.exe'
$env:SAGE_HEADED='1'
npm run test:e2e
```

See [final log](../alpha-hardening/evidence/helium-final-e2e.txt). The fixture suite copies the production extension and pregrants localhost/tab permissions only in that copy. Separately, `scripts/helium-workflows.mjs` loads the unchanged production manifest from its original path in a fresh profile and uses actual UI permission requests. [Real workflow evidence](../alpha-hardening/evidence/helium-workflows.json) records seven real Ollama generations, model switching, PDF/DOCX, multiple tabs, history across browser restart, popup-page closure, and cancellation before cloud dispatch. [Outage recovery](../alpha-hardening/evidence/ollama-recovery.json) verifies the same extension reconnects after a real Ollama server stop/restart.

## API and surface coverage

MV3 service worker, runtime messaging, trusted local/session storage, scripting, tab selection, options, popup document and full-tab workspace function in the tested flows. Runtime host grants worked with the unchanged production manifest. Native toolbar popup anchoring, native context-menu selection, and native side-panel gestures remain unverified. The full-tab fallback is verified; API declaration alone is not proof of native panel support. Incognito is intentionally disabled. Chrome itself was not tested.

## Install or upgrade

Build with `npm run build`, open `helium://extensions`, enable Developer mode and load unpacked `.output/chrome-mv3`. For an existing installation, retain that same absolute directory and click Reload; do not remove/reinstall or reset storage. The tested production origin is `chrome-extension://<test-extension-id>`. Do not replace existing Ollama allowed origins when switching models.

Manual remaining checks: open via the actual toolbar; select page text and invoke the native SAGE menu; open/close the native side panel; revoke and regrant a website origin; exercise keyboard focus and a screen reader. Confirm errors are visible and full-tab fallback remains usable. These are acceptance gates, not recorded passes.

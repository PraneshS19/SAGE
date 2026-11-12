# Ollama setup

1. Install Ollama separately using its official distribution.
2. Start the server (`ollama serve` if it is not already running).
3. Install a suitable chat model yourself using `ollama pull MODEL`. SAGE never initiates a model download. Use `ollama list` to see installed models.
4. In SAGE Settings → AI Providers select Ollama, endpoint `http://localhost:11434`, then **Grant endpoint access & test connection**.
5. Choose a chat-capable model, set a supported context window, and save. Models advertising only embedding capability are filtered from discovery.
6. Open an article, invoke SAGE, summarize and confirm the outgoing prompt.

If you see connection refusal, verify the server is listening at the configured address. If you see HTTP 403/origin refusal, allow the exact SAGE extension origin displayed in Settings in the server’s `OLLAMA_ORIGINS` environment variable, then fully restart the server. Avoid a wildcard origin allowance. Extension IDs differ between unpacked locations and releases.

PowerShell example, using the **actual origin shown by your installation**:

```powershell
$env:OLLAMA_ORIGINS = 'chrome-extension://YOUR_EXTENSION_ID'
ollama serve
```

Do not start a second server on an occupied port. A running server with an empty model list is not a usable inference setup. SAGE surfaces model and context errors without switching to cloud inference.

For a host-level smoke test, run `node scripts/ollama-smoke.mjs` with optional `SAGE_MODEL`. This diagnostic does not validate browser CORS or side-panel behavior by itself. Official reference: [Ollama documentation](https://docs.ollama.com/).

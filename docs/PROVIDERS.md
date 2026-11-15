# AI providers

## Ollama

Install [Ollama](https://ollama.com/download), start it, then choose a chat model from the [Ollama library](https://ollama.com/library). Run `ollama pull <model-tag>` with the exact tag you selected. Downloads are explicit and can be large. Verify with `ollama list`. In SAGE use `http://127.0.0.1:11434` and click **Grant endpoint access & test connection**. Select a discovered model and run the inference test. No model is downloaded or selected automatically.

For an Ollama HTTP 403, copy the exact current extension origin from SAGE's local troubleshooting details. Append it to the existing comma-separated `OLLAMA_ORIGINS` value. Preserve existing origins. Avoid wildcard origins. Restart the server, then click **Retry Connection**.

- **Windows tray app:** Use the PowerShell instructions in SAGE or edit the user `OLLAMA_ORIGINS` environment variable. Quit Ollama fully from the system tray and reopen it.
- **macOS app:** Run `launchctl setenv OLLAMA_ORIGINS '<combined-origin-list>'` in your login session. Fully quit and reopen Ollama. For a manually launched server, use `OLLAMA_ORIGINS='<combined-origin-list>' ollama serve` after stopping the previous process.
- **Linux systemd service:** Run `sudo systemctl edit ollama.service`. In the override add `[Service]` and `Environment="OLLAMA_ORIGINS=<combined-origin-list>"` on separate lines. Run `sudo systemctl daemon-reload` and `sudo systemctl restart ollama`. For a manually launched server, use the same process-scoped command as macOS.

Use your actual combined value instead of the placeholders. [Ollama configuration FAQ](https://docs.ollama.com/faq)

## LM Studio, llama.cpp and custom APIs

Start the server with a chat model loaded. Choose the matching provider and enter its API base URL. Defaults are `http://127.0.0.1:1234/v1` for LM Studio and `http://127.0.0.1:8080/v1` for llama.cpp. Custom APIs should expose OpenAI-compatible `/models` and `/chat/completions` routes under the specified base. For remote servers use HTTPS and their required authentication. Use Advanced inference to enter the effective serving context and supported parameters if discovery is incomplete.

## OpenRouter

Select OpenRouter and use `https://openrouter.ai/api/v1`. Supply your own key in Settings. Grant access and choose an exact chat model ID. Metadata checks send the key to the configured endpoint without sending source text. Inference sends reviewed context and can incur provider charges. A cloud-only installation requires no local inference server. Keys stay in extension local storage, which is not an encrypted vault. [OpenRouter documentation](https://openrouter.ai/docs)

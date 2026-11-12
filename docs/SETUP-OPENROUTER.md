# OpenRouter setup

OpenRouter is optional. SAGE does not require a cloud account for local inference.

1. Obtain an API key from your own OpenRouter account and review its provider/data policies.
2. Select OpenRouter in SAGE Settings; the endpoint is `https://openrouter.ai/api/v1`.
3. Enter your API key, grant the endpoint and test the connection. This test sends your key to the provider for model discovery, not webpage text.
4. Select a supported model ID and its context window, then save.
5. Review each generation’s Privacy Inspector before confirming. Selected context and included conversation will leave your device.

HTTP 401 means the key is invalid or unavailable; 402 indicates exhausted credits; 429 indicates rate limiting. SAGE never automatically retries a generation or switches providers. Your provider may charge for a request even if you stop it or the browser interrupts it.

Keys are stored in extension-controlled local storage, not a hardware vault. Do not share browser profiles or export settings containing credentials. Reset SAGE data to remove its stored key; revoke the key at the provider if it was exposed.

No cloud credential was provided during this build. Live OpenRouter billing, model-specific behavior and account policy have not been tested. Official reference: [OpenRouter documentation](https://openrouter.ai/docs/quickstart).

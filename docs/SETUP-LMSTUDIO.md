# LM Studio and llama.cpp

## LM Studio

Install LM Studio, load a chat-capable model, and start its local OpenAI-compatible server. The typical base endpoint is `http://localhost:1234/v1`. In SAGE select LM Studio, grant that endpoint, test model discovery, select the loaded model and save.

The server must accept the extension origin if it enforces CORS. Keep the server on loopback unless you deliberately want network access. Enabling network access changes the security boundary; use authentication and appropriate network controls.

## llama.cpp

Start `llama-server` with an installed GGUF chat model and the correct chat template, on loopback port 8080. Select llama.cpp and `http://localhost:8080/v1`. Discover or enter the model ID exposed by the server.

SAGE uses `/models` and streamed `/chat/completions` for both providers. Compatibility differs by version and model. If discovery is unsupported, enter a model ID manually; generation still requires a compatible chat completion endpoint. Streaming expects SSE data frames, with a completion marker or finish reason.

No live LM Studio or llama.cpp server was provisioned by this build. The shared protocol is exercised against a controlled HTTP test server; live compatibility needs verification. Official references: [LM Studio local server](https://lmstudio.ai/docs/developer), [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server).

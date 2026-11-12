# SAGE

Your private AI research companion for Helium and compatible Chromium browsers. Summarize webpages, ask questions about documents, and compare selected tabs. Inspect source passages, use reusable skills, and optionally save or export your research.

**Functional Alpha 0.1.2.** Long-document synthesis and factual grounding remain limited. See [known limitations](docs/KNOWN_LIMITATIONS.md) and the [feature matrix](docs/FEATURE_MATRIX.md).

## Install and get started

Use the [portable release](dist/SAGE-Release/) after building it, or obtain its ZIP from a trusted distributor. Extract it, open the browser's Extensions page, enable Developer mode, and select the folder containing `manifest.json` with **Load unpacked**. The installed extension needs no Node.js or development server. Keep the same folder when updating. [Installation and safe updates](docs/INSTALL.md)

In SAGE Settings choose **Get Started**. Choose **Local AI** for Ollama, LM Studio or llama.cpp. Start the server and install a chat model you choose. Choose **Cloud AI** for OpenRouter or a compatible HTTPS server and supply your own key. Connection checks discover models where available. SAGE supports arbitrary compatible model IDs and adapts to the configured runtime context. [Quick start](docs/QUICK_START.md) · [Provider setup](docs/PROVIDERS.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)

Helium is the primary browser. Edge and Brave are secondary targets. Chrome support depends on Manifest V3 and developer-mode policy. See the [release verification](docs/RELEASE_VERIFICATION.md) for exact tested environments and gaps.

## Privacy and security

Review the destination, prompt and selected sources before sending. Local inference can work offline once its server and model are installed. Cloud inference transmits the reviewed context to the chosen provider. SAGE uses optional origin grants, stores settings in the browser profile and keeps history off by default. [Privacy](docs/PRIVACY.md) · [Security](docs/SECURITY.md)

## Develop, build and test

On a development machine with Node.js 24 and npm, run `npm ci` and `npm run release`. Find the runtime ZIP and guides in `dist/SAGE-Release`. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` for checks. [Development and browser testing](docs/DEVELOPMENT.md) · [File inventory](docs/FILE_INVENTORY.md) · [Architecture](docs/ARCHITECTURE.md)

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Apache-2.0 license](LICENSE) · [Dependency licenses](docs/DEPENDENCIES.md)

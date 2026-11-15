# Contributing to SAGE

Read the [development guide](docs/DEVELOPMENT.md) and use Node.js 24 with `npm ci`. Describe the behavior you want to improve and provide a minimal synthetic reproduction. Follow the [security policy](SECURITY.md) for vulnerabilities.

For a pull request, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run release` and applicable browser tests. State what you ran and distinguish controlled-provider results from live inference. Add targeted tests for permission, storage and provider changes. Document changes to network destinations or retention.

Keep telemetry and automatic cloud fallback out of the extension. Use public or synthetic data in tests and evidence. Contributions use the repository's [Apache-2.0 license](LICENSE). Review notices before introducing a dependency.

# Contributing to SAGE

Use Node.js 22.16+ or 24 LTS and `npm ci`. Keep strict TypeScript, minimal dependencies and the local-first privacy boundary intact.

Before submitting changes, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the applicable Playwright tests. Add tests for changed security or provider behavior. Use controlled fixtures for deterministic tests; never present fixture output as actual model behavior.

Do not add telemetry, remote executable code, automatic cloud fallback, hidden content collection or broad installation-time host grants. No secrets or real private webpage content belong in commits, screenshots, traces or issue reports.

Document new permissions, network destinations, retention behavior and browser limits. Check UI with keyboard navigation and both themes. Verify a clean build artifact and inspect the generated manifest before proposing release.

Changes are proposed under the repository’s Apache-2.0 license. Review dependency licenses before introducing new packages. Maintainer identity, public repository URL, release signing and security-contact policy must be established before public publication.

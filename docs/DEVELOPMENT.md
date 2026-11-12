# Development

Install Node.js 24 and npm on the development computer. Run `npm ci`, then `npm run release` to compile, check and stage a distribution under `dist/SAGE-Release`. Use `npm run dev` for development only. Run `npm run typecheck`, `npm run lint` and `npm test` before a release. For Chromium browser tests, install Playwright Chromium and run `npm run test:e2e`. To test Helium, set `SAGE_BROWSER` to its executable and `SAGE_HEADED=1` before running the suite.

The runtime is separate from development dependencies. `npm run verify:release` scans source and checks and packages an existing WXT production build. The GitHub Actions workflow verifies the package and can retain a build artifact. It does not publish to browser stores. Real browser acceptance scripts in `scripts/` use `SAGE_BROWSER` rather than a machine-specific executable path.

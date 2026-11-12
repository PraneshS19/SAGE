# File inventory

| Path                                                                                | Purpose                                                                    | In installed runtime?                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/entrypoints`, `src/components`, `src/lib`, `src/features`, `src/styles`        | Extension logic, UI, adapters, document parsing and styles                 | Compiled bundles only                                     |
| `public/icons`, `public/LICENSE`, `public/NOTICE`, `public/THIRD_PARTY_NOTICES.txt` | Icons and required notices                                                 | Yes                                                       |
| `package.json`, lockfile, WXT, TypeScript and ESLint config                         | Reproducible development inputs                                            | No                                                        |
| `tests`, `scripts`, `.github`                                                       | Fixtures, regression and release automation                                | No                                                        |
| `docs`                                                                              | Setup guides, test evidence and historical reports                         | No. Selected guides accompany the ZIP outside the runtime |
| `node_modules`, `.wxt`, `.npm-cache`, `test-results`                                | Generated tools, caches and disposable test profiles                       | No                                                        |
| `.output/chrome-mv3`                                                                | WXT production output. Retained at its path for existing unpacked installs | Runtime source for packaging                              |
| `dist/SAGE-Release/sage-extension` and `sage-extension.zip`                         | Separately staged extension. ZIP entries are relative to the manifest root | Yes                                                       |

The runtime allowlist covers the MV3 manifest, popup/options/workspace HTML, worker scripts, compiled chunks and CSS, PDF worker, icons and notices. The package verifier checks expected permissions and CSP, referenced HTML/manifest assets, common credential and machine-path patterns, and ZIP round-trip equality. It rejects unknown runtime files. Git ignores generated bundles, profiles, models and environment files.

Historical verification output is organized by milestone under `docs/archive`. Original reports and useful raw evidence were retained. Local server logs were moved to ignored `test-results`. Production modules and dependencies were kept where they are used. The loaded extension path and existing browser profile were kept in place.

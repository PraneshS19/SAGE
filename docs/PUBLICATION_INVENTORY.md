# Publication cleanup inventory

The public branch replays both original commits using a GitHub noreply author and committer identity. A verified Git bundle and working-tree ZIP preserve the original repository separately. The original repository had no tags.

| Path                                                                                   | Disposition                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `scripts/helium-diagnose.mjs`                                                          | Excluded from both public snapshots. The maintained browser and live workflow suites cover the relevant flows.      |
| `docs/archive/alpha-hardening/evidence/helium-{click,copy,extension,netlog}-probe.txt` | Excluded four exploratory browser transcripts.                                                                      |
| `docs/archive/alpha-hardening/evidence/hardening-doc-format.txt`                       | Excluded the formatter transcript.                                                                                  |
| `docs/archive/model-architecture/evidence/beta-doc-format.txt`                         | Excluded the formatter transcript.                                                                                  |
| `docs/archive/model-architecture/evidence/beta-native-environment.json`                | Excluded the workstation-specific environment report.                                                               |
| Remaining archived reports and model evaluation                                        | Redacted local Windows paths, test profile identifiers and extension origins. Repaired evidence links where needed. |
| Runtime, maintained tests, fixtures, assets and lockfile                               | Preserved.                                                                                                          |
| `test-results/`, caches, dependencies, `.wxt/`, `.output/` and `dist/`                 | Ignored. Existing local builds and profiles stay in place.                                                          |

See [publication preparation](PUBLICATION.md) for the target and procedure.

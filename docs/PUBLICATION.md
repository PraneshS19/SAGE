# SAGE publication preparation

Target [PraneshS19/SAGE](https://github.com/PraneshS19/SAGE). This repository is a sanitized local copy prepared for separate publication approval. No release or push has occurred. See [cleanup inventory](PUBLICATION_INVENTORY.md).

## Repository metadata to apply with publication approval

Description: Privacy-first, model-agnostic AI research companion for Chromium browsers. Summarize pages, analyze documents, and compare sources with local or cloud AI.

Topics: `browser-extension`, `helium-browser`, `chromium`, `ollama`, `openrouter`, `local-llm`, `typescript`, `react`, `privacy`, `ai-research`.

Use `main` as the default branch. If available, enable private vulnerability reporting. The CI workflow runs on main and pull requests against main. Its GitHub-hosted status can be checked after publication.

## Publication procedure

Only after final approval, recheck the exact destination, ensure refs are still empty and push the verified refinement branch to the remote default branch from the sanitized repository. The local `main` remains at the previously verified baseline.

```sh
git remote get-url origin
git ls-remote origin
git push -u origin refactor/final-ui-polish:main
```

If refs unexpectedly appear, inspect and integrate them first. Create a GitHub Release for `v0.1.3` separately after verifying the pushed commit. Label it Functional Alpha and attach `sage-extension-0.1.3.zip`, `INSTALL.md`, `QUICK_START.md` and a checksum for the downloadable files. The full distribution checksum also includes files in the unpacked directory. Verification scope and limitations remain in the [release verification report](RELEASE_VERIFICATION.md).

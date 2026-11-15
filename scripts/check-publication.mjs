/* global process */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 8_000_000 });
const forbiddenPath =
  /(?:^|\/)(?:node_modules|test-results|dist|\.output|\.wxt|\.browser-profiles)(?:\/|$)|(?:^|\/)\.env(?!\.example$)|\.((?:pem|key|gguf|safetensors|bundle|zip|log))$/i;
const credential =
  /sk-or-v1-[a-f0-9]{48,}|sk-(?:proj-|live-)[\w-]{28,}|gh[pousr]_[\w]{30,}|github_pat_[\w]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|Bearer [\w.-]{24,}/;
const localIdentifier =
  /[A-Z]:[\\/]+Users[\\/]|chrome-extension:\/\/[a-p]{32}|\/home\/[^\s/]+\/SAGE/i;
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const failures = [];
const scan = (name, content, label) => {
  if (forbiddenPath.test(name))
    failures.push(`${label}: excluded path ${name}`);
  if (!/\.(?:md|json|txt|tsx?|m?js|ya?ml|html|css)$/i.test(name)) return;
  if (credential.test(content))
    failures.push(`${label}: possible credential in ${name}`);
  if (localIdentifier.test(content))
    failures.push(`${label}: workstation path or origin in ${name}`);
};
for (const name of tracked) {
  const content = readFileSync(name, "utf8");
  scan(name, content, "tree");
  if (!name.endsWith(".md")) continue;
  for (const match of content.matchAll(/\]\(([^)\r\n]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (
      target &&
      !/^[a-z][a-z0-9+.-]*:/i.test(target) &&
      !existsSync(path.resolve(path.dirname(name), target))
    )
      failures.push(`Broken local link in ${name}: ${target}`);
  }
}
if (process.argv.includes("--history")) {
  for (const commit of git("rev-list", "HEAD").trim().split(/\r?\n/)) {
    const identity = git("show", "-s", "--format=%ae%n%ce", commit)
      .trim()
      .split(/\r?\n/);
    if (identity.some((email) => !/@users\.noreply\.github\.com$/i.test(email)))
      failures.push(`Non-noreply identity in commit ${commit.slice(0, 7)}`);
    for (const name of git("ls-tree", "-r", "--name-only", "-z", commit)
      .split("\0")
      .filter(Boolean)) {
      scan(
        name,
        /\.(?:md|json|txt|tsx?|m?js|ya?ml|html|css)$/i.test(name)
          ? git("show", `${commit}:${name}`)
          : "",
        commit.slice(0, 7),
      );
    }
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  "Publication checks passed: paths, credential and machine patterns, and Markdown link targets.",
);

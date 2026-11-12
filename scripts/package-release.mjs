import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";

const build = path.resolve(".output/chrome-mv3");
const release = path.resolve("dist/SAGE-Release");
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rootFiles = new Set([
  "manifest.json",
  "background.js",
  "extract.js",
  "popup.html",
  "options.html",
  "sidepanel.html",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.txt",
]);
const allowed = (name) =>
  rootFiles.has(name) ||
  /^icons\/\d+\.png$/.test(name) ||
  /^(chunks|assets)\/[\w.-]+\.(js|mjs|css)$/.test(name);
const credential =
  /(?:sk-or-v1-[0-9a-f]{48,}|sk-(?:proj-|live-)[\w-]{28,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
async function scan(directory, prefix = "") {
  const files = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name, "en"),
  )) {
    const key = prefix + entry.name;
    const location = path.join(directory, entry.name);
    if (entry.isDirectory())
      Object.assign(files, await scan(location, key + "/"));
    else {
      if (!entry.isFile() || !allowed(key))
        throw new Error(`Unexpected runtime file: ${key}`);
      const bytes = await readFile(location);
      if (
        /\.(?:js|mjs|html|css|json)$/.test(key) &&
        (credential.test(bytes.toString()) ||
          /@vite\/client|chrome-extension:\/\/[a-p]{32}|(?:[A-Z]:[\\/]+Users[\\/]|\/home\/[^/]+\/SAGE)/i.test(
            bytes.toString(),
          ))
      )
        throw new Error(
          `Credential, fixed origin or developer path pattern in ${key}`,
        );
      files[key] = bytes;
    }
  }
  return files;
}
const files = await scan(build);
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const manifest = JSON.parse(files["manifest.json"]?.toString() ?? "null");
assert(
  manifest?.manifest_version === 3 && manifest.version === version,
  "Unexpected manifest or version",
);
assert(
  !manifest.key &&
    manifest.incognito === "not_allowed" &&
    !manifest.host_permissions?.length &&
    !manifest.content_scripts?.length,
  "Unexpected identity or default access",
);
const exact = (actual, expected) =>
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
assert(
  exact(manifest.permissions, [
    "activeTab",
    "scripting",
    "storage",
    "contextMenus",
    "sidePanel",
  ]) &&
    exact(manifest.optional_permissions, ["tabs"]) &&
    exact(manifest.optional_host_permissions, [
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://*/*",
      "https://*/*",
    ]),
  "Unexpected permissions",
);
assert(
  manifest.content_security_policy.extension_pages ===
    "script-src 'self'; object-src 'self'; base-uri 'none'",
  "Unexpected CSP",
);
for (const name of [
  ...rootFiles,
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  manifest.side_panel.default_path,
  ...Object.values(manifest.icons),
])
  assert(files[name], `Missing runtime file: ${name}`);
for (const [name, bytes] of Object.entries(files)) {
  if (!name.endsWith(".html")) continue;
  for (const match of bytes.toString().matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1].replace(/^\//, "");
    assert(
      files[target],
      `Missing or nonlocal dependency in ${name}: ${target}`,
    );
  }
}
assert(
  Object.keys(files).some((name) => /pdf\.worker.*\.mjs$/.test(name)),
  "Missing PDF worker",
);
const entries = Object.fromEntries(
  Object.keys(files)
    .sort()
    .map((name) => [name, files[name]]),
);
const archive = zipSync(entries, { level: 6, mtime: new Date(2000, 0, 1) });
const extracted = unzipSync(archive);
assert(
  exact(Object.keys(extracted), Object.keys(entries)) &&
    Object.entries(entries).every(
      ([name, bytes]) => digest(bytes) === digest(extracted[name]),
    ),
  "ZIP round-trip failed",
);
// Stage a clean tree so old hashed chunks never enter a new package.
const { mkdtemp, rename, rm } = await import("node:fs/promises");
const parent = path.dirname(release);
await mkdir(parent, { recursive: true });
const stage = await mkdtemp(path.join(parent, "sage-stage-"));
const sums = [];
async function put(name, bytes) {
  const target = path.join(stage, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  sums.push(`${digest(bytes)}  ${name}`);
}
for (const [name, bytes] of Object.entries(entries))
  await put(`sage-extension/${name}`, bytes);
await put("sage-extension.zip", archive);
for (const guide of [
  "INSTALL.md",
  "QUICK_START.md",
  "PRIVACY.md",
  "PROVIDERS.md",
  "TROUBLESHOOTING.md",
])
  await put(guide, await readFile(`docs/${guide}`));
await writeFile(path.join(stage, "SHA256SUMS.txt"), sums.join("\n") + "\n");
const { realpath } = await import("node:fs/promises");
const previous = await realpath(release).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
if (previous) {
  assert(
    path.relative(await realpath(parent), previous) === "SAGE-Release",
    "Release path resolves outside the intended directory",
  );
  // Only replace generated distribution folders containing our checksum manifest.
  await readFile(path.join(previous, "SHA256SUMS.txt"));
  const backup = stage + "-previous";
  await rename(previous, backup);
  try {
    await rename(stage, release);
  } catch (error) {
    await rename(backup, release);
    throw error;
  }
  assert(
    path.dirname(await realpath(backup)) === (await realpath(parent)),
    "Backup outside distribution directory",
  );
  await rm(backup, { recursive: true });
} else await rename(stage, release);
console.log(
  `Verified ${Object.keys(files).length} runtime files. ZIP SHA-256 ${digest(archive)}`,
);

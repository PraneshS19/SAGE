import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
// Scan source inputs without logging matching text or credentials.
function filesUnder(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory()
      ? filesUnder(file)
      : entry.isFile()
        ? [file]
        : [];
  });
}
const files = ["src", "scripts", "public", "tests", ".github"].flatMap(
  filesUnder,
);
const secret =
  /(?:sk-or-v1-[0-9a-f]{48,}|sk-(?:proj-|live-)[\w-]{28,}|gh[pousr]_[A-Za-z0-9]{30,})/;
const machine = /[A-Z]:[\\/]+Users[\\/]|chrome-extension:\/\/[a-p]{32}/i;
for (const file of files.filter((f) => /\.(tsx?|m?js|ya?ml)$/.test(f))) {
  const source = readFileSync(file, "utf8");
  if (secret.test(source) || machine.test(source))
    throw new Error(
      `Potential credential or machine-specific literal in ${file}`,
    );
}
console.log("Source credential and machine-path pattern check passed.");

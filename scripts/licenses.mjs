import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const deps = Object.entries(lock.packages).filter(
  ([name, p]) => name && !p.dev && !p.devOptional,
);
const lines = [
  "# Production dependency license inventory",
  "",
  "Generated from the installed lockfile. This is an engineering compatibility review, not a legal opinion. Original SAGE code uses Apache-2.0. Runtime dependencies below declare permissive MIT, ISC, BSD or Apache licenses. Preserve their notices when distributing compiled code. Development-only tooling is not included in the extension runtime.",
  "",
  "| Package | Version | Declared license |",
  "| --- | --- | --- |",
];
let notices =
  "SAGE third-party notices\n\nBundled dependencies retain their own copyrights and licenses.\n";
for (const [name, p] of deps) {
  lines.push(
    `| ${name.replace("node_modules/", "")} | ${p.version} | ${p.license ?? "CHECK PACKAGE"} |`,
  );
  try {
    const files = await readdir(name);
    for (const file of files.filter((f) =>
      /^(license|copying|notice)(\.|$)/i.test(f),
    )) {
      notices += `\n\n--- ${name} / ${file} ---\n\n${await readFile(path.join(name, file), "utf8")}`;
    }
  } catch {
    /* Platform optional package not installed: inventory still records declaration. */
  }
}
await mkdir("docs", { recursive: true });
await writeFile("docs/DEPENDENCIES.md", lines.join("\n") + "\n");
await writeFile("public/THIRD_PARTY_NOTICES.txt", notices);

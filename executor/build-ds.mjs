import { fileURLToPath } from 'node:url';
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const require = createRequire(
  new URL("../student-web/package.json", import.meta.url),
);
const { build } = require("esbuild");
const result = await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: [fileURLToPath(new URL("./ds-worker-entry.mjs", import.meta.url))],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
  minify: false,
  legalComments: "none",
});
const output = result.outputFiles[0].text,
  destination = new URL("./dist/ds-worker.js", import.meta.url);
if (process.argv.includes("--write")) {
  mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
  writeFileSync(destination, output);
} else if (readFileSync(destination, "utf8") !== output)
  throw new Error(
    "DS bundle differs from reviewed source. Rebuild and review its manifest hash.",
  );
console.log(
  `DS worker SHA256 ${createHash("sha256").update(output).digest("hex")}`,
);

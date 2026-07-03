// Regenerate the contract goldens — run this ONLY when a surface change is deliberate:
//
//   npx tsx tools/gen-goldens.ts
//
// The goldens pin the MCP tool schemas and the CLI command surface; the contract suite
// (test/chorus-contract.test.ts) fails CI when the live surface drifts from them. That failure
// is the feature: a breaking change must be a decision, never a side effect.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../src/mcp-server.js";
import { commandNames } from "../src/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = resolve(here, "../test/golden");
mkdirSync(goldenDir, { recursive: true });

writeFileSync(join(goldenDir, "mcp-tools.json"), `${JSON.stringify(TOOLS, null, 2)}\n`);
writeFileSync(
  join(goldenDir, "cli-commands.json"),
  `${JSON.stringify(commandNames().sort(), null, 2)}\n`,
);
console.log(`goldens written to ${goldenDir}`);

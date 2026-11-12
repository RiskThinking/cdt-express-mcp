// Write the UTCP manual and MCP tool metadata as release assets.
// Run after `npm run build`.
import { writeFile } from "node:fs/promises";
import { buildToolsCatalog, buildUtcpManual } from "../build/catalog.js";

await writeFile("utcp.json", `${JSON.stringify(buildUtcpManual(), null, 2)}\n`);
await writeFile(
  "tools.json",
  `${JSON.stringify(buildToolsCatalog(), null, 2)}\n`,
);
console.log("Wrote utcp.json and tools.json");

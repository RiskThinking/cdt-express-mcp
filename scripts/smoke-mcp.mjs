import { strict as assert } from "node:assert";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const entryPoint = resolve(process.argv[2] || "build/index.js");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entryPoint],
  env: { ...process.env, CDT_API_KEY: "smoke" },
  stderr: "pipe",
});
const client = new Client({ name: "cdt-express-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert(tools.some(({ name }) => name === "get_metrics_definition"));
  console.log(`MCP smoke test listed ${tools.length} tools`);
} finally {
  await client.close();
}

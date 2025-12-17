import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getServer } from "./server.js";

const apiKey = process.env.CDT_API_KEY || process.argv[2];
if (!apiKey) {
  console.error("DTO: Error - CDT_API_KEY is missing!");
  process.exit(1);
}

async function main() {
  const server = getServer(apiKey);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("DTO: Fatal Error in main:", err);
  process.exit(1);
});

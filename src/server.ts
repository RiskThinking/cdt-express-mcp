import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ICONS,
  METRICS,
  SERVER_DESCRIPTION,
  SERVER_INSTRUCTIONS,
  SERVER_TITLE,
  SERVER_VERSION,
  WEBSITE_URL,
} from "./constants.js";
import { METRIC_DEFINITIONS } from "./glossary.js";
import { API_BASE_URL, API_TOOLS } from "./tools.js";
import { getCallback } from "./utils.js";

export const getServer = (apiKey: string) => {
  const server = new McpServer(
    {
      name: "CDT Express MCP Server",
      title: SERVER_TITLE,
      version: SERVER_VERSION,
      description: SERVER_DESCRIPTION,
      websiteUrl: WEBSITE_URL,
      icons: ICONS,
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // Glossary resource (passive) and tool (active)
  server.registerResource(
    "metrics_glossary",
    "file:///glossary/metrics.txt",
    {
      title: "Climate Risk Metrics Glossary",
      description: "Definitions of climate risk metrics used by CDT Express.",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: METRIC_DEFINITIONS,
          mimeType: "text/plain",
        },
      ],
    }),
  );

  server.registerTool(
    "get_metrics_definition",
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      title: "Get Climate Metric Definitions",
      description: `Returns the official CDT Express definitions for metrics: ${METRICS.join(", ")}.`,
    },
    async () => ({
      content: [
        {
          type: "text",
          text: METRIC_DEFINITIONS,
        },
      ],
    }),
  );

  const apiAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  for (const tool of API_TOOLS) {
    server.registerTool(
      tool.name,
      {
        annotations: apiAnnotations,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
      },
      getCallback(
        tool.input,
        `${API_BASE_URL}${tool.path}`,
        apiKey,
        tool.fetchAll ? { exhaustive: true, format: "csv" } : undefined,
      ),
    );
  }

  return server;
};

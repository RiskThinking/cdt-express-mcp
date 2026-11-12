import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ICONS,
  MCP_SCOPE,
  METRICS,
  SERVER_DESCRIPTION,
  SERVER_INSTRUCTIONS,
  SERVER_TITLE,
  SERVER_VERSION,
  WEBSITE_URL,
} from "./constants.js";
import { METRIC_DEFINITIONS } from "./glossary.js";
import { z } from "zod";
import { SKILL_PROMPTS } from "./prompts.generated.js";
import { API_OUTPUT_SCHEMA } from "./schema.js";
import { API_BASE_URL, API_TOOLS, toolInputSchema } from "./tools.js";
import { getCallback } from "./utils.js";

// ChatGPT reads per-tool security schemes to decide which tools need sign-in.
const PUBLIC_SECURITY = { securitySchemes: [{ type: "noauth" }] };
const SIGNED_IN_SECURITY = {
  securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }],
};

/**
 * Build an MCP server for one request. Without an API key (anonymous
 * discovery), API-backed tools are still listed but refuse to run; the HTTP
 * layer normally rejects such calls with a 401 before they reach a tool.
 */
export const getServer = (apiKey?: string) => {
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
      _meta: PUBLIC_SECURITY,
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
    const url = `${API_BASE_URL}${tool.path}`;
    const paginated = Boolean(tool.allPagesAlias);
    const inputSchema = toolInputSchema(tool);
    server.registerTool(
      tool.name,
      {
        annotations: apiAnnotations,
        title: tool.title,
        description: paginated
          ? `${tool.description} Set fetch_all to merge every page into CSV.`
          : tool.description,
        inputSchema,
        outputSchema: API_OUTPUT_SCHEMA,
        _meta: SIGNED_IN_SECURITY,
      },
      getCallback(inputSchema, url, apiKey, { paginated }),
    );

    // Deprecated in 0.8.0, to be removed in 0.9.0: the former all-pages tools.
    if (tool.allPagesAlias) {
      server.registerTool(
        tool.allPagesAlias,
        {
          annotations: apiAnnotations,
          title: `${tool.title} (all pages, deprecated)`,
          description: `Deprecated: call ${tool.name} with fetch_all: true instead. Same as that tool with every page merged into CSV.`,
          inputSchema: tool.input,
          outputSchema: API_OUTPUT_SCHEMA,
          _meta: SIGNED_IN_SECURITY,
        },
        getCallback(tool.input, url, apiKey, {
          exhaustive: true,
          paginated: true,
        }),
      );
    }
  }

  // Question workflows from crc-docs skills, as one-click starters.
  for (const prompt of SKILL_PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: {
          [prompt.argument.name]: z
            .string()
            .optional()
            .describe(prompt.argument.description),
        },
      },
      (args: Record<string, string | undefined>) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: renderSkillPrompt(prompt, args[prompt.argument.name]),
            },
          },
        ],
      }),
    );
  }

  return server;
};

export const renderSkillPrompt = (
  prompt: (typeof SKILL_PROMPTS)[number],
  value: string | undefined,
) =>
  [
    `${prompt.title} ${prompt.argument.name[0].toUpperCase()}${prompt.argument.name.slice(1)}: ${value?.trim() || "(ask me)"}`,
    "Answer by following the skill below. The CDT Express tools are connected, so use Route 1 (CDT) unless I ask for another data source.",
    `<skill name="${prompt.name}" source="${prompt.source}">`,
    prompt.skill,
    "</skill>",
  ].join("\n\n");

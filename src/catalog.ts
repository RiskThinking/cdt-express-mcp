// Machine-readable descriptions of the tools, generated from the tool table:
// tools.json (MCP tool metadata for downstream checks) and the UTCP manual.

import { z } from "zod";
import {
  PUBLIC_ORIGIN,
  SERVER_TITLE,
  SERVER_VERSION,
  WEBSITE_URL,
} from "./constants.js";
import { API_OUTPUT_SCHEMA } from "./schema.js";
import {
  API_BASE_URL,
  API_TOOLS,
  type ApiTool,
  PUBLIC_TOOL_NAMES,
  toolInputSchema,
} from "./tools.js";
import { QUERY_ALIASES } from "./utils.js";

type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  [key: string]: unknown;
};

const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
  return rest;
};

export const UTCP_API_KEY_VARIABLE = "CDT_API_KEY";
export const GLOSSARY_PATH = "/glossary";

/** MCP tool metadata, published with each release and at /tools.json. */
export const buildToolsCatalog = () => ({
  name: SERVER_TITLE,
  version: SERVER_VERSION,
  website: WEBSITE_URL,
  tools: [
    {
      name: "get_metrics_definition",
      public: true,
      endpoint: `${PUBLIC_ORIGIN}${GLOSSARY_PATH}`,
    },
    ...API_TOOLS.flatMap((tool) => [
      {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        public: PUBLIC_TOOL_NAMES.has(tool.name),
        endpoint: `${API_BASE_URL}${tool.path}`,
        input_schema: jsonSchema(toolInputSchema(tool)),
      },
      ...(tool.allPagesAlias
        ? [{ name: tool.allPagesAlias, deprecated_for: tool.name }]
        : []),
    ]),
  ],
});

/**
 * UTCP clients call the API directly, so the inputs describe the API's own
 * query parameters: renamed parameters use the API name, and lists are
 * comma-separated strings, because UTCP's HTTP client would otherwise send
 * `name[]=a&name[]=b`.
 */
const utcpInputs = (tool: ApiTool): JsonSchema => {
  const schema = jsonSchema(tool.input);
  const properties: Record<string, JsonSchema> = {};
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const apiName = QUERY_ALIASES[name] ?? name;
    if (property.type === "array") {
      const allowed = property.items?.enum;
      const { items: _items, default: fallback, ...rest } = property;
      properties[apiName] = {
        ...rest,
        type: "string",
        description: [
          property.description,
          "Comma-separated list, e.g. a,b.",
          allowed ? `Allowed values: ${allowed.join(", ")}.` : undefined,
          Array.isArray(fallback)
            ? `Default: ${fallback.join(",")}.`
            : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      };
    } else {
      properties[apiName] = property;
    }
  }
  return {
    ...schema,
    properties,
    required: schema.required?.map((name) => QUERY_ALIASES[name] ?? name),
  };
};

const KEY_NOTE = `Requires a CDT Express API key (variable ${UTCP_API_KEY_VARIABLE}) from ${WEBSITE_URL}.`;

/** UTCP manual served at /utcp: the same tools, called directly on the API. */
export const buildUtcpManual = ({
  apiBaseUrl = API_BASE_URL,
  glossaryUrl = `${PUBLIC_ORIGIN}${GLOSSARY_PATH}`,
}: { apiBaseUrl?: string; glossaryUrl?: string } = {}) => {
  const outputs = jsonSchema(API_OUTPUT_SCHEMA);
  return {
    utcp_version: "1.0.1",
    manual_version: SERVER_VERSION,
    tools: [
      {
        name: "get_metrics_definition",
        description:
          "Returns the official CDT Express definitions of the risk metrics (dcr_score, expected_impact, cvar_*, var_*). No API key needed.",
        inputs: { type: "object", properties: {} },
        outputs: { type: "string" },
        tags: ["cdt-express", "climate-risk", "glossary"],
        tool_call_template: {
          name: "cdt_express_glossary",
          call_template_type: "http",
          http_method: "GET",
          url: glossaryUrl,
          content_type: "text/plain",
        },
      },
      ...API_TOOLS.map((tool) => ({
        name: tool.name,
        description: `${tool.title}. ${tool.description} ${KEY_NOTE}`,
        inputs: utcpInputs(tool),
        outputs,
        tags: ["cdt-express", "climate-risk"],
        tool_call_template: {
          name: "cdt_express_api",
          call_template_type: "http",
          http_method: "GET",
          url: `${apiBaseUrl}${tool.path}`,
          content_type: "application/json",
          auth: {
            auth_type: "api_key",
            api_key: `Bearer \${${UTCP_API_KEY_VARIABLE}}`,
            var_name: "Authorization",
            location: "header",
          },
        },
      })),
    ],
  };
};

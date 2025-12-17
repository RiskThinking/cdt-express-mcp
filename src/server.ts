import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HORIZONS, PATHWAYS, RISK_FACTORS, STATISTICS } from "./constants.js";

type ToolInput = Record<
  string,
  string | number | (string | number)[] | undefined | null
>;

const LAT_SCHEMA = z.number().min(-90).max(90).describe("Latitude");
const LON_SCHEMA = z.number().min(-180).max(180).describe("Longitude");
const METRICS_SCHEMA = z
  .object({
    latitude: LAT_SCHEMA,
    longitude: LON_SCHEMA,
    risk_factors: z
      .array(z.enum(RISK_FACTORS))
      .optional()
      .describe("Risk factors (e.g. 'fwi,hot_days')"),
    pathway: z
      .array(z.enum(PATHWAYS))
      .optional()
      .describe(
        "Climate pathway (e.g. 'ssp245'), REQUIRED if 'horizon' is not provided.",
      ),
    horizon: z
      .array(z.enum(HORIZONS))
      .optional()
      .describe(
        "Horizon years (e.g. '2050'), REQUIRED if 'pathway' is not provided.",
      ),
    percentiles: z
      .array(z.number().min(1).max(100))
      .optional()
      .describe(
        "Comma-separated list of percentiles. Defaults to: 50, 75, 90, 95, 99",
      ),
    statistics: z
      .array(z.enum(STATISTICS))
      .optional()
      .describe(
        "Comma-separated list of statistics. Defaults to: minimum, maximum, mean",
      ),
    return_periods: z
      .array(z.number().min(1).max(1000))
      .optional()
      .describe(
        "Comma-separated list of return periods (1-1000 years). Defaults to: 2, 5, 10, 20, 100",
      ),
  })
  .superRefine((data, ctx) => {
    // handle the custom logic for either horizon or pathway being required
    if (
      (!data.pathway || data.pathway.length === 0) &&
      (!data.horizon || data.horizon.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "At least one of 'pathway' or 'horizon' must be provided.",
        path: ["pathway", "horizon"],
      });
    }
  });
const DISTRIBUTION_SCHEMA = z.object({
  latitude: LAT_SCHEMA,
  longitude: LON_SCHEMA,
  risk_factor: z
    .enum(RISK_FACTORS)
    .describe("Single risk factor (e.g. 'fwi')"),
  pathway: z.enum(PATHWAYS).describe("Climate pathway (e.g. 'ssp245')"),
  horizon: z.enum(HORIZONS).describe("Horizon year (e.g. '2050')"),
});

const validateInput = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Validation Failed: ${result.error.message}`);
  }
  return result.data;
};

const buildParams = (inputs: ToolInput) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(inputs)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      params.append(key, value.join(","));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
};

const _fetch = async (
  endpoint: string,
  params: URLSearchParams,
  apiKey: string,
) => {
  try {
    const response = await fetch(`${endpoint}?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [
          {
            type: "text" as const,
            text: `API Error ${response.status}: ${errorText}`,
          },
        ],
        isError: true,
      };
    }

    const data = await response.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  } catch (error: unknown) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Network Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
};

const getCallback = <T extends z.ZodTypeAny>(
  schema: T,
  endpoint: string,
  apiKey: string,
) => {
  return async (input: unknown) => {
    try {
      const validData = validateInput(schema, input);
      const params = buildParams(validData as ToolInput);
      return _fetch(endpoint, params, apiKey);
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text" as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  };
};

export const getServer = (apiKey: string) => {
  const server = new McpServer({
    name: "CDT Express MCP Server",
    version: "v4",
  });

  server.registerTool(
    "get_climate_metrics_exposure",
    {
      title: "Get exposure metrics for a location",
      description:
        "Returns exposure statistics, percentiles, and return periods.",
      inputSchema: METRICS_SCHEMA,
    },
    getCallback(
      METRICS_SCHEMA,
      "https://api.riskthinking.ai/v4/climate/metrics/exposure",
      apiKey,
    ),
  );

  server.registerTool(
    "get_climate_metrics_impact",
    {
      title: "Get impact metrics for a location",
      description:
        "Returns impact statistics based on asset damage calculations.",
      inputSchema: METRICS_SCHEMA,
    },
    getCallback(
      METRICS_SCHEMA,
      "https://api.riskthinking.ai/v4/climate/metrics/impact",
      apiKey,
    ),
  );

  server.registerTool(
    "get_climate_metrics_probability_adjusted_impact",
    {
      title: "Get probability-adjusted impact metrics",
      description:
        "Returns impact metrics with probability-adjusted return periods.",
      inputSchema: METRICS_SCHEMA,
    },
    getCallback(
      METRICS_SCHEMA,
      "https://api.riskthinking.ai/v4/climate/metrics/probability_adjusted_impact",
      apiKey,
    ),
  );

  server.registerTool(
    "get_climate_distribution_exposure",
    {
      title: "Get exposure distribution for a location",
      description:
        "Returns the full exposure distribution (quantile values) for a single risk factor.",
      inputSchema: DISTRIBUTION_SCHEMA,
    },
    getCallback(
      DISTRIBUTION_SCHEMA,
      "https://api.riskthinking.ai/v4/climate/distribution/exposure",
      apiKey,
    ),
  );

  server.registerTool(
    "get_climate_distribution_impact",
    {
      title: "Get impact distribution for a location",
      description:
        "Returns the full impact distribution (quantile values) for a single risk factor.",
      inputSchema: DISTRIBUTION_SCHEMA,
    },
    getCallback(
      DISTRIBUTION_SCHEMA,
      "https://api.riskthinking.ai/v4/climate/distribution/impact",
      apiKey,
    ),
  );

  return server;
};

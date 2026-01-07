import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { METRICS } from "./constants.js";
import { METRIC_DEFINITIONS } from "./glossary.js";
import {
  ASSET_ID_SCHEMA,
  ASSET_SCORES_SCHEMA,
  COMPANY_ASSETS_SCHEMA,
  COMPANY_CLUSTERS_SCHEMA,
  COMPANY_ID_SCHEMA,
  COMPANY_SCORES_SCHEMA,
  DISTRIBUTION_SCHEMA,
  GROUP_ID_SCHEMA,
  INDEX_ASSETS_SCHEMA,
  INDEX_ASSETS_SCORES_SCHEMA,
  INDEX_CLUSTERS_SCHEMA,
  INDEX_COMPANIES_SCHEMA,
  INDEX_COMPANIES_SCORES_SCHEMA,
  INDEX_ID_SCHEMA,
  INDEX_SCORES_SCHEMA,
  LIST_ASSETS_SCHEMA,
  LIST_COMPANIES_SCHEMA,
  LIST_GROUP_CONSTITUENTS_SCHEMA,
  METRICS_SCHEMA,
  PAGINATION_SCHEMA,
  SEARCH_ASSETS_SCHEMA,
  SEARCH_COMPANIES_SCHEMA,
  SEARCH_MARKET_GROUPS_SCHEMA,
  SEARCH_MARKET_INDEXES_SCHEMA,
} from "./schema.js";
import { getCallback } from "./utils.js";

export const getServer = (apiKey: string) => {
  const server = new McpServer({
    name: "CDT Express MCP Server",
    version: "0.3.1",
  });

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

  // Climate Metrics API
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

  // Physical Assets API
  server.registerTool(
    "list_assets",
    {
      title: "List physical assets",
      description:
        "Paginate through physical asset data with optional filters for country and asset type.",
      inputSchema: LIST_ASSETS_SCHEMA,
    },
    getCallback(
      LIST_ASSETS_SCHEMA,
      "https://api.riskthinking.ai/v3/assets",
      apiKey,
    ),
  );
  server.registerTool(
    "get_asset",
    {
      title: "Get asset details",
      description: "Retrieve details for a specific physical asset by ID.",
      inputSchema: ASSET_ID_SCHEMA,
    },
    getCallback(
      ASSET_ID_SCHEMA,
      "https://api.riskthinking.ai/v3/assets/{asset_id}",
      apiKey,
    ),
  );
  server.registerTool(
    "search_assets",
    {
      title: "Search assets",
      description:
        "Search for assets by name/address within a specific scope (public, organization, or company).",
      inputSchema: SEARCH_ASSETS_SCHEMA,
    },
    getCallback(
      SEARCH_ASSETS_SCHEMA,
      "https://api.riskthinking.ai/v3/assets/search",
      apiKey,
    ),
  );
  server.registerTool(
    "get_asset_climate_scores",
    {
      title: "Get asset climate risk scores",
      description:
        "Retrieve physical risk analytics (scores) for a specific asset.",
      inputSchema: ASSET_SCORES_SCHEMA,
    },
    getCallback(
      ASSET_SCORES_SCHEMA,
      "https://api.riskthinking.ai/v3/assets/{asset_id}/climate/scores",
      apiKey,
    ),
  );

  // Companies API
  server.registerTool(
    "list_companies",
    {
      title: "List companies",
      description:
        "Paginate through all public or organization-specific companies.",
      inputSchema: LIST_COMPANIES_SCHEMA,
    },
    getCallback(
      LIST_COMPANIES_SCHEMA,
      "https://api.riskthinking.ai/v3/companies",
      apiKey,
    ),
  );
  server.registerTool(
    "search_companies",
    {
      title: "Search companies",
      description: "Search for companies by name, ISIN, ticker, or sector.",
      inputSchema: SEARCH_COMPANIES_SCHEMA,
    },
    getCallback(
      SEARCH_COMPANIES_SCHEMA,
      "https://api.riskthinking.ai/v3/companies/search",
      apiKey,
    ),
  );
  server.registerTool(
    "get_company",
    {
      title: "Get company details",
      description: "Retrieve details for a specific company by ID.",
      inputSchema: COMPANY_ID_SCHEMA,
    },
    getCallback(
      COMPANY_ID_SCHEMA,
      "https://api.riskthinking.ai/v3/companies/{company_id}",
      apiKey,
    ),
  );
  server.registerTool(
    "get_company_climate_scores",
    {
      title: "Get company climate scores",
      description: "Get aggregated physical risk analytics for a company.",
      inputSchema: COMPANY_SCORES_SCHEMA,
    },
    getCallback(
      COMPANY_SCORES_SCHEMA,
      "https://api.riskthinking.ai/v3/companies/{company_id}/climate/scores",
      apiKey,
    ),
  );
  server.registerTool(
    "get_company_assets",
    {
      title: "Get company assets",
      description:
        "Paginate through physical assets owned by a specific company.",
      inputSchema: COMPANY_ASSETS_SCHEMA,
    },
    getCallback(
      COMPANY_ASSETS_SCHEMA,
      "https://api.riskthinking.ai/v3/companies/{company_id}/assets",
      apiKey,
    ),
  );
  server.registerTool(
    "get_company_subsidiaries",
    {
      title: "Get company subsidiaries",
      description: "Retrieve list of subsidiaries for a company.",
      inputSchema: COMPANY_ID_SCHEMA,
    },
    getCallback(
      COMPANY_ID_SCHEMA,
      "https://api.riskthinking.ai/v3/companies/{company_id}/subsidiaries",
      apiKey,
    ),
  );
  server.registerTool(
    "get_company_geo_clusters",
    {
      title: "Get company geo clusters",
      description:
        "Get clustered asset locations for geospatial mapping at a specific zoom level.",
      inputSchema: COMPANY_CLUSTERS_SCHEMA,
    },
    getCallback(
      COMPANY_CLUSTERS_SCHEMA,
      "https://api.riskthinking.ai/v3/companies/{company_id}/geo/clusters",
      apiKey,
    ),
  );

  // Markets/Indices API
  server.registerTool(
    "list_market_groups",
    {
      title: "List market groups",
      description: "Paginate through market index groups.",
      inputSchema: PAGINATION_SCHEMA,
    },
    getCallback(
      PAGINATION_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/groups",
      apiKey,
    ),
  );
  server.registerTool(
    "get_market_group",
    {
      title: "Get market group",
      description: "Get details of a specific market index group.",
      inputSchema: GROUP_ID_SCHEMA,
    },
    getCallback(
      GROUP_ID_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/groups/{group_id}",
      apiKey,
    ),
  );
  server.registerTool(
    "search_market_groups",
    {
      title: "Search market groups",
      description: "Search for market index groups by name.",
      inputSchema: SEARCH_MARKET_GROUPS_SCHEMA,
    },
    getCallback(
      SEARCH_MARKET_GROUPS_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/groups/search",
      apiKey,
    ),
  );
  server.registerTool(
    "list_market_group_constituents",
    {
      title: "List market group constituents",
      description:
        "Get the list of market indexes that belong to a specific group.",
      inputSchema: LIST_GROUP_CONSTITUENTS_SCHEMA,
    },
    getCallback(
      LIST_GROUP_CONSTITUENTS_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/groups/{group_id}/constituents",
      apiKey,
    ),
  );
  server.registerTool(
    "list_market_indexes",
    {
      title: "List market indexes",
      description: "Paginate through all market indexes.",
      inputSchema: PAGINATION_SCHEMA,
    },
    getCallback(
      PAGINATION_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes",
      apiKey,
    ),
  );
  server.registerTool(
    "get_market_index",
    {
      title: "Get market index",
      description: "Get details of a specific market index.",
      inputSchema: INDEX_ID_SCHEMA,
    },
    getCallback(
      INDEX_ID_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}",
      apiKey,
    ),
  );
  server.registerTool(
    "search_market_indexes",
    {
      title: "Search market indexes",
      description: "Search for market indexes by name.",
      inputSchema: SEARCH_MARKET_INDEXES_SCHEMA,
    },
    getCallback(
      SEARCH_MARKET_INDEXES_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/search",
      apiKey,
    ),
  );
  server.registerTool(
    "list_market_index_companies",
    {
      title: "List market index companies",
      description: "Paginate through companies within a specific market index.",
      inputSchema: INDEX_COMPANIES_SCHEMA,
    },
    getCallback(
      INDEX_COMPANIES_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}/companies",
      apiKey,
    ),
  );
  server.registerTool(
    "list_market_index_assets",
    {
      title: "List market index assets",
      description:
        "Paginate through physical assets owned by companies in a market index.",
      inputSchema: INDEX_ASSETS_SCHEMA,
    },
    getCallback(
      INDEX_ASSETS_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}/assets",
      apiKey,
    ),
  );
  server.registerTool(
    "get_market_index_climate_scores",
    {
      title: "Get market index climate scores",
      description:
        "Get the aggregated physical risk score for the entire market index.",
      inputSchema: INDEX_SCORES_SCHEMA,
    },
    getCallback(
      INDEX_SCORES_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}/climate/scores",
      apiKey,
    ),
  );
  server.registerTool(
    "get_market_index_companies_climate_scores",
    {
      title: "Get market index companies climate scores",
      description:
        "Get physical risk scores for each company within the market index.",
      inputSchema: INDEX_COMPANIES_SCORES_SCHEMA,
    },
    getCallback(
      INDEX_COMPANIES_SCORES_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}/companies/climate/scores",
      apiKey,
    ),
  );
  server.registerTool(
    "get_market_index_assets_climate_scores",
    {
      title: "Get market index assets climate scores",
      description:
        "Get physical risk scores for individual assets within the market index.",
      inputSchema: INDEX_ASSETS_SCORES_SCHEMA,
    },
    getCallback(
      INDEX_ASSETS_SCORES_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}/assets/climate/scores",
      apiKey,
    ),
  );
  server.registerTool(
    "get_market_index_geo_clusters",
    {
      title: "Get market index geo clusters",
      description:
        "Get clustered asset locations for the market index for geospatial mapping.",
      inputSchema: INDEX_CLUSTERS_SCHEMA,
    },
    getCallback(
      INDEX_CLUSTERS_SCHEMA,
      "https://api.riskthinking.ai/v3/markets/indexes/{index_id}/geo/clusters",
      apiKey,
    ),
  );

  return server;
};

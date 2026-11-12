import type { z } from "zod";
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

export const API_BASE_URL = "https://api.riskthinking.ai";

/** One CDT Express API operation exposed as a tool. */
export type ApiTool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  /** Path under API_BASE_URL; {name} placeholders are filled from the input. */
  path: string;
  /** Fetch every page (up to a bound) and return CSV instead of one JSON page. */
  fetchAll?: boolean;
};

// Single source of truth for the API-backed tools. The MCP server, published
// tool metadata, and the UTCP manual are all generated from this table.
export const API_TOOLS: readonly ApiTool[] = [
  {
    name: "get_climate_metrics_exposure",
    title: "Get exposure metrics for a location",
    description:
      "Returns raw meteorological hazard statistics (e.g., days of extreme heat, flood depth). Use this when asked about weather, temperature, or physical phenomena.",
    input: METRICS_SCHEMA,
    path: "/v4/climate/metrics/exposure",
  },
  {
    name: "get_climate_metrics_impact",
    title: "Get impact metrics for a location",
    description:
      "Returns financial damage estimates. Use this when asked about financial risk, damage costs, or expected financial impact.",
    input: METRICS_SCHEMA,
    path: "/v4/climate/metrics/impact",
  },
  {
    name: "get_climate_metrics_probability_adjusted_impact",
    title: "Get probability-adjusted impact metrics",
    description:
      "Returns impact metrics with probability-adjusted return periods.",
    input: METRICS_SCHEMA,
    path: "/v4/climate/metrics/probability_adjusted_impact",
  },
  {
    name: "get_climate_distribution_exposure",
    title: "Get exposure distribution for a location",
    description:
      "Returns the full exposure distribution (quantile values) for a single risk factor.",
    input: DISTRIBUTION_SCHEMA,
    path: "/v4/climate/distribution/exposure",
  },
  {
    name: "get_climate_distribution_impact",
    title: "Get impact distribution for a location",
    description:
      "Returns the full impact distribution (quantile values) for a single risk factor.",
    input: DISTRIBUTION_SCHEMA,
    path: "/v4/climate/distribution/impact",
  },
  {
    name: "list_assets",
    title: "List physical assets",
    description:
      "Paginate through physical asset data with optional filters for country and asset type.",
    input: LIST_ASSETS_SCHEMA,
    path: "/v3/assets",
  },
  {
    name: "list_all_assets",
    title: "List all physical assets",
    description:
      "List all physical assets exhaustively with optional filters for country and asset type. Response is a CSV with header row and value rows.",
    input: LIST_ASSETS_SCHEMA,
    path: "/v3/assets",
    fetchAll: true,
  },
  {
    name: "get_asset",
    title: "Get asset details",
    description:
      "Retrieve details for a specific physical asset by ID.",
    input: ASSET_ID_SCHEMA,
    path: "/v3/assets/{asset_id}",
  },
  {
    name: "search_assets",
    title: "Search assets",
    description:
      "Search for assets by name/address within a specific scope (public, organization, or company).",
    input: SEARCH_ASSETS_SCHEMA,
    path: "/v3/assets/search",
  },
  {
    name: "get_asset_climate_scores",
    title: "Get asset climate risk scores",
    description:
      "Retrieve physical risk analytics (scores) for a specific asset.",
    input: ASSET_SCORES_SCHEMA,
    path: "/v3/assets/{asset_id}/climate/scores",
  },
  {
    name: "list_companies",
    title: "List companies",
    description:
      "Paginate through all public or organization-specific companies.",
    input: LIST_COMPANIES_SCHEMA,
    path: "/v3/companies",
  },
  {
    name: "list_all_companies",
    title: "List all companies",
    description:
      "List all public or organization-specific companies across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: LIST_COMPANIES_SCHEMA,
    path: "/v3/companies",
    fetchAll: true,
  },
  {
    name: "search_companies",
    title: "Search companies",
    description:
      "Search for companies by name, ISIN, ticker, or sector.",
    input: SEARCH_COMPANIES_SCHEMA,
    path: "/v3/companies/search",
  },
  {
    name: "get_company",
    title: "Get company details",
    description:
      "Retrieve details for a specific company by ID.",
    input: COMPANY_ID_SCHEMA,
    path: "/v3/companies/{company_id}",
  },
  {
    name: "get_company_climate_scores",
    title: "Get company climate scores",
    description:
      "Get aggregated physical risk analytics for a company.",
    input: COMPANY_SCORES_SCHEMA,
    path: "/v3/companies/{company_id}/climate/scores",
  },
  {
    name: "get_company_assets",
    title: "Get company assets",
    description:
      "Paginate through physical assets owned by a specific company.",
    input: COMPANY_ASSETS_SCHEMA,
    path: "/v3/companies/{company_id}/assets",
  },
  {
    name: "get_all_company_assets",
    title: "Get all company assets",
    description:
      "List all physical assets owned by a specific company across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: COMPANY_ASSETS_SCHEMA,
    path: "/v3/companies/{company_id}/assets",
    fetchAll: true,
  },
  {
    name: "get_company_subsidiaries",
    title: "Get company subsidiaries",
    description:
      "Retrieve list of subsidiaries for a company.",
    input: COMPANY_ID_SCHEMA,
    path: "/v3/companies/{company_id}/subsidiaries",
  },
  {
    name: "get_company_geo_clusters",
    title: "Get company geo clusters",
    description:
      "Get clustered asset locations for geospatial mapping at a specific zoom level.",
    input: COMPANY_CLUSTERS_SCHEMA,
    path: "/v3/companies/{company_id}/geo/clusters",
  },
  {
    name: "list_market_groups",
    title: "List market groups",
    description:
      "Paginate through market index groups.",
    input: PAGINATION_SCHEMA,
    path: "/v3/markets/groups",
  },
  {
    name: "list_all_market_groups",
    title: "List all market groups",
    description:
      "List all market index groups across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: PAGINATION_SCHEMA,
    path: "/v3/markets/groups",
    fetchAll: true,
  },
  {
    name: "get_market_group",
    title: "Get market group",
    description:
      "Get details of a specific market index group.",
    input: GROUP_ID_SCHEMA,
    path: "/v3/markets/groups/{group_id}",
  },
  {
    name: "search_market_groups",
    title: "Search market groups",
    description:
      "Search for market index groups by name.",
    input: SEARCH_MARKET_GROUPS_SCHEMA,
    path: "/v3/markets/groups/search",
  },
  {
    name: "list_market_group_constituents",
    title: "List market group constituents",
    description:
      "Get the list of market indexes that belong to a specific group.",
    input: LIST_GROUP_CONSTITUENTS_SCHEMA,
    path: "/v3/markets/groups/{group_id}/constituents",
  },
  {
    name: "list_all_market_group_constituents",
    title: "List all market group constituents",
    description:
      "List all market indexes that belong to a specific group across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: LIST_GROUP_CONSTITUENTS_SCHEMA,
    path: "/v3/markets/groups/{group_id}/constituents",
    fetchAll: true,
  },
  {
    name: "list_market_indexes",
    title: "List market indexes",
    description:
      "Paginate through all market indexes.",
    input: PAGINATION_SCHEMA,
    path: "/v3/markets/indexes",
  },
  {
    name: "list_all_market_indexes",
    title: "List all market indexes",
    description:
      "List all market indexes across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: PAGINATION_SCHEMA,
    path: "/v3/markets/indexes",
    fetchAll: true,
  },
  {
    name: "get_market_index",
    title: "Get market index",
    description:
      "Get details of a specific market index.",
    input: INDEX_ID_SCHEMA,
    path: "/v3/markets/indexes/{index_id}",
  },
  {
    name: "search_market_indexes",
    title: "Search market indexes",
    description:
      "Search for market indexes by name.",
    input: SEARCH_MARKET_INDEXES_SCHEMA,
    path: "/v3/markets/indexes/search",
  },
  {
    name: "list_market_index_companies",
    title: "List market index companies",
    description:
      "Paginate through companies within a specific market index.",
    input: INDEX_COMPANIES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/companies",
  },
  {
    name: "list_all_market_index_companies",
    title: "List all market index companies",
    description:
      "List all companies within a specific market index across up to 30 pages. Prefer the paginated tool for small samples.",
    input: INDEX_COMPANIES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/companies",
    fetchAll: true,
  },
  {
    name: "list_market_index_assets",
    title: "List market index assets",
    description:
      "Paginate through physical assets owned by companies in a market index.",
    input: INDEX_ASSETS_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/assets",
  },
  {
    name: "list_all_market_index_assets",
    title: "List all market index assets",
    description:
      "List all physical assets owned by companies in a market index across up to 30 pages. Prefer the paginated tool for small samples.",
    input: INDEX_ASSETS_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/assets",
    fetchAll: true,
  },
  {
    name: "get_market_index_climate_scores",
    title: "Get market index climate scores",
    description:
      "Get the aggregated physical risk score for the entire market index.",
    input: INDEX_SCORES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/climate/scores",
  },
  {
    name: "get_market_index_companies_climate_scores",
    title: "Get market index companies climate scores",
    description:
      "Get physical risk scores for companies within an index. Supports pagination and sorting (e.g., sort_by a specific metric like 'expected_impact' descending to instantly find the highest risk entities).",
    input: INDEX_COMPANIES_SCORES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/companies/climate/scores",
  },
  {
    name: "get_all_market_index_companies_climate_scores",
    title: "Get all market index companies climate scores",
    description:
      "Get all physical risk scores for each company within the market index across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: INDEX_COMPANIES_SCORES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/companies/climate/scores",
    fetchAll: true,
  },
  {
    name: "get_market_index_assets_climate_scores",
    title: "Get market index assets climate scores",
    description:
      "Get physical risk scores for individual assets within an index. Use sort_by (e.g., 'expected_impact' descending) and limit to quickly find the most vulnerable assets without exhaustive fetching.",
    input: INDEX_ASSETS_SCORES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/assets/climate/scores",
  },
  {
    name: "get_all_market_index_assets_climate_scores",
    title: "Get all market index assets climate scores",
    description:
      "Get all physical risk scores for individual assets within the market index across up to 30 pages. Prefer the paginated tool for small samples. Response is a CSV with header row and value rows.",
    input: INDEX_ASSETS_SCORES_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/assets/climate/scores",
    fetchAll: true,
  },
  {
    name: "get_market_index_geo_clusters",
    title: "Get market index geo clusters",
    description:
      "Get clustered asset locations for the market index for geospatial mapping.",
    input: INDEX_CLUSTERS_SCHEMA,
    path: "/v3/markets/indexes/{index_id}/geo/clusters",
  },
];

import { z } from "zod";
import {
  HORIZONS,
  METRICS,
  PATHWAYS,
  RISK_FACTORS,
  STATISTICS,
} from "./constants.js";

export const PAGINATION_SCHEMA = z.object({
  cursor: z.string().optional().describe("Pagination cursor"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of results (1-100)"),
});

const GEO_POINT_SCHEMA = z.object({
  latitude: z.number().min(-90).max(90).describe("Latitude"),
  longitude: z.number().min(-180).max(180).describe("Longitude"),
});

const ENTITY_FILTER_SCHEMA = z.object({
  country: z
    .string()
    .length(3)
    .optional()
    .describe("ISO 3166-1 alpha-3 country code"),
  state: z.string().optional().describe("State or region"),
  asset_type: z.string().optional().describe("Physical asset type"),
  sector: z.string().optional().describe("GICS sector"),
});

const CLIMATE_PARAMS_SCHEMA = z.object({
  risk: z.enum(["physical", "transition"]).default("physical").optional(),
  pathway: z
    .enum(PATHWAYS)
    .optional()
    .describe("Climate pathway (e.g. 'ssp245', '<2 degrees')"),
  horizon: z
    .enum(HORIZONS)
    .optional()
    .describe("Horizon year (e.g. 2030, 2050)"),
  metric: z
    .array(z.enum(METRICS))
    .default([METRICS[0]])
    .optional()
    .describe(
      "Metrics to include in the response. For definitions, refer to resource: file:///glossary/metrics",
    ),
});

const createSortSchema = (allowedFields: [string, ...string[]]) =>
  z.object({
    sort_by: z.enum(allowedFields).optional(),
    sort_direction: z
      .enum(["ascending", "descending"])
      .default("descending")
      .optional(),
  });

const CLUSTER_PARAMS_SCHEMA = z.object({
  zoom: z
    .number()
    .int()
    .min(0)
    .max(22)
    .describe("Map zoom level (0-22). REQUIRED."),
  bbox: z
    .string()
    .optional()
    .describe("Bounding box: 'min_lon,min_lat,max_lon,max_lat'"),
  radius: z.string().optional().describe("Cluster radius"),
});

export const ASSET_ID_SCHEMA = z.object({
  asset_id: z.uuid().describe("Unique Asset UUID"),
});
export const COMPANY_ID_SCHEMA = z.object({
  company_id: z.uuid().describe("Unique Company UUID"),
});
export const GROUP_ID_SCHEMA = z.object({
  group_id: z.uuid().describe("Market Index Group UUID"),
});
export const INDEX_ID_SCHEMA = z.object({
  index_id: z.uuid().describe("Market Index UUID"),
});

// Climate Metrics API
export const METRICS_SCHEMA = GEO_POINT_SCHEMA.extend({
  risk_factors: z
    .array(z.enum(RISK_FACTORS))
    .optional()
    .describe("Risk factors (e.g. 'fwi')"),
  pathway: z.array(z.enum(PATHWAYS)).optional(),
  horizon: z.array(z.enum(HORIZONS)).optional(),
  percentiles: z
    .array(z.number().min(1).max(100))
    .optional()
    .describe("Defaults: 50, 75, 90, 95, 99"),
  statistics: z
    .array(z.enum(STATISTICS))
    .optional()
    .describe("Defaults: min, max, mean"),
  return_periods: z
    .array(z.number().min(1).max(1000))
    .optional()
    .describe("Defaults: 2, 5, 10, 20, 100"),
}).superRefine((data, ctx) => {
  if (!data.pathway?.length && !data.horizon?.length) {
    ctx.addIssue({
      code: "custom",
      message: "At least one of 'pathway' or 'horizon' must be provided.",
      path: ["pathway", "horizon"],
    });
  }
});

export const DISTRIBUTION_SCHEMA = GEO_POINT_SCHEMA.extend({
  risk_factor: z.enum(RISK_FACTORS),
  pathway: z.enum(PATHWAYS),
  horizon: z.enum(HORIZONS),
});

// Physical Assets API
export const LIST_ASSETS_SCHEMA = PAGINATION_SCHEMA.extend(
  ENTITY_FILTER_SCHEMA.shape,
);

export const SEARCH_ASSETS_SCHEMA = z
  .object({
    scope: z.enum(["public", "organization", "company"]).optional(),
    company_id: z.uuid().optional(),
    query: z.string().optional().describe("Search term for name or address"),
  })
  .refine((data) => !(data.scope === "company" && !data.company_id), {
    message: "company_id is required when scope is 'company'",
    path: ["company_id"],
  });

export const ASSET_SCORES_SCHEMA = ASSET_ID_SCHEMA.extend(
  CLIMATE_PARAMS_SCHEMA.shape,
);

// Companies API
export const LIST_COMPANIES_SCHEMA = PAGINATION_SCHEMA.extend(
  createSortSchema(["created_at", "name", "sector"]).shape,
).extend({
  scope: z.enum(["public", "organization"]).optional(),
});

export const SEARCH_COMPANIES_SCHEMA = z.object({
  limit: z.number().min(1).max(100).optional(),
  name: z.string().optional(),
  isin_code: z.string().optional(),
  stock_ticker: z.string().optional(),
  sector: z.string().optional(),
  method: z.enum(["fuzzy", "strict"]).default("strict").optional(),
});

export const COMPANY_SCORES_SCHEMA = COMPANY_ID_SCHEMA.extend(
  CLIMATE_PARAMS_SCHEMA.shape,
).extend(ENTITY_FILTER_SCHEMA.shape);

export const COMPANY_ASSETS_SCHEMA = COMPANY_ID_SCHEMA.extend(
  PAGINATION_SCHEMA.shape,
)
  .extend(ENTITY_FILTER_SCHEMA.shape)
  .extend(
    createSortSchema([
      "asset_type",
      "country",
      "state",
      "address",
      "city",
      "latitude",
      "longitude",
    ]).shape,
  );

export const COMPANY_CLUSTERS_SCHEMA = COMPANY_ID_SCHEMA.extend(
  CLUSTER_PARAMS_SCHEMA.shape,
).extend(ENTITY_FILTER_SCHEMA.shape);

// Markets/Indices API
export const SEARCH_MARKET_GROUPS_SCHEMA = z.object({
  limit: z.number().min(1).max(100).optional(),
  name: z.string().optional(),
});

export const LIST_GROUP_CONSTITUENTS_SCHEMA = GROUP_ID_SCHEMA.extend(
  PAGINATION_SCHEMA.shape,
);

export const SEARCH_MARKET_INDEXES_SCHEMA = z.object({
  limit: z.number().min(1).max(100).optional(),
  name: z.string().optional(),
});

export const INDEX_COMPANIES_SCHEMA = INDEX_ID_SCHEMA.extend(
  PAGINATION_SCHEMA.shape,
)
  .extend(createSortSchema(["company_name", "sector"]).shape)
  .extend({ sector: z.string().optional() });

export const INDEX_ASSETS_SCHEMA = INDEX_ID_SCHEMA.extend(
  PAGINATION_SCHEMA.shape,
)
  .extend(ENTITY_FILTER_SCHEMA.shape)
  .extend(createSortSchema(["asset_type", "country", "state"]).shape);

const INDEX_ANALYTICS_BASE = INDEX_ID_SCHEMA.extend(
  CLIMATE_PARAMS_SCHEMA.shape,
).extend(ENTITY_FILTER_SCHEMA.shape);

export const INDEX_SCORES_SCHEMA = INDEX_ANALYTICS_BASE;

export const INDEX_COMPANIES_SCORES_SCHEMA = INDEX_ANALYTICS_BASE.extend(
  PAGINATION_SCHEMA.shape,
)
  .extend(
    createSortSchema([
      "id",
      "asset_count",
      "sector",
      "company_name",
      ...METRICS,
    ]).shape,
  )
  .extend({
    min_risk: z.number().optional(),
    max_risk: z.number().optional(),
  });

export const INDEX_ASSETS_SCORES_SCHEMA = INDEX_ANALYTICS_BASE.extend(
  PAGINATION_SCHEMA.shape,
)
  .extend(
    createSortSchema(["id", "asset_type", "country", "state", ...METRICS])
      .shape,
  )
  .extend({
    min_risk: z.number().optional(),
    max_risk: z.number().optional(),
  });

export const INDEX_CLUSTERS_SCHEMA = INDEX_ID_SCHEMA.extend(
  CLUSTER_PARAMS_SCHEMA.shape,
).extend(ENTITY_FILTER_SCHEMA.shape);

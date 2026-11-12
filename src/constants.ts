export const SERVER_VERSION = "0.8.0";

// Public identity shared by the MCP handshake, the HTTP landing page, and
// server.json. Keep these values aligned with server.json (checked in tests).
export const SERVER_TITLE = "CDT Express by Riskthinking.AI";
export const SERVER_DESCRIPTION =
  "Climate hazard exposure and impact metrics for any location, plus climate risk scores for physical assets, companies, and market indexes, from Riskthinking.AI's Climate Digital Twin.";
// Product page: what CDT Express is, sign-up, and where to get an API key.
export const WEBSITE_URL = "https://velo.riskthinking.ai/cdt-express";
export const PUBLIC_ORIGIN = "https://mcp.riskthinking.ai";
export const ICONS = [
  {
    src: `${PUBLIC_ORIGIN}/icon-192.png`,
    mimeType: "image/png",
    sizes: ["192x192"],
  },
  {
    src: `${PUBLIC_ORIGIN}/icon-512.png`,
    mimeType: "image/png",
    sizes: ["512x512"],
  },
];

// Sent to clients during initialize. Agents read this before choosing tools,
// so it describes workflows and conventions rather than individual tools.
export const SERVER_INSTRUCTIONS = `CDT Express provides physical climate risk data from Riskthinking.AI's Climate Digital Twin. All tools are read-only.

Typical workflows:
- A place: call get_climate_metrics_exposure (hazard levels) or get_climate_metrics_impact (asset damage) with latitude, longitude, risk_factors, and at least one pathway or horizon. Use the distribution tools for the full range of outcomes of one hazard.
- A company: search_companies, then use the returned id with get_company_climate_scores, get_company_assets, or get_company_geo_clusters.
- A market index: search_market_indexes, then get_market_index_climate_scores or get_market_index_companies_climate_scores to rank constituents.

Conventions:
- pathway is an emissions scenario such as ssp245 (middle of the road) or ssp585 (high emissions); horizon is a year from 2010 (baseline) to 2100.
- Country filters use ISO 3166-1 alpha-3 codes, such as USA, CAN, or GBR.
- Scores default to dcr_score. Request expected_impact or cvar_95 explicitly for financial damage. Call get_metrics_definition before explaining a metric.
- Prefer paginated tools with a small limit. Use list_all_* and get_all_* tools only when the full set is needed; they can be large and consume API quota.

Results depend on the user's CDT Express access. Sign-up and API keys: ${WEBSITE_URL}`;

export const RISK_FACTORS: readonly string[] = [
  "cyclone",
  "fwi",
  "hot_days",
  "rx1day",
  "frost_days",
  "daily_freezethaw_cycles",
  "wind_max_daily_max",
  "cflood",
  "rflood",
  "spei",
  "dc",
  "dmc",
  "ffmc",
  "isi",
  "bui",
  "rx5day",
  "wind_max_daily_mean",
  "cooling_degree_days",
  "tg_max",
  "tg_mean",
  "tg_min",
  "tx_max",
  "tx_mean",
  "tx_min",
  "tn_max",
  "tn_mean",
  "tn_min",
  "sdii",
  "liquidprcptot",
  "solidprcptot",
  "prcptot",
  "pet",
  "water_budget",
  "dtrmax",
  "dtrvar",
  "etr",
  "calm_days",
  "corn_heat_units",
  "wbgt",
  "windchill",
  "heat_index",
  "heat_wave_frequency",
  "heat_wave_total_length",
  "heat_wave_max_length",
  "heat_wave_index",
  "hot_spell_frequency",
  "hot_spell_max_length",
  "maximum_consecutive_frost_days",
  "cold_spell_days",
  "cold_spell_frequency",
  "maximum_consecutive_wet_days",
  "maximum_consecutive_dry_days",
  "at",
  "summer_days",
  "tropical_nights",
  "inundation",
  "humidex",
  "heating_degree_days",
  "growing_degree_days",
  "ice_days",
  "dry_days",
  "wet_days",
  "dtr",
];
export const PATHWAYS: readonly string[] = [
  "SV",
  "historic",
  "ssp126",
  "ssp245",
  "ssp370",
  "ssp585",
  "ssp434",
  "ssp119",
  "ssp460",
  "<2 degrees",
  "2-3 degrees",
  "3-4 degrees",
  ">4 degrees",
];
export const HORIZONS: readonly string[] = [
  "2010",
  "2025",
  "2030",
  "2035",
  "2040",
  "2045",
  "2050",
  "2055",
  "2060",
  "2065",
  "2070",
  "2075",
  "2080",
  "2085",
  "2090",
  "2095",
  "2100",
];
export const STATISTICS: readonly string[] = [
  "minimum",
  "maximum",
  "mean",
  "stddev",
  "cvar_95",
];
export const METRICS = [
  "dcr_score",
  "expected_impact",
  "cvar_50",
  "cvar_95",
  "cvar_99",
  "var_50",
  "var_95",
  "var_99",
];

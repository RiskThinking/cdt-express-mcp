import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const apiKey = process.env.CDT_API_KEY || process.argv[2];
if (!apiKey) {
  console.error("DTO: Error - CDT_API_KEY is missing!");
  process.exit(1);
}

const RISK_FACTORS = [
  "cyclone", "fwi", "hot_days", "rx1day", "frost_days",
  "daily_freezethaw_cycles", "wind_max_daily_max", "cflood", "rflood",
  "spei", "dc", "dmc", "ffmc", "isi", "bui", "rx5day",
  "wind_max_daily_mean", "cooling_degree_days", "tg_max", "tg_mean",
  "tg_min", "tx_max", "tx_mean", "tx_min", "tn_max", "tn_mean",
  "tn_min", "sdii", "liquidprcptot", "solidprcptot", "prcptot",
  "pet", "water_budget", "dtrmax", "dtrvar", "etr", "calm_days",
  "corn_heat_units", "wbgt", "windchill", "heat_index",
  "heat_wave_frequency", "heat_wave_total_length", "heat_wave_max_length",
  "heat_wave_index", "hot_spell_frequency", "hot_spell_max_length",
  "maximum_consecutive_frost_days", "cold_spell_days",
  "cold_spell_frequency", "maximum_consecutive_wet_days",
  "maximum_consecutive_dry_days", "at", "summer_days",
  "tropical_nights", "inundation", "humidex", "heating_degree_days",
  "growing_degree_days", "ice_days", "dry_days", "wet_days", "dtr"
];
const PATHWAYS = [
  "SV", "historic",
  "ssp126", "ssp245", "ssp370", "ssp585", "ssp434", "ssp119", "ssp460",
  "<2 degrees", "2-3 degrees", "3-4 degrees", ">4 degrees"
];
const HORIZONS = [
  "2010", "2025", "2030", "2035", "2040", "2045", "2050", "2055", "2060",
  "2065", "2070", "2075", "2080", "2085", "2090", "2095", "2100",
];

async function main() {
  const server = new McpServer({
    name: "CDTexpress CLI",
    version: "1.0.0",
  });

  // TODO: update to use .registerTool
  server.tool(
    "get_climate_exposure",
    "Get climate exposure metrics for a location.",
    {
      latitude: z.number().min(-90).max(90).describe("Latitude"),
      longitude: z.number().min(-180).max(180).describe("Longitude"),
      risk_factors: z.array(z.enum(RISK_FACTORS)).optional().describe("Risk factors (e.g. 'fwi,hot_days')"),
      pathway: z.array(z.enum(PATHWAYS)).optional().describe("Climate pathway (e.g. 'ssp245'), REQUIRED if 'horizon' is not provided."),
      horizon: z.array(z.enum(HORIZONS)).optional().describe("Horizon years (e.g. '2050'), REQUIRED if 'pathway' is not provided."),
    },
    async ({ latitude, longitude, risk_factors, pathway, horizon }) => {
      if (!pathway && !horizon) {
        return {
          content: [{ type: "text", text: "Error: either 'pathway' or 'horizon' is required." }],
          isError: true,
        };
      }

      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
      });
      if (risk_factors) {
        params.append("risk_factor", risk_factors.join(","));
      }
      if (pathway) {
        params.append("pathway", pathway.join(","));
      }
      if (horizon) {
        params.append("horizon", horizon.join(","));
      }

      try {
        const response = await fetch(
          `https://api.riskthinking.ai/v4/climate/metrics/exposure?${params.toString()}`,
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Accept": "application/json",
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [{
              type: "text",
              text: `API Error ${response.status}: ${errorText}`
            }],
            isError: true,
          };
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Fetch failed: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("DTO: Fatal Error in main:", err);
  process.exit(1);
});

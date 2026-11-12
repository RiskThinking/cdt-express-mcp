// Live checks against the real CDT Express API. Skipped unless
// CDT_LIVE_API_KEY is set; they use a small amount of API quota.
//
//   CDT_LIVE_API_KEY=... npm run test:live

import assert from "node:assert/strict";
import test from "node:test";
import "@utcp/http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { UtcpClient } from "@utcp/sdk";
import { getServer } from "../build/server.js";
import { startMcp } from "./helpers.js";

const apiKey = process.env.CDT_LIVE_API_KEY;
const skip = apiKey ? false : "set CDT_LIVE_API_KEY to run live API checks";
const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

const connect = async (t) => {
  const server = getServer(apiKey);
  const client = new Client({ name: "live-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  // The SDK client validates structuredContent against each outputSchema.
  return async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, `${name}: ${result.content?.[0]?.text}`);
    return result;
  };
};

test("MCP tools return valid structured results from the live API", { skip }, async (t) => {
  const call = await connect(t);

  const exposure = await call("get_climate_metrics_exposure", {
    ...TORONTO,
    risk_factors: ["hot_days", "rx1day"],
    pathway: ["ssp245", "ssp585"],
    horizon: ["2050"],
  });
  const exposureRows = exposure.structuredContent.results;
  assert.deepEqual(
    [...new Set(exposureRows.map((row) => row.index_name))].sort(),
    ["hot_days", "rx1day"],
  );
  assert.deepEqual(
    [...new Set(exposureRows.map((row) => row.pathway))].sort(),
    ["ssp245", "ssp585"],
  );

  await call("get_climate_metrics_impact", {
    ...TORONTO,
    risk_factors: ["hot_days"],
    horizon: ["2050"],
  });
  const distribution = await call("get_climate_distribution_exposure", {
    ...TORONTO,
    risk_factor: "hot_days",
    pathway: "ssp245",
    horizon: "2050",
  });
  assert.ok(distribution.structuredContent.results[0].distribution.length > 0);

  const search = await call("search_companies", {
    name: "Microsoft",
    limit: 1,
  });
  const company = search.structuredContent.results[0];
  assert.match(company.name, /Microsoft/);
  const details = await call("get_company", { company_id: company.id });
  assert.equal(details.structuredContent.id, company.id);
  const scores = await call("get_company_climate_scores", {
    company_id: company.id,
    pathway: "ssp585",
    horizon: "2050",
    metric: ["expected_impact", "cvar_95"],
  });
  assert.ok(Object.keys(scores.structuredContent).length > 0);

  const page = await call("list_assets", { limit: 2 });
  assert.equal(page.structuredContent.results.length, 2);
  assert.ok(page.structuredContent.pagination.cursor);
  const next = await call("list_assets", {
    limit: 2,
    cursor: page.structuredContent.pagination.cursor,
  });
  assert.notEqual(
    next.structuredContent.results[0].id,
    page.structuredContent.results[0].id,
  );

  const indexes = await call("search_market_indexes", { name: "Dow", limit: 1 });
  const index = indexes.structuredContent.results[0];
  assert.ok(index?.id, "a Dow index exists");
  const ranked = await call("get_market_index_companies_climate_scores", {
    index_id: index.id,
    pathway: "ssp585",
    horizon: "2050",
    metric: ["expected_impact"],
    sort_by: "expected_impact",
    limit: 3,
  });
  assert.ok(ranked.structuredContent.results.length > 0);
});

test("fetch_all and the deprecated alias merge every page from the live API", { skip }, async (t) => {
  const call = await connect(t);
  // Market indexes span several pages of 100.
  const merged = await call("list_market_indexes", { fetch_all: true });
  const { results, pages_fetched, truncated } = merged.structuredContent;
  assert.ok(pages_fetched >= 2, `pages_fetched=${pages_fetched}`);
  assert.ok(results.length > 100);
  assert.equal(new Set(results.map((row) => row.id)).size, results.length);
  assert.equal(typeof truncated, "boolean");
  assert.equal(merged.content.at(-1).text.split("\n").length, results.length + 1);
  const alias = await call("list_all_market_indexes");
  assert.equal(alias.structuredContent.results.length, results.length);
});

test("the UTCP manual works against the live API", { skip }, async (t) => {
  const { baseUrl } = await startMcp(t, {});
  const client = await UtcpClient.create(process.cwd(), {
    manual_call_templates: [
      {
        name: "cdtexpress",
        call_template_type: "http",
        http_method: "GET",
        url: `${baseUrl}/utcp`,
      },
    ],
    variables: { cdtexpress_CDT_API_KEY: apiKey },
  });
  t.after(() => client.close?.());

  const exposure = await client.callTool(
    "cdtexpress.get_climate_metrics_exposure",
    {
      ...TORONTO,
      risk_factor: "hot_days,rx1day",
      pathway: "ssp245",
      horizon: "2050",
    },
  );
  assert.deepEqual(
    [...new Set(exposure.results.map((row) => row.index_name))].sort(),
    ["hot_days", "rx1day"],
  );
  const search = await client.callTool("cdtexpress.search_companies", {
    name: "Microsoft",
    limit: 1,
  });
  assert.match(search.results[0].name, /Microsoft/);
  const scores = await client.callTool(
    "cdtexpress.get_company_climate_scores",
    {
      company_id: search.results[0].id,
      pathway: "ssp585",
      horizon: "2050",
      metric: "expected_impact,cvar_95",
    },
  );
  assert.ok(Object.keys(scores).length > 0);
});

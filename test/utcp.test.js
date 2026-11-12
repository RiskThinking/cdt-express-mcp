import assert from "node:assert/strict";
import test from "node:test";
import "@utcp/http";
import { UtcpClient, UtcpManualSerializer } from "@utcp/sdk";
import { buildUtcpManual } from "../build/catalog.js";
import { API_TOOLS } from "../build/tools.js";
import { startFakeApi, startMcp } from "./helpers.js";

test("the UTCP manual is valid and mirrors the API tools", () => {
  const manual = new UtcpManualSerializer().validateDict(buildUtcpManual());
  assert.equal(manual.tools.length, API_TOOLS.length + 1);
  const names = manual.tools.map((tool) => tool.name);
  for (const tool of API_TOOLS) assert.ok(names.includes(tool.name));
  assert.ok(!names.some((name) => /^(list|get)_all_/.test(name)));
  for (const tool of manual.tools) {
    const properties = Object.keys(tool.inputs.properties ?? {});
    assert.ok(!properties.includes("fetch_all"), tool.name);
    assert.ok(!properties.includes("risk_factors"), tool.name);
    for (const property of Object.values(tool.inputs.properties ?? {})) {
      assert.notEqual(property.type, "array", tool.name);
    }
    if (tool.name === "get_metrics_definition") {
      assert.equal(tool.tool_call_template.auth, undefined);
      continue;
    }
    assert.match(tool.description, /velo\.riskthinking\.ai\/cdt-express/);
    assert.match(tool.tool_call_template.url, /^https:\/\/api\.riskthinking\.ai\//);
    assert.deepEqual(tool.tool_call_template.auth, {
      auth_type: "api_key",
      api_key: "Bearer ${CDT_API_KEY}",
      var_name: "Authorization",
      location: "header",
    });
  }
});

test("a UTCP client discovers the manual and calls the API with its key", async (t) => {
  const api = await startFakeApi(t);
  const { baseUrl } = await startMcp(t, { CDT_API_BASE_URL: api.url });

  const response = await fetch(`${baseUrl}/utcp`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal((await fetch(`${baseUrl}/tools.json`)).status, 200);

  const client = await UtcpClient.create(process.cwd(), {
    manual_call_templates: [
      {
        name: "cdtexpress",
        call_template_type: "http",
        http_method: "GET",
        url: `${baseUrl}/utcp`,
      },
    ],
    // The TypeScript SDK namespaces variables by manual name.
    variables: { cdtexpress_CDT_API_KEY: "test-api-key" },
  });
  t.after(() => client.close?.());

  const tools = await client.getTools();
  assert.equal(tools.length, API_TOOLS.length + 1);

  const glossary = await client.callTool(
    "cdtexpress.get_metrics_definition",
    {},
  );
  assert.match(String(glossary), /METRICS GLOSSARY/);
  assert.equal(api.requests.length, 0, "the glossary needs no API call");

  const exposure = await client.callTool(
    "cdtexpress.get_climate_metrics_exposure",
    {
      latitude: 43.65,
      longitude: -79.38,
      risk_factor: "hot_days,rflood",
      horizon: "2050",
    },
  );
  assert.equal(exposure.results[0].risk_factor, "hot_days");
  const request = new URL(api.requests[0].url, api.url);
  assert.equal(request.pathname, "/v4/climate/metrics/exposure");
  assert.equal(request.searchParams.get("risk_factor"), "hot_days,rflood");
  assert.equal(request.searchParams.get("horizon"), "2050");
  assert.equal(api.requests[0].authorization, "Bearer test-api-key");

  await client.callTool("cdtexpress.get_company", {
    company_id: "dc06170e-8cd8-4194-a975-7624f3a8ee61",
  });
  assert.equal(
    new URL(api.requests[1].url, api.url).pathname,
    "/v3/companies/dc06170e-8cd8-4194-a975-7624f3a8ee61",
  );
});

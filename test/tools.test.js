import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getServer } from "../build/server.js";
import { getCallback, toCSV } from "../build/utils.js";
import { METRICS_SCHEMA, PAGINATION_SCHEMA } from "../build/schema.js";

test("every advertised tool has accurate directory annotations", async (t) => {
  const server = getServer("test-key");
  const client = new Client({ name: "directory-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const { tools } = await client.listTools();
  assert.ok(tools.length > 30);
  for (const tool of tools) {
    assert.ok(tool.title, tool.name);
    assert.ok(tool.name.length <= 64, tool.name);
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
    assert.equal(tool.annotations.destructiveHint, false, tool.name);
    assert.equal(tool.annotations.idempotentHint, true, tool.name);
    assert.equal(
      tool.annotations.openWorldHint,
      tool.name !== "get_metrics_definition",
      tool.name,
    );
  }
});

test("CSV preserves columns across rows and escapes carriage returns and headers", () => {
  assert.equal(
    toCSV([{ "a,b": "x\ry" }, { extra: '"z"' }]),
    '"a,b",extra\n"x\ry",\n,"""z"""',
  );
  assert.throws(() => toCSV([null]), /objects/);
});

test("invalid pagination is rejected before contacting the API", async () => {
  assert.equal(PAGINATION_SCHEMA.safeParse({ limit: 1.5 }).success, false);
  const result = await getCallback(
    PAGINATION_SCHEMA,
    "https://api.riskthinking.ai/v3/assets",
    "test-key",
  )({ limit: 1.5 });
  assert.equal(result.isError, true);
});

test("climate requests use the API hazard parameter and bounded, redirect-free fetches", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new URL(url).searchParams.get("risk_factor"),
      "hot_days,rflood",
    );
    assert.equal(new URL(url).searchParams.has("risk_factors"), false);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, "error");
    return Response.json({ results: [{ value: 1 }] });
  };
  const result = await getCallback(
    METRICS_SCHEMA,
    "https://api.riskthinking.ai/v4/climate/metrics/exposure",
    "test-key",
  )({
    latitude: 43.65,
    longitude: -79.38,
    horizon: ["2050"],
    risk_factors: ["hot_days", "rflood"],
  });
  assert.notEqual(result.isError, true);
});

test("upstream failures give actionable errors without disclosing bodies", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    new Response("secret-api-key and internal diagnostic", { status: 401 });
  const result = await getCallback(
    PAGINATION_SCHEMA,
    "https://api.riskthinking.ai/v3/assets",
    "test-key",
  )({});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /401.*Reconnect/);
  assert.doesNotMatch(
    result.content[0].text,
    /secret-api-key|internal diagnostic/,
  );
});

test("malformed upstream JSON cannot leak a response snippet", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    new Response("secret-api-key is not JSON", { status: 200 });
  const result = await getCallback(
    PAGINATION_SCHEMA,
    "https://api.riskthinking.ai/v3/assets",
    "test-key",
  )({});
  assert.equal(result.isError, true);
  assert.doesNotMatch(result.content[0].text, /secret-api-key/);
});

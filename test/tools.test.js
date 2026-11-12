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

test("initialize advertises identity and agent instructions aligned with server.json", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const constants = await import("../build/constants.js");
  const serverJson = JSON.parse(await readFile("server.json", "utf8"));
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

  const server = getServer("test-key");
  const client = new Client({ name: "identity-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const info = client.getServerVersion();
  assert.equal(info.title, serverJson.title);
  assert.equal(info.websiteUrl, serverJson.websiteUrl);
  assert.deepEqual(info.icons, serverJson.icons);
  assert.equal(manifest.homepage, serverJson.websiteUrl);
  assert.ok(serverJson.description.length <= 100);
  for (const icon of serverJson.icons) {
    assert.match(icon.src, /^https:\/\//);
    assert.ok(icon.src.length <= 255);
  }

  const instructions = client.getInstructions();
  assert.equal(instructions, constants.SERVER_INSTRUCTIONS);
  assert.ok(instructions.includes(serverJson.websiteUrl));
  // Every tool the instructions name must exist.
  const { tools } = await client.listTools();
  const names = new Set(tools.map((tool) => tool.name));
  for (const [name] of instructions.matchAll(/\b(?:get|list|search)_[a-z_]+\b/g)) {
    if (name.endsWith("_")) continue; // list_all_* / get_all_* wildcards
    assert.ok(names.has(name), `instructions mention unknown tool ${name}`);
  }
});

const connect = async (t) => {
  const server = getServer("test-key");
  const client = new Client({ name: "p2-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return client;
};

const mockFetch = (t, handler) => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(new URL(url));
    return handler(new URL(url), options, urls.length);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return urls;
};

test("paginated tools accept fetch_all and every all-pages alias is deprecated", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const paginated = tools.filter((tool) => tool.inputSchema.properties.fetch_all);
  assert.equal(paginated.length, 10);
  assert.equal(tools.length, 40);
  const aliases = tools.filter((tool) =>
    tool.description.startsWith("Deprecated:"),
  );
  assert.equal(aliases.length, 10);
  for (const alias of aliases) {
    const target = alias.description.match(/call (\w+) with fetch_all/)[1];
    assert.ok(byName.get(target)?.inputSchema.properties.fetch_all, target);
    assert.equal(alias.inputSchema.properties.fetch_all, undefined);
  }
  for (const tool of tools) {
    if (tool.name === "get_metrics_definition") continue;
    assert.equal(tool.outputSchema?.type, "object", tool.name);
  }
});

test("fetch_all merges pages into CSV with structured rows", async (t) => {
  const client = await connect(t);
  const urls = mockFetch(t, (url) =>
    Response.json(
      !url.searchParams.has("cursor")
        ? {
            results: [{ id: "a", name: "One" }],
            pagination: { cursor: "c1", count: 1, last_page: false },
          }
        : {
            results: [{ id: "b", name: "Two, Inc" }],
            pagination: { cursor: null, count: 1, last_page: true },
          },
    ),
  );
  const result = await client.callTool({
    name: "list_assets",
    arguments: { country: "CAN", fetch_all: true },
  });
  assert.notEqual(result.isError, true);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.has("fetch_all"), false);
  assert.equal(urls[0].searchParams.get("limit"), "100");
  assert.equal(urls[0].searchParams.get("country"), "CAN");
  assert.equal(urls[1].searchParams.get("cursor"), "c1");
  assert.equal(result.content[0].text, 'id,name\na,One\nb,"Two, Inc"');
  assert.deepEqual(result.structuredContent, {
    results: [
      { id: "a", name: "One" },
      { id: "b", name: "Two, Inc" },
    ],
    pages_fetched: 2,
    truncated: false,
  });

  // The deprecated alias behaves the same.
  const alias = await client.callTool({
    name: "list_all_assets",
    arguments: { country: "CAN" },
  });
  assert.equal(alias.content[0].text, result.content[0].text);
});

test("one page returns compact JSON text and matching structured content", async (t) => {
  const client = await connect(t);
  const page = {
    results: [{ id: "a" }],
    pagination: { cursor: "c1", count: 1, last_page: false },
  };
  const urls = mockFetch(t, () => Response.json(page));
  const result = await client.callTool({
    name: "list_assets",
    arguments: { limit: 1 },
  });
  assert.equal(urls[0].searchParams.get("limit"), "1");
  assert.equal(result.content[0].text, JSON.stringify(page));
  assert.deepEqual(result.structuredContent, page);
});

test("single records and unexpected shapes still satisfy the output schema", async (t) => {
  const client = await connect(t);
  const record = { id: "dc06170e-8cd8-4194-a975-7624f3a8ee61", name: "Co" };
  mockFetch(t, (url) =>
    url.pathname.endsWith("/subsidiaries")
      ? Response.json([{ id: "s" }])
      : Response.json(record),
  );
  const company = await client.callTool({
    name: "get_company",
    arguments: { company_id: record.id },
  });
  assert.notEqual(company.isError, true);
  assert.deepEqual(company.structuredContent, record);
  const subsidiaries = await client.callTool({
    name: "get_company_subsidiaries",
    arguments: { company_id: record.id },
  });
  assert.notEqual(subsidiaries.isError, true);
  assert.deepEqual(subsidiaries.structuredContent, { results: [{ id: "s" }] });
});

test("path parameters are URL-encoded", async (t) => {
  const { z } = await import("zod");
  const urls = mockFetch(t, () => Response.json({}));
  await getCallback(
    z.object({ id: z.string() }),
    "https://api.riskthinking.ai/v3/assets/{id}",
    "test-key",
  )({ id: "../companies?x=1" });
  assert.equal(urls[0].pathname, "/v3/assets/..%2Fcompanies%3Fx%3D1");
});

test("crc-docs skills are offered as prompts", async (t) => {
  const { SKILL_PROMPTS } = await import("../build/prompts.generated.js");
  const client = await connect(t);
  const { prompts } = await client.listPrompts();
  assert.deepEqual(
    prompts.map((prompt) => prompt.name).sort(),
    SKILL_PROMPTS.map((prompt) => prompt.name).sort(),
  );
  assert.equal(prompts.length, 5);
  const company = await client.getPrompt({
    name: "how-exposed-is-this-company",
    arguments: { company: "Walmart" },
  });
  const text = company.messages[0].content.text;
  assert.match(text, /^How exposed is this company\? Company: Walmart/);
  assert.match(text, /use Route 1 \(CDT\)/);
  assert.match(text, /### Route 1: CDT/);
  assert.match(text, /source="https:\/\/github\.com\/RiskThinking\/crc-docs\/blob\/[0-9a-f]{40}\//);
  const empty = await client.getPrompt({ name: "how-hot-will-it-get" });
  assert.match(empty.messages[0].content.text, /Place: \(ask me\)/);
});

test("crc-docs CDT routes only name tools and parameters that exist", async (t) => {
  const { SKILL_PROMPTS } = await import("../build/prompts.generated.js");
  const client = await connect(t);
  const { tools } = await client.listTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const prompt of SKILL_PROMPTS) {
    const route = prompt.skill.match(/### Route 1[\s\S]*?(?=\n### )/)?.[0];
    assert.ok(route, `${prompt.name} has a CDT route`);
    const named = [...route.matchAll(/`((?:get|list|search)_[a-z_]+)`/g)].map(
      (match) => match[1],
    );
    assert.ok(named.length > 0, `${prompt.name} names CDT tools`);
    const properties = new Set();
    for (const name of named) {
      assert.ok(byName.has(name), `${prompt.name} names unknown tool ${name}`);
      for (const key of Object.keys(byName.get(name).inputSchema.properties)) {
        properties.add(key);
      }
    }
    for (const [, key] of route.matchAll(/`([a-z_]+): /g)) {
      assert.ok(properties.has(key), `${prompt.name} uses unknown parameter ${key}`);
    }
  }
});

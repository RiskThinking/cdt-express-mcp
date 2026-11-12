import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { isPublicMcpRequest } from "../build/public-requests.js";

const getFreePort = async () => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
};

const startMcp = async (t, env) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["build/http.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      MCP_PUBLIC_BASE_URL: baseUrl,
      MCP_REDIS_URL: "",
      MCP_REDIS_HOSTNAME: "",
      MCP_OAUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return { child, stderr, exited: true };
    }
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) {
        return { baseUrl, resourceUrl: `${baseUrl}/mcp`, child };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`MCP server did not start: ${stderr}`);
};

// Stands in for api.riskthinking.ai so tool calls stay offline.
const startFakeApi = async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    if (req.headers.authorization !== "Bearer test-api-key") {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ results: [{ risk_factor: "hot_days", v: 1 }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
};

const rpc = (resourceUrl, body, headers = {}) =>
  fetch(resourceUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "lazy-auth-test", version: "1.0.0" },
  },
};
const call = (name, args = {}) => ({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name, arguments: args },
});
const EXPOSURE_ARGS = {
  latitude: 43.65,
  longitude: -79.38,
  risk_factors: ["hot_days"],
  horizon: ["2050"],
};

test("public request classification", () => {
  assert.equal(isPublicMcpRequest(INITIALIZE), true);
  assert.equal(
    isPublicMcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }),
    true,
  );
  assert.equal(isPublicMcpRequest(call("get_metrics_definition")), true);
  assert.equal(isPublicMcpRequest(call("get_climate_metrics_exposure")), false);
  assert.equal(isPublicMcpRequest(call("unknown_tool")), false);
  assert.equal(isPublicMcpRequest({ jsonrpc: "2.0", id: 1, result: {} }), false);
  assert.equal(isPublicMcpRequest({}), false);
  assert.equal(isPublicMcpRequest(null), false);
  assert.equal(isPublicMcpRequest([]), false);
  assert.equal(
    isPublicMcpRequest([INITIALIZE, call("get_climate_metrics_exposure")]),
    false,
  );
  assert.equal(
    isPublicMcpRequest([INITIALIZE, call("get_metrics_definition")]),
    true,
  );
});

test("anonymous discovery serves public requests and challenges the rest", async (t) => {
  const api = await startFakeApi(t);
  const { resourceUrl } = await startMcp(t, {
    MCP_ANONYMOUS_DISCOVERY: "true",
    CDT_API_BASE_URL: api.url,
  });

  const initialize = await rpc(resourceUrl, INITIALIZE);
  assert.equal(initialize.status, 200);
  const { result } = await initialize.json();
  assert.equal(result.serverInfo.title, "CDT Express by Riskthinking.AI");

  const list = await rpc(resourceUrl, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });
  assert.equal(list.status, 200);
  const { tools } = (await list.json()).result;
  assert.equal(tools.length, 40);
  for (const tool of tools) {
    const expected =
      tool.name === "get_metrics_definition" ? "noauth" : "oauth2";
    assert.equal(tool._meta.securitySchemes[0].type, expected, tool.name);
  }

  const glossary = await rpc(resourceUrl, call("get_metrics_definition"));
  assert.equal(glossary.status, 200);
  assert.match(
    (await glossary.json()).result.content[0].text,
    /METRICS GLOSSARY/,
  );

  const protectedCall = await rpc(
    resourceUrl,
    call("get_climate_metrics_exposure", EXPOSURE_ARGS),
  );
  assert.equal(protectedCall.status, 401);
  const challenge = protectedCall.headers.get("www-authenticate");
  assert.match(challenge, /^Bearer /);
  assert.match(challenge, /resource_metadata="[^"]+oauth-protected-resource/);
  assert.match(challenge, /scope="mcp:tools"/);

  const batch = await rpc(resourceUrl, [
    INITIALIZE,
    call("get_climate_metrics_exposure", EXPOSURE_ARGS),
  ]);
  assert.equal(batch.status, 401);

  // A token that is present but invalid is always challenged, never downgraded
  // to anonymous, so clients refresh or re-authorize.
  const badToken = await rpc(resourceUrl, INITIALIZE, {
    Authorization: "Bearer cdt_access_invalid",
  });
  assert.equal(badToken.status, 401);

  // An anonymous GET (SSE probe) must be 405, or SDK clients start sign-in.
  const stream = await fetch(resourceUrl, {
    headers: { Accept: "text/event-stream" },
  });
  assert.equal(stream.status, 405);
  const badTokenStream = await fetch(resourceUrl, {
    headers: {
      Accept: "text/event-stream",
      Authorization: "Bearer cdt_access_invalid",
    },
  });
  assert.equal(badTokenStream.status, 401);

  assert.equal(api.requests.length, 0, "anonymous requests reached the API");
});

test("an SDK client connects anonymously, then signs in on the first protected call", async (t) => {
  const api = await startFakeApi(t);
  const { baseUrl, resourceUrl } = await startMcp(t, {
    MCP_ANONYMOUS_DISCOVERY: "true",
    MCP_DEV_AUTHORIZE: "true",
    CDT_API_BASE_URL: api.url,
  });

  const redirectUri = "http://127.0.0.1:1/callback";
  const store = {};
  const redirects = [];
  const authProvider = {
    get redirectUrl() {
      return redirectUri;
    },
    get clientMetadata() {
      return {
        client_name: "Lazy Auth Test Client",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },
    clientInformation: () => store.client,
    saveClientInformation: (client) => {
      store.client = client;
    },
    tokens: () => store.tokens,
    saveTokens: (tokens) => {
      store.tokens = tokens;
    },
    redirectToAuthorization: (url) => {
      redirects.push(url);
    },
    saveCodeVerifier: (verifier) => {
      store.verifier = verifier;
    },
    codeVerifier: () => store.verifier,
  };
  const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
    authProvider,
  });
  const client = new Client({ name: "lazy-auth-sdk", version: "1.0.0" });
  t.after(() => client.close());

  await client.connect(transport);
  // Give the client's background SSE probe time to run.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(redirects.length, 0, "connecting must not start sign-in");
  assert.equal((await client.listTools()).tools.length, 40);
  const glossary = await client.callTool({ name: "get_metrics_definition" });
  assert.notEqual(glossary.isError, true);

  await assert.rejects(
    client.callTool({
      name: "get_climate_metrics_exposure",
      arguments: EXPOSURE_ARGS,
    }),
    /Unauthorized/,
  );
  assert.equal(redirects.length, 1, "the protected call starts sign-in");

  // Follow the browser flow through the development sign-in page.
  const authorize = await fetch(redirects[0], { redirect: "manual" });
  assert.equal(authorize.status, 302);
  const signInUrl = new URL(authorize.headers.get("location"));
  assert.equal(signInUrl.origin, baseUrl);
  assert.equal(signInUrl.pathname, "/dev/authorize");
  const page = await fetch(signInUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Lazy Auth Test Client/);

  const submit = await fetch(`${baseUrl}/dev/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: baseUrl,
    },
    body: new URLSearchParams({
      request: signInUrl.searchParams.get("request"),
      api_key: "test-api-key",
    }),
  });
  assert.equal(submit.status, 303);
  const callback = new URL(submit.headers.get("location"));
  assert.equal(`${callback.origin}${callback.pathname}`, redirectUri);

  await transport.finishAuth(callback.searchParams.get("code"));
  const exposure = await client.callTool({
    name: "get_climate_metrics_exposure",
    arguments: EXPOSURE_ARGS,
  });
  assert.notEqual(exposure.isError, true);
  assert.match(exposure.content[0].text, /hot_days/);
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].authorization, "Bearer test-api-key");
  assert.match(api.requests[0].url, /^\/v4\/climate\/metrics\/exposure\?/);
});

test("without anonymous discovery every MCP request requires a token", async (t) => {
  const { baseUrl, resourceUrl } = await startMcp(t, {});
  assert.equal((await rpc(resourceUrl, INITIALIZE)).status, 401);
  assert.equal(
    (await rpc(resourceUrl, call("get_metrics_definition"))).status,
    401,
  );
  assert.equal((await fetch(resourceUrl)).status, 401);
  assert.equal((await fetch(`${baseUrl}/dev/authorize`)).status, 404);
});

test("development sign-in refuses to start in production", async (t) => {
  const result = await startMcp(t, {
    NODE_ENV: "production",
    MCP_DEV_AUTHORIZE: "true",
  });
  assert.equal(result.exited, true);
  assert.notEqual(result.child.exitCode, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { isPublicMcpRequest } from "../build/public-requests.js";
import { startFakeApi, startMcp } from "./helpers.js";

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
  // Newer clients open with server/discover; unknown methods must not demand
  // sign-in, or the client marks the whole server as needing authentication.
  assert.equal(
    isPublicMcpRequest({ jsonrpc: "2.0", id: 1, method: "server/discover" }),
    true,
  );
  assert.equal(
    isPublicMcpRequest({ jsonrpc: "2.0", id: 1, method: "tasks/result" }),
    false,
  );
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

  const prompts = await rpc(resourceUrl, {
    jsonrpc: "2.0",
    id: 4,
    method: "prompts/list",
  });
  assert.equal(prompts.status, 200);
  assert.equal((await prompts.json()).result.prompts.length, 5);

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
  // Browsers send the page's origin on the form POST only under this policy.
  assert.equal(page.headers.get("referrer-policy"), "same-origin");
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

test("development sign-in may run behind a tunnel without Redis", async (t) => {
  const tunnel = {
    MCP_PUBLIC_BASE_URL: "https://example.ngrok-free.app",
    MCP_ALLOWED_HOSTS: "127.0.0.1",
    MCP_TRUST_PROXY_HOPS: "1",
  };
  const withDev = await startMcp(t, { ...tunnel, MCP_DEV_AUTHORIZE: "true" });
  assert.notEqual(withDev.exited, true);
  const withoutDev = await startMcp(t, tunnel);
  assert.equal(withoutDev.exited, true, "a remote deployment needs Redis");
});

test("development sign-in refuses to start in production", async (t) => {
  const result = await startMcp(t, {
    NODE_ENV: "production",
    MCP_DEV_AUTHORIZE: "true",
  });
  assert.equal(result.exited, true);
  assert.notEqual(result.child.exitCode, 0);
});

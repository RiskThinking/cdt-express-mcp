import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";

const getFreePort = async () => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
};

const waitForHealth = async (url, child) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("HTTP server exited early");
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for HTTP server");
};

test("remote OAuth and MCP flow", async (t) => {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const resourceUrl = `${baseUrl}/mcp`;
  const child = spawn(process.execPath, ["build/http.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      MCP_PUBLIC_BASE_URL: baseUrl,
      MCP_OAUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
      MCP_TRUST_PROXY_HOPS: "1",
      VELO_AUTHORIZE_URL: `${baseUrl}/fake-velo-authorize`,
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

  await waitForHealth(baseUrl, child);

  const oversizedCallbackResponse = await fetch(
    `${baseUrl}/oauth/velo/callback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "x".repeat(17 * 1024), api_key: "test" }),
    },
  );
  assert.equal(oversizedCallbackResponse.status, 413);

  const protectedMetadataResponse = await fetch(
    `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
  );
  assert.equal(protectedMetadataResponse.status, 200);
  const protectedMetadata = await protectedMetadataResponse.json();
  assert.equal(protectedMetadata.resource, resourceUrl);
  assert.deepEqual(protectedMetadata.scopes_supported, ["mcp:tools"]);

  const oauthMetadata = await fetch(
    `${baseUrl}/.well-known/oauth-authorization-server`,
  ).then((response) => response.json());
  assert.equal(oauthMetadata.issuer, `${baseUrl}/`);
  assert.equal(oauthMetadata.registration_endpoint, `${baseUrl}/register`);
  assert.deepEqual(oauthMetadata.code_challenge_methods_supported, ["S256"]);
  assert.equal(oauthMetadata.client_id_metadata_document_supported, true);

  const redirectUri = "http://127.0.0.1/callback";
  const registrationResponse = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Forwarded: "for=203.0.113.10;proto=https",
      "X-Forwarded-For": "203.0.113.10",
    },
    body: JSON.stringify({
      client_name: "CDT Express integration test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(registrationResponse.status, 201, stderr);
  const client = await registrationResponse.json();
  assert.match(client.client_id, /^cdt_client_/);

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorizeUrl = new URL("/authorize", baseUrl);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "mcp:tools",
    state: "state-123",
    resource: resourceUrl,
  });

  const rejectedRedirectUrl = new URL(authorizeUrl);
  rejectedRedirectUrl.searchParams.set(
    "redirect_uri",
    "https://unregistered-client.example/callback",
  );
  const rejectedRedirectResponse = await fetch(rejectedRedirectUrl, {
    redirect: "manual",
  });
  assert.equal(rejectedRedirectResponse.status, 400);
  assert.equal(
    (await rejectedRedirectResponse.json()).error,
    "invalid_request",
  );

  const authorizeResponse = await fetch(authorizeUrl, {
    redirect: "manual",
    headers: {
      Forwarded: "for=203.0.113.10;proto=https",
      "X-Forwarded-For": "203.0.113.10",
    },
  });
  assert.equal(authorizeResponse.status, 302);
  assert.doesNotMatch(stderr, /ERR_ERL_/);
  const veloRedirect = new URL(authorizeResponse.headers.get("location"));
  assert.equal(veloRedirect.pathname, "/fake-velo-authorize");
  const authorizationRequest = veloRedirect.searchParams.get("request");
  assert.match(authorizationRequest, /^cdt_request_/);

  const requestDescriptionResponse = await fetch(
    `${baseUrl}/oauth/authorization-request`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: authorizationRequest }),
    },
  );
  assert.equal(requestDescriptionResponse.status, 200);
  assert.deepEqual(await requestDescriptionResponse.json(), {
    client_name: "CDT Express integration test",
    redirect_uri: redirectUri,
  });

  const handoffResponse = await fetch(`${baseUrl}/oauth/velo/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request: authorizationRequest,
      api_key: "integration-test-api-key",
    }),
  });
  assert.equal(handoffResponse.status, 200);
  const handoff = await handoffResponse.json();
  const clientRedirect = new URL(handoff.redirect_url);
  assert.equal(clientRedirect.searchParams.get("state"), "state-123");
  assert.equal(clientRedirect.searchParams.get("iss"), `${baseUrl}/`);
  const code = clientRedirect.searchParams.get("code");
  assert.match(code, /^cdt_code_/);

  const tokenResponse = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: resourceUrl,
    }),
  });
  assert.equal(tokenResponse.status, 200, stderr);
  const tokens = await tokenResponse.json();
  assert.match(tokens.access_token, /^cdt_access_/);
  assert.match(tokens.refresh_token, /^cdt_refresh_/);

  const replayResponse = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: resourceUrl,
    }),
  });
  assert.equal(replayResponse.status, 400);
  assert.equal((await replayResponse.json()).error, "invalid_grant");

  const unauthenticated = await fetch(resourceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(unauthenticated.status, 401);
  assert.match(
    unauthenticated.headers.get("www-authenticate"),
    /resource_metadata=/,
  );

  const mcpHeaders = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  const initializeResponse = await fetch(resourceUrl, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "integration-test", version: "1.0.0" },
      },
    }),
  });
  assert.equal(initializeResponse.status, 200, stderr);
  const sessionId = initializeResponse.headers.get("mcp-session-id");
  assert.ok(sessionId);
  const initializeResult = await initializeResponse.json();
  assert.equal(
    initializeResult.result.serverInfo.name,
    "CDT Express MCP Server",
  );

  const refreshResponse = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      resource: resourceUrl,
    }),
  });
  assert.equal(refreshResponse.status, 200, stderr);
  const refreshedTokens = await refreshResponse.json();
  assert.match(refreshedTokens.access_token, /^cdt_access_/);
  assert.notEqual(refreshedTokens.access_token, tokens.access_token);

  const refreshedMcpHeaders = {
    ...mcpHeaders,
    Authorization: `Bearer ${refreshedTokens.access_token}`,
  };

  const listResponse = await fetch(resourceUrl, {
    method: "POST",
    headers: { ...refreshedMcpHeaders, "Mcp-Session-Id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(listResponse.status, 200, stderr);
  const listResult = await listResponse.json();
  assert.ok(listResult.result.tools.length > 10);
  assert.ok(
    listResult.result.tools.some(
      (tool) => tool.name === "get_metrics_definition",
    ),
  );

  const acceptedLargeBody = await fetch(resourceUrl, {
    method: "POST",
    headers: refreshedMcpHeaders,
    body: JSON.stringify({ padding: "x".repeat(128 * 1024) }),
  });
  assert.equal(acceptedLargeBody.status, 400);

  const rejectedLargeBody = await fetch(resourceUrl, {
    method: "POST",
    headers: refreshedMcpHeaders,
    body: JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
  });
  assert.equal(rejectedLargeBody.status, 413);
});

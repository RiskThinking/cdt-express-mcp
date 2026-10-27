// Exercises OAuth + Redis + stateless MCP without accessing the CDT API.
// Tokens and authorization URLs must never be printed, including on failure.
import { createHash, randomBytes } from "node:crypto";

const base = new URL(process.argv[2] || "https://mcp.riskthinking.ai");
let stage = "configuration";
let client;
let tokens;
let rpcId = 0;
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const request = (path, options = {}) =>
  fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });
const jsonPost = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const formPost = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
const expect = async (response, status) => {
  check(response.status === status, `Unexpected HTTP status during ${stage}`);
  return response.json();
};
const rpc = (method, params = {}, token = tokens?.access_token) =>
  request("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
try {
  stage = "discovery";
  await expect(await request("/health"), 200);
  const protectedResource = await expect(
    await request("/.well-known/oauth-protected-resource/mcp"),
    200,
  );
  const metadata = await expect(
    await request("/.well-known/oauth-authorization-server"),
    200,
  );
  check(Boolean(metadata.revocation_endpoint), "Missing revocation endpoint");
  const resource = protectedResource.resource;
  check(typeof resource === "string", "Missing resource identity");
  stage = "unauthenticated access";
  check(
    (await jsonPost("/mcp", {})).status === 401,
    "Missing authentication challenge",
  );
  stage = "client registration";
  const redirectUri = "http://127.0.0.1/mcp-deployment-smoke";
  client = await expect(
    await jsonPost("/register", {
      client_name: "CDT Express deployment smoke test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
    201,
  );
  stage = "authorization request";
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const authorize = new URL("/authorize", base);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    scope: "mcp:tools",
    state,
    resource,
  });
  const response = await request(authorize);
  check(response.status === 302, "Authorization did not redirect");
  const sealedRequest = new URL(
    response.headers.get("location"),
  ).searchParams.get("request");
  check(Boolean(sealedRequest), "Missing authorization request");
  await expect(
    await jsonPost("/oauth/authorization-request", { request: sealedRequest }),
    200,
  );
  stage = "synthetic VELO hand-off";
  // Synthetic key is used only for the local glossary tool; no CDT API call occurs.
  const handoff = await expect(
    await jsonPost("/oauth/velo/callback", {
      request: sealedRequest,
      api_key: "deployment-smoke-not-a-real-api-key",
    }),
    200,
  );
  const callback = new URL(handoff.redirect_url);
  check(callback.searchParams.get("state") === state, "State mismatch");
  check(
    callback.searchParams.get("iss") === metadata.issuer,
    "Issuer mismatch",
  );
  const grant = {
    grant_type: "authorization_code",
    client_id: client.client_id,
    code: callback.searchParams.get("code"),
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource,
  };
  stage = "code exchange";
  tokens = await expect(await formPost("/token", grant), 200);
  stage = "code replay rejection";
  const replay = await expect(await formPost("/token", grant), 400);
  check(replay.error === "invalid_grant", "Code replay was not rejected");
  stage = "stateless initialization";
  const initialize = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "deployment-smoke", version: "1.0.0" },
  });
  check(
    initialize.headers.get("mcp-session-id") === null,
    "Unexpected transport session",
  );
  await expect(initialize, 200);
  stage = "tool discovery";
  const { result } = await expect(await rpc("tools/list"), 200);
  check(result.tools.length === 40, "Unexpected tool count");
  check(
    result.tools.every(
      (tool) => tool.title && tool.annotations?.readOnlyHint === true,
    ),
    "Missing tool annotations",
  );
  stage = "glossary invocation";
  const glossary = await expect(
    await rpc("tools/call", { name: "get_metrics_definition", arguments: {} }),
    200,
  );
  check(
    glossary.result?.content?.some((item) => item.text?.includes("dcr_score")),
    "Glossary failed",
  );
  stage = "refresh rotation";
  const refreshed = await expect(
    await formPost("/token", {
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      resource,
    }),
    200,
  );
  check(
    refreshed.refresh_token !== tokens.refresh_token,
    "Refresh token did not rotate",
  );
  tokens = refreshed;
  await expect(await rpc("tools/list"), 200);
  stage = "revocation";
  check(
    (
      await formPost("/revoke", {
        client_id: client.client_id,
        token: tokens.refresh_token,
      })
    ).status === 200,
    "Revocation failed",
  );
  check(
    (await rpc("tools/list")).status === 401,
    "Revoked access token was accepted",
  );
  console.log(
    "Remote smoke passed: OAuth, Redis replay protection, 40 tools, glossary, refresh, and revocation",
  );
} catch {
  console.error(
    `Remote smoke failed during ${stage}; credentials and response bodies withheld`,
  );
  process.exitCode = 1;
} finally {
  if (client && tokens?.refresh_token) {
    try {
      await formPost("/revoke", {
        client_id: client.client_id,
        token: tokens.refresh_token,
      });
    } catch {
      console.error(
        "Smoke authorization cleanup failed; the grant expires automatically",
      );
    }
  }
}

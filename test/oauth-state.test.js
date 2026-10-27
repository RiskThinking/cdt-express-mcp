import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  connectRedisOAuthState,
  MemoryOAuthStateStore,
} from "../build/oauth-state.js";
import { VeloOAuthProvider, MCP_SCOPE } from "../build/oauth.js";

const redisUrl = process.env.MCP_TEST_REDIS_URL;
const redisOptions = { cluster: process.env.MCP_TEST_REDIS_CLUSTER === "true" };

async function exerciseProvider(t, firstStore, secondStore) {
  const config = {
    secret: `test-only-secret-${randomUUID()}`,
    issuerUrl: new URL("https://mcp.example.com"),
    resourceUrl: new URL("https://mcp.example.com/mcp"),
    veloAuthorizeUrl: new URL("https://velo.example.com/mcp/authorize"),
  };
  const first = new VeloOAuthProvider({ ...config, stateStore: firstStore });
  const second = new VeloOAuthProvider({ ...config, stateStore: secondStore });
  const client = await first.clientsStore.registerClient({
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
  async function authorize() {
    let request;
    await first.authorize(
      client,
      {
        redirectUri: client.redirect_uris[0],
        codeChallenge: "test-challenge",
        scopes: [MCP_SCOPE],
        resource: config.resourceUrl,
      },
      {
        redirect: (_status, url) => {
          request = new URL(url).searchParams.get("request");
        },
      },
    );
    const redirect = await second.completeVeloAuthorization(
      request,
      "test-api-key",
    );
    await assert.rejects(
      first.completeVeloAuthorization(request, "injected-key"),
      /already been completed/,
    );
    return new URL(redirect).searchParams.get("code");
  }
  const code = await authorize();
  const tokens = await first.exchangeAuthorizationCode(
    client,
    code,
    undefined,
    client.redirect_uris[0],
  );
  await assert.rejects(
    second.exchangeAuthorizationCode(client, code),
    /already been used/,
  );
  assert.equal(
    (await second.verifyAccessToken(tokens.access_token)).extra.apiKey,
    "test-api-key",
  );
  const refreshed = await second.exchangeRefreshToken(
    client,
    tokens.refresh_token,
  );
  await first.verifyAccessToken(refreshed.access_token);
  // Reusing an old refresh token revokes the whole family, including access tokens.
  await assert.rejects(
    first.exchangeRefreshToken(client, tokens.refresh_token),
    /reused, revoked, or expired/,
  );
  await assert.rejects(
    second.verifyAccessToken(tokens.access_token),
    /revoked or expired/,
  );
  await assert.rejects(
    second.verifyAccessToken(refreshed.access_token),
    /revoked or expired/,
  );
  await assert.rejects(
    second.exchangeRefreshToken(client, refreshed.refresh_token),
    /reused, revoked, or expired/,
  );

  const otherTokens = await first.exchangeAuthorizationCode(
    client,
    await authorize(),
  );
  const otherClient = { ...client, client_id: "wrong-client" };
  await second.revokeToken(otherClient, { token: otherTokens.refresh_token });
  await first.verifyAccessToken(otherTokens.access_token);
  await second.revokeToken(client, { token: otherTokens.access_token });
  await assert.rejects(
    first.verifyAccessToken(otherTokens.access_token),
    /revoked or expired/,
  );
  await first.revokeToken(client, { token: "unknown-token" });

  const raceTokens = await first.exchangeAuthorizationCode(
    client,
    await authorize(),
  );
  const race = await Promise.allSettled([
    first.exchangeRefreshToken(client, raceTokens.refresh_token),
    second.exchangeRefreshToken(client, raceTokens.refresh_token),
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const winner = race.find((result) => result.status === "fulfilled").value;
  await assert.rejects(
    first.verifyAccessToken(winner.access_token),
    /revoked or expired/,
  );
}

test("OAuth rotation, reuse detection, and revocation with development storage", async (t) => {
  const store = new MemoryOAuthStateStore();
  t.after(() => store.close());
  await exerciseProvider(t, store, store);
});

test("Redis shares atomic OAuth state across independent providers", {
  skip: !redisUrl,
}, async (t) => {
  const first = await connectRedisOAuthState(redisUrl, redisOptions);
  const second = await connectRedisOAuthState(redisUrl, redisOptions);
  t.after(async () => {
    await first.close();
    await second.close();
  });
  await exerciseProvider(t, first, second);
});

test("Redis retains replay and grant state when clients reconnect", {
  skip: !redisUrl,
}, async (t) => {
  const id = randomUUID();
  const expiry = Math.floor(Date.now() / 1000) + 60;
  const first = await connectRedisOAuthState(redisUrl, redisOptions);
  assert.equal(await first.consume("code", id), false);
  assert.equal(await first.putPending("code", id, expiry), true);
  assert.equal(await first.consume("code", id), true);
  assert.equal(await first.createGrant(id, "first-hash", expiry), true);
  await first.close();
  const childResult = await promisify(execFile)(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import { connectRedisOAuthState } from './build/oauth-state.js';
    const state = await connectRedisOAuthState(process.env.MCP_TEST_REDIS_URL, { cluster: process.env.MCP_TEST_REDIS_CLUSTER === "true" });
    const id = ${JSON.stringify(id)};
    console.log(JSON.stringify([await state.consume('code', id), await state.isGrantActive(id)]));
    await state.close();
  `,
    ],
    { env: { ...process.env, MCP_TEST_REDIS_URL: redisUrl } },
  );
  assert.deepEqual(JSON.parse(childResult.stdout), [false, true]);
  const second = await connectRedisOAuthState(redisUrl, redisOptions);
  t.after(() => second.close());
  assert.equal(await second.consume("code", id), false);
  assert.equal(await second.isGrantActive(id), true);
  await second.revokeGrant(id);
});

test("Redis fails closed after connectivity is lost", {
  skip: !redisUrl,
}, async () => {
  const store = await connectRedisOAuthState(redisUrl, redisOptions);
  await store.close();
  await assert.rejects(
    store.isGrantActive(randomUUID()),
    /storage is unavailable/,
  );
});

test("missing pending state denies redemption, including after state loss", async () => {
  const store = new MemoryOAuthStateStore();
  const id = randomUUID();
  const expiry = Math.floor(Date.now() / 1000) + 60;
  assert.equal(await store.consume("request", id), false);
  assert.equal(await store.putPending("request", id, expiry), true);
  assert.equal(await store.putPending("request", id, expiry), false);
  assert.equal(await store.consume("request", id), true);
  assert.equal(await store.consume("request", id), false);
  await store.putPending("code", id, expiry);
  await store.close();
  assert.equal(await store.consume("code", id), false);
});

test("valid OAuth artifacts fail closed after all development state is lost", async () => {
  const store = new MemoryOAuthStateStore();
  const provider = new VeloOAuthProvider({
    secret: `test-secret-long-enough-${randomUUID()}`,
    issuerUrl: new URL("https://mcp.example.com"),
    resourceUrl: new URL("https://mcp.example.com/mcp"),
    veloAuthorizeUrl: new URL("https://velo.example.com/mcp/authorize"),
    stateStore: store,
  });
  const client = await provider.clientsStore.registerClient({
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
  });
  async function request() {
    let pending;
    await provider.authorize(
      client,
      { redirectUri: client.redirect_uris[0], codeChallenge: "test" },
      {
        redirect: (_status, url) => {
          pending = new URL(url).searchParams.get("request");
        },
      },
    );
    return pending;
  }
  const pending = await request();
  await store.close();
  await assert.rejects(
    provider.completeVeloAuthorization(pending, "key"),
    /already been completed/,
  );
  const redirect = await provider.completeVeloAuthorization(
    await request(),
    "key",
  );
  const code = new URL(redirect).searchParams.get("code");
  await store.close();
  await assert.rejects(
    provider.exchangeAuthorizationCode(client, code),
    /already been used/,
  );
  const freshRedirect = await provider.completeVeloAuthorization(
    await request(),
    "key",
  );
  const tokens = await provider.exchangeAuthorizationCode(
    client,
    new URL(freshRedirect).searchParams.get("code"),
  );
  await store.close();
  await assert.rejects(
    provider.verifyAccessToken(tokens.access_token),
    /revoked or expired/,
  );
  await assert.rejects(
    provider.exchangeRefreshToken(client, tokens.refresh_token),
    /reused, revoked, or expired/,
  );
});

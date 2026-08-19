import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCimdDocument,
  isPublicIpAddress,
  resolveCimdClient,
  validateCimdUrl,
} from "../build/cimd.js";
import { DEFAULT_CIMD_ORIGIN_POLICY } from "../build/oauth.js";

const clientId = "https://any-ai-client.example/oauth/client-metadata.json";
const metadata = {
  client_id: clientId,
  client_name: "Any AI Client",
  redirect_uris: ["https://any-ai-client.example/oauth/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

test("CIMD defaults to any safely retrievable HTTPS client", async () => {
  assert.equal(DEFAULT_CIMD_ORIGIN_POLICY, "*");
  const client = await resolveCimdClient(clientId, undefined, async (url) => {
    assert.equal(url.href, clientId);
    return metadata;
  });
  assert.equal(client?.client_id, clientId);
  assert.deepEqual(client?.redirect_uris, metadata.redirect_uris);
});

test("CIMD still supports an optional deployment allowlist", async () => {
  const client = await resolveCimdClient(
    clientId,
    new Set(["https://different-client.example"]),
    async () => metadata,
  );
  assert.equal(client, undefined);
});

test("CIMD rejects mismatched metadata identities", async () => {
  const client = await resolveCimdClient(clientId, undefined, async () => ({
    ...metadata,
    client_id: "https://attacker.example/client.json",
  }));
  assert.equal(client, undefined);
});

test("CIMD URLs require credential-free HTTPS URLs with a path", () => {
  assert.throws(() => validateCimdUrl("http://client.example/client.json"));
  assert.throws(() => validateCimdUrl("https://client.example/"));
  assert.throws(() =>
    validateCimdUrl("https://user:pass@client.example/client.json"),
  );
  assert.throws(() =>
    validateCimdUrl("https://client.example/client.json#fragment"),
  );
});

test("CIMD SSRF protection rejects non-public address ranges", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "203.0.113.10",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);

  await assert.rejects(
    fetchCimdDocument(new URL("https://127.0.0.1/client.json")),
    /public IP addresses/,
  );
});

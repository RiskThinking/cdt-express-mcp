import { createClient, createCluster } from "redis";
import { TemporarilyUnavailableError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

// Keys and values contain only random authorization IDs or SHA-256 digests.
// No API keys, raw OAuth tokens, or user data are persisted here.
export interface OAuthStateStore {
  putPending(
    kind: "request" | "code",
    digest: string,
    expiresAt: number,
  ): Promise<boolean>;
  consume(kind: "request" | "code", digest: string): Promise<boolean>;
  createGrant(
    id: string,
    refreshDigest: string,
    expiresAt: number,
  ): Promise<boolean>;
  rotateGrant(
    id: string,
    previousDigest: string,
    nextDigest: string,
  ): Promise<boolean>;
  isGrantActive(id: string): Promise<boolean>;
  revokeGrant(id: string): Promise<void>;
  close(): Promise<void>;
}

// Development only. Production must share Redis across every serving revision.
export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private get(key: string) {
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= Date.now() / 1000) this.entries.delete(id);
    }
    return this.entries.get(key);
  }
  async putPending(
    kind: "request" | "code",
    digest: string,
    expiresAt: number,
  ) {
    const key = `${kind}:${digest}`;
    if (this.get(key)) return false;
    this.entries.set(key, { value: "pending", expiresAt });
    return true;
  }
  async consume(kind: "request" | "code", digest: string) {
    const key = `${kind}:${digest}`;
    if (!this.get(key)) return false;
    this.entries.delete(key);
    return true;
  }
  async createGrant(id: string, refreshDigest: string, expiresAt: number) {
    const key = `grant:${id}`;
    if (this.get(key)) return false;
    this.entries.set(key, { value: refreshDigest, expiresAt });
    return true;
  }
  async rotateGrant(id: string, previousDigest: string, nextDigest: string) {
    const key = `grant:${id}`;
    const grant = this.get(key);
    if (!grant) return false;
    if (grant.value !== previousDigest) {
      this.entries.delete(key);
      return false;
    }
    grant.value = nextDigest;
    return true;
  }
  async isGrantActive(id: string) {
    return Boolean(this.get(`grant:${id}`));
  }
  async revokeGrant(id: string) {
    this.entries.delete(`grant:${id}`);
  }
  async close() {
    this.entries.clear();
  }
}

// One key per operation makes these scripts compatible with Redis Cluster.
const ROTATE_GRANT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
return 1
`;

export async function connectRedisOAuthState(
  url: string,
  options: { cluster?: boolean; password?: string } = {},
): Promise<OAuthStateStore> {
  const client = (() => {
    try {
      const parsed = new URL(url);
      const connection = {
        username: decodeURIComponent(parsed.username) || undefined,
        password:
          options.password || decodeURIComponent(parsed.password) || undefined,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: 5_000,
          reconnectStrategy: (retries: number) =>
            Math.min(100 * 2 ** retries, 3_000),
          ...(parsed.protocol === "rediss:" ? { tls: true as const } : {}),
        },
      };
      return options.cluster
        ? createCluster({
            rootNodes: [{ url }],
            defaults: connection,
            commandOptions: { timeout: 5_000 },
            useReplicas: false,
          })
        : createClient({
            url,
            ...connection,
            commandOptions: { timeout: 5_000 },
          });
    } catch {
      throw new Error("Invalid OAuth Redis connection configuration");
    }
  })();
  // Redis errors can include connection details; never log the URL or error object.
  client.on("error", () => console.error("OAuth Redis connection unavailable"));
  // Fail startup instead of waiting indefinitely for initial connectivity.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("OAuth Redis connection timed out")),
          6_000,
        );
        timer.unref();
      }),
    ]);
  } catch {
    if (client.isOpen) client.destroy();
    throw new Error("Could not connect to OAuth Redis");
  } finally {
    clearTimeout(timer);
  }
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      if (!client.isReady) throw new Error("Redis unavailable");
      return await operation();
    } catch {
      throw new TemporarilyUnavailableError(
        "Authorization storage is unavailable. Try again later.",
      );
    }
  };
  const key = (kind: string, id: string) => `cdt:mcp:oauth:v2:${kind}:${id}`;
  return {
    putPending: (kind, digest, expiresAt) =>
      run(
        async () =>
          (await client.set(key(kind, digest), "pending", {
            NX: true,
            EXAT: expiresAt,
          })) === "OK",
      ),
    // Positive state: missing records deny redemption, including after Redis loss.
    consume: (kind, digest) =>
      run(async () => (await client.getDel(key(kind, digest))) === "pending"),
    createGrant: (id, digest, expiresAt) =>
      run(
        async () =>
          (await client.set(key("grant", id), digest, {
            NX: true,
            EXAT: expiresAt,
          })) === "OK",
      ),
    rotateGrant: (id, previous, next) =>
      run(
        async () =>
          (await client.eval(ROTATE_GRANT, {
            keys: [key("grant", id)],
            arguments: [previous, next],
          })) === 1,
      ),
    isGrantActive: (id) =>
      run(async () => (await client.exists(key("grant", id))) === 1),
    revokeGrant: (id) =>
      run(async () => {
        await client.del(key("grant", id));
      }),
    close: async () => {
      client.destroy();
    },
  };
}

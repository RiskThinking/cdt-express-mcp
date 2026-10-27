// Read-only Redis configuration inspection. Does not create keys, run scripts, or change config.
import { createCluster } from "redis";

const hostname = process.env.MCP_REDIS_HOSTNAME;
const url =
  process.env.MCP_REDIS_URL || (hostname ? `redis://${hostname}` : undefined);
if (!url) throw new Error("Set MCP_REDIS_URL or MCP_REDIS_HOSTNAME");
const parsed = new URL(url);
const client = createCluster({
  rootNodes: [{ url }],
  defaults: {
    password:
      process.env.MCP_REDIS_PASSWORD ||
      decodeURIComponent(parsed.password) ||
      undefined,
    username: decodeURIComponent(parsed.username) || undefined,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 3_000,
      reconnectStrategy: false,
      ...(parsed.protocol === "rediss:" ? { tls: true } : {}),
    },
  },
  commandOptions: { timeout: 3_000 },
  useReplicas: false,
});
client.on("error", () => {});
try {
  await client.connect();
  const nodes = [];
  for (const node of client.masters) {
    const connection = await client.nodeClient(node);
    const config = {};
    for (const name of [
      "maxmemory-policy",
      "maxmemory",
      "appendonly",
      "appendfsync",
      "save",
      "min-replicas-to-write",
      "min-replicas-max-lag",
      "tls-port",
    ])
      Object.assign(config, await connection.configGet(name));
    const info = {};
    for (const section of ["server", "replication", "persistence", "stats"]) {
      const text = await connection.info(section);
      for (const line of text.split("\r\n")) {
        const split = line.indexOf(":");
        if (split === -1) continue;
        const key = line.slice(0, split);
        if (
          [
            "redis_version",
            "role",
            "connected_slaves",
            "aof_enabled",
            "evicted_keys",
          ].includes(key)
        )
          info[key] = line.slice(split + 1);
      }
    }
    nodes.push({ primary: nodes.length + 1, config, info });
  }
  console.log(
    JSON.stringify(
      { accessible: true, primaryCount: nodes.length, nodes },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Redis inspection failed; no settings were changed. Check credentials, VPN/VPC access, and CONFIG permissions.",
  );
  process.exitCode = 1;
} finally {
  if (client.isOpen) client.destroy();
}

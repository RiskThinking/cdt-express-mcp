import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";

export const getFreePort = async () => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
};

export const startMcp = async (t, env) => {
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
export const startFakeApi = async (t) => {
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


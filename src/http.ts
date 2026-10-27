import { TemporarilyUnavailableError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  createOAuthMetadata,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import express from "express";

import {
  DEFAULT_CIMD_ORIGIN_POLICY,
  MCP_SCOPE,
  VeloOAuthProvider,
} from "./oauth.js";
import {
  connectRedisOAuthState,
  MemoryOAuthStateStore,
} from "./oauth-state.js";
import { getServer } from "./server.js";

type AuthenticatedRequest = Request & { auth?: AuthInfo };
const requiredUrl = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      `${name} must be a credential-free HTTPS URL (HTTP is allowed on loopback for development)`,
    );
  }
  return url;
};

const getApiKey = (req: AuthenticatedRequest) => {
  const apiKey = req.auth?.extra?.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Authenticated request has no CDT API key");
  }
  return apiKey.trim();
};

async function main() {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const publicBaseUrl = requiredUrl(
    "MCP_PUBLIC_BASE_URL",
    `http://localhost:${port}`,
  );
  if (publicBaseUrl.pathname !== "/" || publicBaseUrl.search) {
    throw new Error(
      "MCP_PUBLIC_BASE_URL must be an origin without a path or query",
    );
  }
  const resourceUrl = new URL("/mcp", publicBaseUrl);
  const veloAuthorizeUrl = requiredUrl(
    "VELO_AUTHORIZE_URL",
    "https://velo.riskthinking.ai/mcp/authorize",
  );
  const secret = process.env.MCP_OAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MCP_OAUTH_SECRET must be at least 32 characters");
  }
  const cimdOriginPolicy =
    process.env.MCP_ALLOWED_CIMD_ORIGINS || DEFAULT_CIMD_ORIGIN_POLICY;

  const redisHostname = process.env.MCP_REDIS_HOSTNAME;
  const redisUrl =
    process.env.MCP_REDIS_URL ||
    (redisHostname ? `redis://${redisHostname}` : undefined);
  const redisCluster = process.env.MCP_REDIS_CLUSTER || "false";
  if (!["true", "false"].includes(redisCluster))
    throw new Error("MCP_REDIS_CLUSTER must be true or false");
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
    publicBaseUrl.hostname,
  );
  if (!redisUrl && !isLocal)
    throw new Error("MCP_REDIS_URL is required for a remote deployment");
  const stateStore = redisUrl
    ? await connectRedisOAuthState(redisUrl, {
        cluster: redisCluster === "true",
        password: process.env.MCP_REDIS_PASSWORD,
      })
    : new MemoryOAuthStateStore();

  const provider = new VeloOAuthProvider({
    stateStore,
    secret,
    issuerUrl: publicBaseUrl,
    resourceUrl,
    veloAuthorizeUrl,
    allowedCimdOrigins:
      cimdOriginPolicy.trim() === "*"
        ? undefined
        : new Set(
            cimdOriginPolicy
              .split(",")
              .map((origin) => new URL(origin.trim()).origin),
          ),
  });
  const allowedOrigins = new Set(
    (
      process.env.MCP_ALLOWED_ORIGINS ||
      "https://chatgpt.com,https://claude.ai,https://gemini.google.com"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  allowedOrigins.add(publicBaseUrl.origin);
  allowedOrigins.add(veloAuthorizeUrl.origin);

  const allowedHosts = new Set([publicBaseUrl.hostname]);
  for (const allowedHost of (process.env.MCP_ALLOWED_HOSTS || "").split(",")) {
    if (allowedHost.trim()) allowedHosts.add(allowedHost.trim());
  }
  if (publicBaseUrl.hostname === "localhost") {
    allowedHosts.add("127.0.0.1");
    allowedHosts.add("localhost");
  }
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  const trustProxyHopsValue = process.env.MCP_TRUST_PROXY_HOPS || "0";
  if (!/^\d+$/.test(trustProxyHopsValue)) {
    throw new Error("MCP_TRUST_PROXY_HOPS must be a non-negative integer");
  }
  const trustProxyHops = Number.parseInt(trustProxyHopsValue, 10);
  if (!Number.isSafeInteger(trustProxyHops)) {
    throw new Error("MCP_TRUST_PROXY_HOPS must be a non-negative integer");
  }
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  app.use(hostHeaderValidation([...allowedHosts]));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: "Origin is not allowed" });
      return;
    }
    next();
  });

  app.post(
    "/oauth/authorization-request",
    express.json({ limit: "16kb" }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (typeof req.body?.request !== "string") {
        res.status(400).json({ error: "request is required" });
        return;
      }
      try {
        res.json(provider.describeAuthorizationRequest(req.body.request));
      } catch {
        res
          .status(400)
          .json({ error: "Authorization request is invalid or expired" });
      }
    },
  );

  app.post(
    "/oauth/velo/callback",
    express.json({ limit: "16kb" }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const request = req.body?.request;
      const apiKey = req.body?.api_key;
      if (
        typeof request !== "string" ||
        typeof apiKey !== "string" ||
        !apiKey.trim()
      ) {
        res.status(400).json({ error: "request and api_key are required" });
        return;
      }
      try {
        const redirectUrl = await provider.completeVeloAuthorization(
          request,
          apiKey.trim(),
        );
        res.json({ redirect_url: redirectUrl });
      } catch (error) {
        if (error instanceof TemporarilyUnavailableError) {
          res.status(503).json({ error: "temporarily_unavailable" });
          return;
        }
        res
          .status(400)
          .json({ error: "Authorization request is invalid or expired" });
      }
    },
  );

  const serviceDocumentationUrl = new URL(
    "https://github.com/RiskThinking/cdt-express-mcp#remote-mcp",
  );
  const authRouterOptions = {
    provider,
    issuerUrl: publicBaseUrl,
    resourceServerUrl: resourceUrl,
    serviceDocumentationUrl,
    scopesSupported: [MCP_SCOPE],
    resourceName: "CDT Express MCP",
  };
  const oauthMetadata = createOAuthMetadata(authRouterOptions);
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({ ...oauthMetadata, client_id_metadata_document_supported: true });
  });
  app.use(mcpAuthRouter(authRouterOptions));

  const authMiddleware = requireBearerAuth({
    verifier: provider,
    requiredScopes: [MCP_SCOPE],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
  });
  // Each request gets its own transport and server. Identity and credentials
  // come from the bearer token on this request, never from a prior session.
  app.post(
    "/mcp",
    authMiddleware,
    express.json({ limit: "1mb" }),
    async (req: AuthenticatedRequest, res: Response) => {
      const server = getServer(getApiKey(req));
      res.once("close", () => {
        void server
          .close()
          .catch(() => console.error("MCP request cleanup failed"));
      });
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch {
        // Error objects can carry request headers or credentials.
        console.error("MCP request failed");
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    },
  );

  // This server has no persistent event stream or transport session to delete.
  app.all("/mcp", authMiddleware, (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed; use POST" },
      id: null,
    });
  });

  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(error);
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : 500;
      res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
        error:
          status === 413
            ? "Request body is too large"
            : status === 400
              ? "Malformed request body"
              : "Internal server error",
      });
    },
  );

  const server = app.listen(port, host, () => {
    console.error(`CDT Express MCP listening at ${resourceUrl.href}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await stateStore.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("CDT Express HTTP server failed to start", error);
  process.exit(1);
});

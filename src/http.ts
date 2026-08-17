import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { createOAuthMetadata, getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

import { MCP_SCOPE, VeloOAuthProvider } from "./oauth.js";
import { getServer } from "./server.js";

type AuthenticatedRequest = Request & { auth?: AuthInfo };
type Session = {
  transport: StreamableHTTPServerTransport;
  authorizationId: string;
  lastSeen: number;
};

const SESSION_IDLE_MS = 60 * 60 * 1000;

const requiredUrl = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is required`);
  return new URL(value);
};

const getApiKey = (req: AuthenticatedRequest) => {
  const apiKey = req.auth?.extra?.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Authenticated request has no CDT API key");
  }
  return apiKey.trim();
};

const getAuthorizationId = (req: AuthenticatedRequest) => {
  const authorizationId = req.auth?.extra?.authorizationId;
  if (typeof authorizationId !== "string" || !authorizationId) {
    throw new Error("Authenticated request has no authorization identity");
  }
  return authorizationId;
};

async function main() {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const publicBaseUrl = requiredUrl(
    "MCP_PUBLIC_BASE_URL",
    `http://localhost:${port}`,
  );
  const resourceUrl = new URL("/mcp", publicBaseUrl);
  const veloAuthorizeUrl = requiredUrl(
    "VELO_AUTHORIZE_URL",
    "https://velo.riskthinking.ai/mcp/authorize",
  );
  const secret = process.env.MCP_OAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MCP_OAUTH_SECRET must be at least 32 characters");
  }

  const provider = new VeloOAuthProvider({
    secret,
    issuerUrl: publicBaseUrl,
    resourceUrl,
    veloAuthorizeUrl,
    allowedRedirectOrigins: new Set(
      (process.env.MCP_ALLOWED_REDIRECT_ORIGINS ||
        "https://chatgpt.com,https://claude.ai,https://platform.claude.com,https://gemini.google.com")
        .split(",")
        .map((origin) => new URL(origin.trim()).origin),
    ),
    allowedCimdOrigins: new Set(
      (process.env.MCP_ALLOWED_CIMD_ORIGINS || "https://chatgpt.com")
        .split(",")
        .map((origin) => new URL(origin.trim()).origin),
    ),
  });
  const allowedOrigins = new Set(
    (process.env.MCP_ALLOWED_ORIGINS ||
      "https://chatgpt.com,https://claude.ai,https://gemini.google.com")
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
    "/oauth/velo/callback",
    express.json({ limit: "16kb" }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const request = req.body?.request;
      const apiKey = req.body?.api_key;
      if (typeof request !== "string" || typeof apiKey !== "string" || !apiKey.trim()) {
        res.status(400).json({ error: "request and api_key are required" });
        return;
      }
      try {
        const redirectUrl = provider.completeVeloAuthorization(
          request,
          apiKey.trim(),
        );
        res.json({ redirect_url: redirectUrl });
      } catch {
        res.status(400).json({ error: "Authorization request is invalid or expired" });
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
  const sessions = new Map<string, Session>();

  const requireSession = (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "MCP session not found" },
        id: null,
      });
      return undefined;
    }
    if (session.authorizationId !== getAuthorizationId(req)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32003, message: "MCP session belongs to another authorization" },
        id: null,
      });
      return undefined;
    }
    session.lastSeen = Date.now();
    return session;
  };

  app.post(
    "/mcp",
    authMiddleware,
    express.json({ limit: "1mb" }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const sessionId = req.header("mcp-session-id");
        if (sessionId) {
          const session = requireSession(req, res);
          if (session) await session.transport.handleRequest(req, res, req.body);
          return;
        }
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Initialize the MCP session first" },
            id: null,
          });
          return;
        }

        let initializedSessionId: string | undefined;
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: (id) => {
            initializedSessionId = id;
            sessions.set(id, {
              transport,
              authorizationId: getAuthorizationId(req),
              lastSeen: Date.now(),
            });
          },
        });
        transport.onclose = () => {
          if (initializedSessionId) sessions.delete(initializedSessionId);
        };
        const server = getServer(getApiKey(req));
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("MCP request failed", error);
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

  app.get(
    "/mcp",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const session = requireSession(req, res);
      if (session) await session.transport.handleRequest(req, res);
    },
  );

  app.delete(
    "/mcp",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const sessionId = req.header("mcp-session-id");
      const session = requireSession(req, res);
      if (!session) return;
      await session.transport.handleRequest(req, res);
      if (sessionId) sessions.delete(sessionId);
    },
  );

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - SESSION_IDLE_MS;
    for (const [id, session] of sessions) {
      if (session.lastSeen < cutoff) {
        sessions.delete(id);
        void session.transport.close();
      }
    }
  }, 10 * 60 * 1000);
  cleanup.unref();

  const server = app.listen(port, host, () => {
    console.error(`CDT Express MCP listening at ${resourceUrl.href}`);
  });

  const shutdown = async () => {
    clearInterval(cleanup);
    for (const session of sessions.values()) await session.transport.close();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("CDT Express HTTP server failed to start", error);
  process.exit(1);
});

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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import express from "express";

import {
  buildToolsCatalog,
  buildUtcpManual,
  GLOSSARY_PATH,
} from "./catalog.js";
import { METRIC_DEFINITIONS } from "./glossary.js";
import { renderDevAuthorizePage, renderLandingPage } from "./landing.js";
import {
  DEFAULT_CIMD_ORIGIN_POLICY,
  MCP_SCOPE,
  VeloOAuthProvider,
} from "./oauth.js";
import {
  connectRedisOAuthState,
  MemoryOAuthStateStore,
} from "./oauth-state.js";
import { isPublicMcpRequest } from "./public-requests.js";
import { getServer } from "./server.js";

type AuthenticatedRequest = Request & { auth?: AuthInfo };
// build/http.js -> public/ at the package root.
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "../public");
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
  const booleanEnv = (name: string, fallback: "true" | "false") => {
    const value = process.env[name] || fallback;
    if (!["true", "false"].includes(value)) {
      throw new Error(`${name} must be true or false`);
    }
    return value === "true";
  };
  // Serve initialize, tools/list, and public tools without a token (lazy
  // authentication). API-backed tool calls still answer 401 to start sign-in.
  const anonymousDiscovery = booleanEnv("MCP_ANONYMOUS_DISCOVERY", "false");
  // Development only: a local page that accepts a pasted CDT API key in place
  // of VELO sign-in, so tunnels and local clients can complete OAuth.
  const devAuthorize = booleanEnv("MCP_DEV_AUTHORIZE", "false");
  if (devAuthorize && process.env.NODE_ENV === "production") {
    throw new Error("MCP_DEV_AUTHORIZE must not be enabled in production");
  }
  const veloAuthorizeUrl = devAuthorize
    ? new URL("/dev/authorize", publicBaseUrl)
    : requiredUrl(
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
  const redisCluster = booleanEnv("MCP_REDIS_CLUSTER", "false");
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
    publicBaseUrl.hostname,
  );
  // Development sign-in (never in production) may run behind a tunnel with
  // in-memory state: one process, and a restart simply requires reconnecting.
  if (!redisUrl && !isLocal && !devAuthorize)
    throw new Error("MCP_REDIS_URL is required for a remote deployment");
  const stateStore = redisUrl
    ? await connectRedisOAuthState(redisUrl, {
        cluster: redisCluster,
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

  // Icons referenced by server.json and the initialize response.
  for (const icon of ["icon-192.png", "icon-512.png"]) {
    app.get(`/${icon}`, (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(join(PUBLIC_DIR, icon));
    });
  }

  // Public, credential-free descriptions of the tools: the UTCP manual (for
  // clients that call the CDT Express API directly with an API key), MCP tool
  // metadata, and the metric glossary used by both.
  const utcpManual = JSON.stringify(
    buildUtcpManual({ glossaryUrl: new URL(GLOSSARY_PATH, publicBaseUrl).href }),
  );
  const toolsCatalog = JSON.stringify(buildToolsCatalog());
  const publicDocument =
    (body: string, type: string): express.RequestHandler =>
    (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.type(type).send(body);
    };
  app.get("/utcp", publicDocument(utcpManual, "json"));
  app.get("/tools.json", publicDocument(toolsCatalog, "json"));
  app.get(GLOSSARY_PATH, publicDocument(METRIC_DEFINITIONS, "text"));

  // People who open the connection URL in a browser land here instead of a 404.
  const landingPage = renderLandingPage(resourceUrl);
  app.get("/", (_req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    res.type("html").send(landingPage);
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

  if (devAuthorize) {
    console.error(
      "MCP_DEV_AUTHORIZE is enabled: sign-in accepts a pasted CDT API key",
    );
    app.get("/dev/authorize", (req, res) => {
      const request = String(req.query.request || "");
      try {
        const description = provider.describeAuthorizationRequest(request);
        res.type("html").send(renderDevAuthorizePage(request, description));
      } catch {
        res.status(400).send("Authorization request is invalid or expired");
      }
    });
    app.post(
      "/dev/authorize",
      express.urlencoded({ extended: false, limit: "16kb" }),
      async (req, res) => {
        const { request, api_key: apiKey } = req.body ?? {};
        if (
          typeof request !== "string" ||
          typeof apiKey !== "string" ||
          !apiKey.trim()
        ) {
          res.status(400).send("request and api_key are required");
          return;
        }
        try {
          res.redirect(
            303,
            await provider.completeVeloAuthorization(request, apiKey.trim()),
          );
        } catch {
          res.status(400).send("Authorization request is invalid or expired");
        }
      },
    );
  }

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
  const parseMcpBody = express.json({ limit: "1mb" });
  // Without anonymous discovery, authenticate before parsing (unchanged
  // behaviour). With it, parse first so the method decides: requests without
  // an Authorization header may proceed only if they are public. Any request
  // that carries a token, valid or not, is always verified, so expired tokens
  // still get a 401 and clients refresh them.
  const mcpAccess: express.RequestHandler[] = anonymousDiscovery
    ? [
        parseMcpBody,
        (req, res, next) => {
          if (!req.headers.authorization && isPublicMcpRequest(req.body)) {
            next();
            return;
          }
          authMiddleware(req, res, next);
        },
      ]
    : [authMiddleware, parseMcpBody];

  // Each request gets its own transport and server. Identity and credentials
  // come from the bearer token on this request, never from a prior session.
  app.post(
    "/mcp",
    ...mcpAccess,
    async (req: AuthenticatedRequest, res: Response) => {
      const server = getServer(req.auth ? getApiKey(req) : undefined);
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
  // With anonymous discovery, an unauthenticated GET (the client probing for a
  // server-sent event stream) must get 405, not 401: a 401 would make clients
  // start sign-in immediately and defeat lazy authentication.
  const streamAccess: express.RequestHandler = (req, res, next) => {
    if (anonymousDiscovery && !req.headers.authorization) {
      next();
      return;
    }
    authMiddleware(req, res, next);
  };
  app.all("/mcp", streamAccess, (_req, res) => {
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

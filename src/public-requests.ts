import { PUBLIC_TOOL_NAMES } from "./tools.js";

// MCP methods that reveal only what the server offers, never account data.
const PUBLIC_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "ping",
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "resources/read",
  "prompts/list",
  "prompts/get",
]);

const isPublicMessage = (message: unknown) => {
  if (typeof message !== "object" || message === null) return false;
  const { method, params } = message as { method?: unknown; params?: unknown };
  if (typeof method !== "string") return false;
  if (method.startsWith("notifications/") || PUBLIC_METHODS.has(method)) {
    return true;
  }
  if (method !== "tools/call") return false;
  const name = (params as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && PUBLIC_TOOL_NAMES.has(name);
};

/**
 * Whether a parsed JSON-RPC body may be served without signing in: discovery
 * methods and calls to tools that never contact the CDT Express API. A batch
 * is public only if every message is.
 */
export const isPublicMcpRequest = (body: unknown) =>
  Array.isArray(body)
    ? body.length > 0 && body.every(isPublicMessage)
    : isPublicMessage(body);

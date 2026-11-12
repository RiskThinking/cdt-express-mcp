import { PUBLIC_TOOL_NAMES } from "./tools.js";

// Only calls that would reach the CDT Express API need an account. Everything
// else (initialize, server/discover, listings, prompts, the glossary, and
// methods this server does not implement) is answered without one, so new
// discovery methods in later protocol versions do not trigger sign-in.
// Anonymous servers also have no API key, so API tools fail closed regardless.
const needsAccount = (method: string, params: unknown) => {
  if (method.startsWith("tasks/")) return true;
  if (method !== "tools/call") return false;
  const name = (params as { name?: unknown } | undefined)?.name;
  return !(typeof name === "string" && PUBLIC_TOOL_NAMES.has(name));
};

const isPublicMessage = (message: unknown) => {
  if (typeof message !== "object" || message === null) return false;
  const { method, params } = message as { method?: unknown; params?: unknown };
  // Responses to server requests carry no method; keep them authenticated.
  if (typeof method !== "string") return false;
  return !needsAccount(method, params);
};

/**
 * Whether a parsed JSON-RPC body may be served without signing in: anything
 * except calls to tools that use the CDT Express API (and task polling for
 * them). A batch is public only if every message is.
 */
export const isPublicMcpRequest = (body: unknown) =>
  Array.isArray(body)
    ? body.length > 0 && body.every(isPublicMessage)
    : isPublicMessage(body);

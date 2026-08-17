import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import ipaddr from "ipaddr.js";

const MAX_DOCUMENT_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3_000;

type FetchDocument = (url: URL) => Promise<unknown>;

const normalizeIpLiteral = (hostname: string) =>
  hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

export const isPublicIpAddress = (address: string) => {
  try {
    const parsed = ipaddr.parse(normalizeIpLiteral(address));
    if (parsed.kind() === "ipv6") {
      const ipv6 = parsed as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        return ipv6.toIPv4Address().range() === "unicast";
      }
    }
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
};

export const validateCimdUrl = (clientId: string) => {
  const url = new URL(clientId);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === "/"
  ) {
    throw new Error("CIMD client_id must be an HTTPS metadata URL with a path");
  }
  return url;
};

const resolvePublicAddress = async (hostname: string) => {
  const normalized = normalizeIpLiteral(hostname);
  const addresses = ipaddr.isValid(normalized)
    ? [
        {
          address: normalized,
          family: ipaddr.parse(normalized).kind() === "ipv6" ? 6 : 4,
        },
      ]
    : await lookup(normalized, { all: true, verbatim: true });

  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new Error(
      "CIMD hostname does not resolve exclusively to public IP addresses",
    );
  }
  return addresses[0];
};

export const fetchCimdDocument = async (url: URL): Promise<unknown> => {
  const target = await resolvePublicAddress(url.hostname);
  const servername = normalizeIpLiteral(url.hostname);

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: target.address,
        family: target.family,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername,
        rejectUnauthorized: true,
        headers: {
          Accept: "application/json",
          Host: url.host,
          "User-Agent": "cdt-express-mcp-cimd/1.0",
        },
      },
      (response) => {
        if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          response.resume();
          reject(
            new Error(`CIMD fetch returned HTTP ${response.statusCode ?? 0}`),
          );
          return;
        }

        const declaredLength = Number(response.headers["content-length"] || 0);
        if (declaredLength > MAX_DOCUMENT_BYTES) {
          response.resume();
          reject(new Error("CIMD document is too large"));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_DOCUMENT_BYTES) {
            request.destroy(new Error("CIMD document is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.once("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("CIMD document is not valid JSON"));
          }
        });
      },
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("CIMD fetch timed out"));
    });
    request.once("error", reject);
    request.end();
  });
};

export const resolveCimdClient = async (
  clientId: string,
  allowedOrigins?: ReadonlySet<string>,
  fetchDocument: FetchDocument = fetchCimdDocument,
): Promise<OAuthClientInformationFull | undefined> => {
  let url: URL;
  try {
    url = validateCimdUrl(clientId);
  } catch {
    return undefined;
  }
  if (allowedOrigins && !allowedOrigins.has(url.origin)) return undefined;

  try {
    const raw = await fetchDocument(url);
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("client_id" in raw) ||
      raw.client_id !== clientId
    ) {
      return undefined;
    }
    const parsed = OAuthClientMetadataSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    return {
      ...parsed.data,
      client_id: clientId,
      token_endpoint_auth_method:
        parsed.data.token_endpoint_auth_method || "none",
    };
  } catch {
    return undefined;
  }
};

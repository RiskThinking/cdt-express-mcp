import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  InvalidGrantError,
  TemporarilyUnavailableError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";

import { MemoryOAuthStateStore, type OAuthStateStore } from "./oauth-state.js";

import { resolveCimdClient } from "./cimd.js";

export const MCP_SCOPE = "mcp:tools";
export const DEFAULT_CIMD_ORIGIN_POLICY = "*";

const AUTHORIZATION_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

type SealedKind = "client" | "request" | "code" | "access" | "refresh";

type BaseClaims = {
  type: SealedKind;
  issuedAt: number;
  expiresAt?: number;
};

type AuthorizationClaims = {
  clientId: string;
  clientName: string;
  clientUri?: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  resource: string;
};

type CodeClaims = AuthorizationClaims & {
  apiKey: string;
  authorizationId: string;
};

type TokenClaims = {
  grantExpiresAt: number;
  apiKey: string;
  authorizationId: string;
  clientId: string;
  scopes: string[];
  resource: string;
};

class Sealer {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest();
  }

  seal<T extends object>(kind: SealedKind, payload: T, ttlSeconds?: number) {
    const now = Math.floor(Date.now() / 1000);
    const claims: BaseClaims & T = {
      ...payload,
      type: kind,
      issuedAt: now,
      ...(ttlSeconds ? { expiresAt: now + ttlSeconds } : {}),
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(kind));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(claims), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `cdt_${kind}_${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
  }

  open<T extends object>(kind: SealedKind, value: string): BaseClaims & T {
    const prefix = `cdt_${kind}_`;
    if (!value.startsWith(prefix)) {
      throw new Error(`Invalid ${kind}`);
    }

    const packed = Buffer.from(value.slice(prefix.length), "base64url");
    if (packed.length < 29) {
      throw new Error(`Invalid ${kind}`);
    }

    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(Buffer.from(kind));
    decipher.setAuthTag(tag);
    const claims = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        "utf8",
      ),
    ) as BaseClaims & T;

    if (claims.type !== kind) {
      throw new Error(`Invalid ${kind}`);
    }
    if (claims.expiresAt && claims.expiresAt <= Date.now() / 1000) {
      throw new Error(`Expired ${kind}`);
    }
    return claims;
  }
}

class SealedClientsStore implements OAuthRegisteredClientsStore {
  private readonly cimdCache = new Map<
    string,
    { client: OAuthClientInformationFull; expiresAt: number }
  >();

  constructor(
    private readonly sealer: Sealer,
    private readonly allowedCimdOrigins?: ReadonlySet<string>,
  ) {}

  async getClient(
    clientId: string,
  ): Promise<OAuthClientInformationFull | undefined> {
    try {
      const metadata = this.sealer.open<
        Omit<OAuthClientInformationFull, "client_id">
      >("client", clientId);
      const {
        type: _type,
        issuedAt: _issuedAt,
        expiresAt: _expiresAt,
        ...client
      } = metadata;
      return { ...client, client_id: clientId };
    } catch {}

    const cached = this.cimdCache.get(clientId);
    if (cached && cached.expiresAt > Date.now()) return cached.client;
    if (cached) this.cimdCache.delete(clientId);

    const client = await resolveCimdClient(clientId, this.allowedCimdOrigins);
    if (!client) return undefined;
    if (this.cimdCache.size >= 256) {
      const oldest = this.cimdCache.keys().next().value;
      if (oldest) this.cimdCache.delete(oldest);
    }
    this.cimdCache.set(clientId, {
      client,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return client;
  }

  registerClient(
    client: Omit<
      OAuthClientInformationFull,
      "client_id" | "client_id_issued_at"
    >,
  ): OAuthClientInformationFull {
    const clientId = this.sealer.seal("client", client);
    return {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
  }
}

export type OAuthConfig = {
  secret: string;
  issuerUrl: URL;
  resourceUrl: URL;
  veloAuthorizeUrl: URL;
  allowedCimdOrigins?: ReadonlySet<string>;
  stateStore?: OAuthStateStore;
};

export class VeloOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly sealer: Sealer;
  private readonly stateStore: OAuthStateStore;

  constructor(private readonly config: OAuthConfig) {
    this.sealer = new Sealer(config.secret);
    this.stateStore = config.stateStore ?? new MemoryOAuthStateStore();
    this.clientsStore = new SealedClientsStore(
      this.sealer,
      config.allowedCimdOrigins,
    );
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const scopes = params.scopes?.length ? params.scopes : [MCP_SCOPE];
    if (scopes.some((scope) => scope !== MCP_SCOPE)) {
      throw new InvalidScopeError("Only the mcp:tools scope is supported");
    }

    const resource = params.resource?.href ?? this.config.resourceUrl.href;
    if (resource !== this.config.resourceUrl.href) {
      throw new InvalidTargetError(
        "The requested resource is not this MCP server",
      );
    }

    const request = this.sealer.seal<AuthorizationClaims>(
      "request",
      {
        clientId: client.client_id,
        clientName: client.client_name || "AI application",
        clientUri: client.client_uri,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        scopes,
        resource,
      },
      AUTHORIZATION_TTL_SECONDS,
    );
    if (
      !(await this.stateStore.putPending(
        "request",
        this.digest(request),
        Math.floor(Date.now() / 1000) + AUTHORIZATION_TTL_SECONDS,
      ))
    ) {
      throw new TemporarilyUnavailableError(
        "Could not create the authorization request. Try again.",
      );
    }
    const url = new URL(this.config.veloAuthorizeUrl);
    url.searchParams.set("request", request);
    res.redirect(302, url.href);
  }

  describeAuthorizationRequest(request: string) {
    let pending: BaseClaims & AuthorizationClaims;
    try {
      pending = this.sealer.open<AuthorizationClaims>("request", request);
    } catch {
      throw new InvalidGrantError(
        "The authorization request is invalid or expired",
      );
    }
    return {
      client_name: pending.clientName || "AI application",
      client_uri: pending.clientUri,
      redirect_uri: pending.redirectUri,
    };
  }

  async completeVeloAuthorization(
    request: string,
    apiKey: string,
  ): Promise<string> {
    let pending: BaseClaims & AuthorizationClaims;
    try {
      pending = this.sealer.open<AuthorizationClaims>("request", request);
    } catch {
      throw new InvalidGrantError(
        "The authorization request is invalid or expired",
      );
    }

    if (!(await this.stateStore.consume("request", this.digest(request)))) {
      throw new InvalidGrantError(
        "The authorization request has already been completed",
      );
    }

    const code = this.sealer.seal<CodeClaims>(
      "code",
      {
        clientId: pending.clientId,
        clientName: pending.clientName,
        clientUri: pending.clientUri,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        state: pending.state,
        scopes: pending.scopes,
        resource: pending.resource,
        apiKey,
        authorizationId: randomBytes(32).toString("base64url"),
      },
      AUTHORIZATION_TTL_SECONDS,
    );
    if (
      !(await this.stateStore.putPending(
        "code",
        this.digest(code),
        Math.floor(Date.now() / 1000) + AUTHORIZATION_TTL_SECONDS,
      ))
    ) {
      throw new TemporarilyUnavailableError(
        "Could not create the authorization code. Connect again.",
      );
    }
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.state) redirect.searchParams.set("state", pending.state);
    redirect.searchParams.set("iss", this.config.issuerUrl.href);
    return redirect.href;
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const code = this.openCode(client, authorizationCode);
    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = this.openCode(client, authorizationCode);
    if (redirectUri && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError(
        "redirect_uri does not match the authorization request",
      );
    }
    this.assertResource(resource?.href ?? code.resource);
    if (
      !(await this.stateStore.consume("code", this.digest(authorizationCode)))
    ) {
      throw new InvalidGrantError(
        "The authorization code has already been used",
      );
    }
    const grantExpiresAt =
      Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS;
    const tokens = this.issueTokens({
      grantExpiresAt,
      apiKey: code.apiKey,
      authorizationId: code.authorizationId,
      clientId: code.clientId,
      scopes: code.scopes,
      resource: code.resource,
    });
    if (
      !(await this.stateStore.createGrant(
        code.authorizationId,
        this.digest(tokens.refresh_token!),
        grantExpiresAt,
      ))
    ) {
      throw new InvalidGrantError(
        "The authorization has already been redeemed",
      );
    }
    return tokens;
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    let claims: BaseClaims & TokenClaims;
    try {
      claims = this.sealer.open<TokenClaims>("refresh", refreshToken);
    } catch {
      throw new InvalidGrantError("The refresh token is invalid or expired");
    }
    if (
      !Number.isFinite(claims.grantExpiresAt) ||
      claims.grantExpiresAt <= Date.now() / 1000
    ) {
      throw new InvalidGrantError(
        "The authorization expired. Reconnect your account.",
      );
    }
    if (claims.clientId !== client.client_id) {
      throw new InvalidGrantError(
        "The refresh token belongs to another client",
      );
    }
    this.assertResource(resource?.href ?? claims.resource);
    const nextScopes = scopes?.length ? scopes : claims.scopes;
    if (nextScopes.some((scope) => !claims.scopes.includes(scope))) {
      throw new InvalidScopeError(
        "Refresh scopes may not exceed granted scopes",
      );
    }
    // Copy only token claims: never carry the old token's type/expiry forward.
    const tokens = this.issueTokens({
      apiKey: claims.apiKey,
      authorizationId: claims.authorizationId,
      clientId: claims.clientId,
      scopes: nextScopes,
      resource: claims.resource,
      grantExpiresAt: claims.grantExpiresAt,
    });
    if (
      !(await this.stateStore.rotateGrant(
        claims.authorizationId,
        this.digest(refreshToken),
        this.digest(tokens.refresh_token!),
      ))
    ) {
      throw new InvalidGrantError(
        "The refresh token was reused, revoked, or expired. Reconnect your account.",
      );
    }
    return tokens;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let claims: BaseClaims & TokenClaims;
    try {
      claims = this.sealer.open<TokenClaims>("access", token);
      this.assertResource(claims.resource);
    } catch {
      throw new InvalidTokenError("The access token is invalid or expired");
    }
    if (!(await this.stateStore.isGrantActive(claims.authorizationId))) {
      throw new InvalidTokenError(
        "The authorization was revoked or expired. Reconnect your account.",
      );
    }
    return {
      token,
      clientId: claims.clientId,
      scopes: claims.scopes,
      expiresAt: claims.expiresAt,
      resource: this.config.resourceUrl,
      extra: {
        apiKey: claims.apiKey,
        authorizationId: claims.authorizationId,
      },
    };
  }

  private openCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): BaseClaims & CodeClaims {
    try {
      const claims = this.sealer.open<CodeClaims>("code", authorizationCode);
      if (claims.clientId !== client.client_id) throw new Error("Wrong client");
      return claims;
    } catch {
      throw new InvalidGrantError(
        "The authorization code is invalid or expired",
      );
    }
  }

  private assertResource(resource: string) {
    if (resource !== this.config.resourceUrl.href) {
      throw new InvalidTargetError(
        "The token is not valid for this MCP server",
      );
    }
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    let claims: BaseClaims & TokenClaims;
    try {
      const kind = request.token.startsWith("cdt_refresh_")
        ? "refresh"
        : "access";
      claims = this.sealer.open<TokenClaims>(kind, request.token);
      if (
        claims.clientId !== client.client_id ||
        claims.resource !== this.config.resourceUrl.href
      )
        return;
    } catch {
      // RFC 7009: invalid or already-revoked tokens still produce success.
      return;
    }
    await this.stateStore.revokeGrant(claims.authorizationId);
  }

  private digest(value: string) {
    return createHash("sha256").update(value).digest("base64url");
  }

  private issueTokens(claims: TokenClaims): OAuthTokens {
    const remaining = Math.max(
      1,
      claims.grantExpiresAt - Math.floor(Date.now() / 1000),
    );
    const accessTtl = Math.min(ACCESS_TOKEN_TTL_SECONDS, remaining);
    return {
      access_token: this.sealer.seal("access", claims, accessTtl),
      token_type: "Bearer",
      expires_in: accessTtl,
      refresh_token: this.sealer.seal("refresh", claims, remaining),
      scope: claims.scopes.join(" "),
    };
  }
}

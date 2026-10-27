# CDT Express MCP Server

Interact with climate metrics through Riskthinking.AI's CDT Express API in
supported AI chat experiences.

This project contains:

- The core MCP server for the Riskthinking.AI CDT Express API.
- A remote Streamable HTTP server that users can connect to by URL and
  authorize with their VELO account.
- A distributable MCPB extension for Claude Desktop, published through
  [GitHub releases](https://github.com/RiskThinking/cdt-express-mcp/releases).

## Remote MCP

Add this URL as a custom MCP server in a compatible AI app:

```text
https://mcp.riskthinking.ai/mcp
```

The app opens VELO for sign-in or sign-up. After consent, authorization
completes automatically: the CDT API key is provided to the MCP server through
a server-to-server backchannel and is never shown to the AI app, browser URL,
or MCP logs.

- **ChatGPT:** enable Developer mode, create a custom app, and enter the URL.
- **Claude web/desktop:** add a custom connector using the URL.
- **Gemini:** eligible Gemini Spark users can add a custom app using the URL.
  Gemini CLI can also connect to it as a Streamable HTTP MCP server.

See the [remote MCP live-testing guide](docs/remote-mcp-live-testing.md) for
current platform requirements, setup steps, and acceptance checks.

The existing MCPB/stdio package remains available for local-only use.

### Run the remote server

```bash
cp .env.example .env
# Set MCP_OAUTH_SECRET in .env to the output of: openssl rand -base64 48
# Set MCP_REDIS_URL to your Redis connection URL for remote hosting.
npm ci
npm run dev:http
```

Alternatively, build and run the included `Dockerfile`. Remote hosting requires
HTTPS at `MCP_PUBLIC_BASE_URL` and a compatible authorization service at
`VELO_AUTHORIZE_URL`. See [hosting configuration](docs/cloud-run-deployment.md)
and [OAuth state management](docs/oauth-state.md).

The HTTP server provides:

- Streamable HTTP at `/mcp`, with JSON responses for broad client
  compatibility.
- OAuth protected-resource and authorization-server discovery.
- OAuth 2.1 authorization code flow with S256 PKCE and RFC 8707 resource
  binding.
- Client ID Metadata Documents (CIMD) for any standards-compliant HTTPS client,
  with public-IP-pinned fetching, redirect rejection, strict size/time limits,
  and dynamic client registration for backward compatibility.
- Encrypted access tokens lasting up to one hour, rotating refresh tokens,
  and an absolute 30-day authorization lifetime. Redis stores only grant IDs
  and token digests for replay protection, reuse detection, and revocation.
- Exact callback validation against each client's registered or fetched
  metadata, bearer checks on every MCP request, host/origin validation, and
  bounded request bodies. MCP requests do not retain transport sessions.

Remote hosting requires `MCP_OAUTH_SECRET` and a Redis URL or hostname/password.
All instances must share the same secret and Redis database. Rotating the OAuth
secret invalidates client registrations and tokens. Each MCP POST authenticates
independently; the transport does not retain sessions.

## Example prompts

- "Use CDT Express to explain dcr_score and cvar_95 using its metric glossary."
- "Retrieve extreme-heat exposure (hot_days) for Toronto at latitude 43.6532,
  longitude -79.3832, pathway ssp245, horizon 2050."
- "Search for Microsoft, return up to three companies, and retrieve climate
  scores for a returned company under ssp245 in 2050."

A VELO account with CDT Express access and sufficient quota is required. All
40 tools are read-only; API calls may consume account quota. Narrow filters and
paginated tools keep responses small. Bulk tools return CSV across at most 30
pages and time out after 30 seconds. Treat climate projections as estimates
with assumptions and uncertainty.

## Privacy Policy

The connector processes the following data. Publishers must provide a privacy
policy covering their deployment and connected services; this technical overview
does not replace that policy.

- Tool arguments, including coordinates, search terms, and entity IDs, are sent
  to Riskthinking.AI's API. Results are returned to the connected AI app and are
  subject to that app's data handling. This server does not request the whole
  conversation, and does not persist tool arguments or results in a database.
- Remote sign-in occurs in VELO. The account's API key travels to this server
  through the HTTPS callback and is encrypted within opaque authorization codes
  and tokens. It is not returned as plaintext to the AI app. Redis contains only
  grant IDs and digests; see the [record lifetimes](docs/oauth-state.md).
- Local MCPB users supply an API key through the client's sensitive configuration;
  the local process uses it to call the API directly.
- Hosting providers and connected services may maintain their own logs and
  records, subject to their respective privacy and retention policies.

## Support and troubleshooting

Report bugs through [GitHub issues](https://github.com/RiskThinking/cdt-express-mcp/issues).
Include the client, server version, tool name, and sanitized error/status.
Never include API keys, OAuth tokens, authorization URLs, or private data.

- **Sign-in expired:** restart Connect and approve consent within five minutes.
- **401 after connecting:** reconnect; the authorization may have expired, been
  revoked, or been invalidated by token reuse or a server-secret rotation.
- **403 from the API:** confirm your account has access to the requested data.
- **429:** wait before retrying and check account quota or service rate limits.
- **Timeout or large output:** narrow the location, hazards, horizon, or entity
  filters, and use paginated tools rather than bulk tools.
- **Temporary authorization outage:** retry later. Operators should check Redis
  health and network connectivity; the server denies access when storage is down.

For directory publishing, use the
[connector publishing checklist](docs/anthropic-directory-submission.md).

## MCPB Extension Installation

1. Download and install
   [Claude Desktop](https://claude.ai/download).
2. Download `cdt-express.mcpb` from the
   [GitHub releases](https://github.com/RiskThinking/cdt-express-mcp/releases)
   page.
3. In Claude Desktop, open **Settings > Extensions > Advanced settings**.
4. Select **Install Extension** and choose the downloaded MCPB file.
5. When prompted, enter the CDT Express API key from
   [VELO](https://velo.riskthinking.ai/cdt-express).
6. Review and enable the extension, then close the preview.
7. On its first tool call, select **Allow once** or **Always allow**. Tool
   permissions can also be configured under **Settings > Extensions**.

To update the extension, install the newer MCPB file and select **Update**.

## Roadmap

CDT Express Climate API:

- [x] Since `v0.1.0`:
  [Climate exposure metrics](https://api.riskthinking.ai/v4/climate/metrics/exposure)
- [x] Since `v0.2.0`:
  [Climate impact metrics](https://api.riskthinking.ai/v4/climate/metrics/impact)
- [x] Since `v0.2.0`:
  [Probability-adjusted impact](https://api.riskthinking.ai/v4/climate/metrics/probability_adjusted_impact)
- [x] Since `v0.2.0`:
  [Climate exposure distribution](https://api.riskthinking.ai/v4/climate/distribution/exposure)
- [x] Since `v0.2.0`:
  [Climate impact distribution](https://api.riskthinking.ai/v4/climate/distribution/impact)

Other CDT Express APIs:

- [x] Since `v0.3.0`:
  [Physical Assets API](https://api.docs.riskthinking.ai/#tag/Assets)
- [x] Since `v0.3.0`:
  [Companies API](https://api.docs.riskthinking.ai/#tag/Companies)
- [x] Since `v0.3.0`:
  [Markets API](https://api.docs.riskthinking.ai/#tag/Markets)

Integration:

- [x] Since `v0.1.0`: stdio transport for local MCP connectivity, including
  the Claude Desktop extension and IDEs such as Cursor.
- [x] Since `v0.6.0`: authenticated Streamable HTTP transport for remote MCP
  connectivity to web AI chat experiences.

## Development

- Optionally use [nvm](https://github.com/nvm-sh/nvm) with `nvm use` to select
  the Node.js version in `.nvmrc`.
- Install dependencies with `npm install`.
- Build and package the extension with `npm run pack`. The resulting
  `cdt-express.mcpb` file is written to the repository root. The command bundles
  only the local stdio server into an isolated staging directory, leaving the
  remote HTTP/OAuth server and its dependencies out of the extension.
- Run the remote OAuth and MCP integration tests with `npm test`.

## Release

1. Run `npm run bump:version -- <version>`. The command treats `package.json`
   as the source of truth and synchronizes the lockfile, `server.json`,
   `manifest.json`, and the runtime `SERVER_VERSION` constant. It does not
   create a Git tag; the GitHub release does that after the change is merged.
2. Create a GitHub release and tag using the version with a `v` prefix, such as
   `v0.5.2`, from the
   [new release page](https://github.com/RiskThinking/cdt-express-mcp/releases/new).
3. The release workflow validates the versions, builds the MCPB extension, and
   publishes it to the MCP Registry.

### MCP Registry `server.json`

The checked-in file is a valid remote-only server definition. The release
workflow calculates the MCPB hash and download URL, adds the complete
`packages[0]` record, validates the result, and publishes both installation
options together. See the [MCP Registry documentation](https://github.com/modelcontextprotocol/registry)
for the current publishing process.

### MCPB `manifest.json`

`npm run pack` synchronizes the staged manifest version from `package.json`
without modifying the checked-in `manifest.json`. See the
[MCPB manifest specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
for current requirements.

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
npm ci
npm run build
npm run start:http
```

Alternatively, build and run the included `Dockerfile`. Production requires
HTTPS at `MCP_PUBLIC_BASE_URL`. The [Cloud Run disaster-recovery
guide](docs/cloud-run-deployment.md) covers WIF/IAM provisioning, GitHub
configuration, and Cloudflare DNS. Configure the `visual-eyes` deployment with
`CDT_MCP_URL=https://mcp.riskthinking.ai/mcp` so its `/mcp/authorize` route can
complete the authenticated hand-off.

The HTTP server provides:

- Streamable HTTP at `/mcp`, with JSON responses for broad client
  compatibility.
- OAuth protected-resource and authorization-server discovery.
- OAuth 2.1 authorization code flow with S256 PKCE and RFC 8707 resource
  binding.
- Client ID Metadata Documents (CIMD) for any standards-compliant HTTPS client,
  with public-IP-pinned fetching, redirect rejection, strict size/time limits,
  and dynamic client registration for backward compatibility.
- One-hour encrypted access tokens and 30-day encrypted refresh tokens, with
  no credential database required.
- Exact callback validation against each client's registered or fetched
  metadata, bearer checks on every MCP request, per-authorization session
  binding, host/origin validation, and bounded request bodies.

`MCP_OAUTH_SECRET` is the only durable secret and must be shared by all remote
MCP instances. Rotating it invalidates existing client registrations and
tokens. The current TypeScript SDK negotiates MCP through `2025-11-25`, which
the major hosted clients currently use. The endpoint is structured for the
stateless `2026-07-28` transport and can switch when the stable TypeScript SDK
exposes that protocol revision.

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
- Build and package the extension with `npm run pack:dev`. The resulting
  `cdt-express.mcpb` file is written to the repository root. Unlike `npm run
  pack`, this command reinstalls development dependencies after packaging.
- Run the remote OAuth and MCP integration tests with `npm test`.

## Release

1. Bump and synchronize the version in `package.json` and the `SERVER_VERSION`
   constant in `src/constants.ts`, without the `v` prefix.
2. Create a GitHub release and tag using the version with a `v` prefix, such as
   `v0.5.2`, from the
   [new release page](https://github.com/RiskThinking/cdt-express-mcp/releases/new).
3. The release workflow validates the versions, builds the MCPB extension, and
   publishes it to the MCP Registry.

### MCP Registry `server.json`

The release workflow calculates and injects `version`, `package[0].sha256`, and
`package[0].identifier`, so they are intentionally not kept in version control.
See the [MCP Registry documentation](https://github.com/modelcontextprotocol/registry)
for the current publishing process.

### MCPB `manifest.json`

`npm run pack` synchronizes the manifest version from `package.json`. The pack
command then restores `manifest.json` with `git checkout`, so commit any other
manifest changes before packaging. See the
[MCPB manifest specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
for current requirements.

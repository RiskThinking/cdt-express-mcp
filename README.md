# CDT Express MCP Server

Interact with climate metrics via Riskthinking.AI's CDT Express API in supported AI chat experiences.

This project contains:
- The core MCP server that can be used to interact with Riskthinking.AI's CDT Express API.
- A remote Streamable HTTP server that users can connect to by URL and authorize with their VELO account.
- Distributable MCPB extension for the Claude desktop app in [releases](https://github.com/RiskThinking/cdt-express-mcp/releases).

## Remote MCP

Once deployed, add the following URL as a custom MCP server in a compatible AI app:

```text
https://mcp.riskthinking.ai/mcp
```

The app opens VELO for sign-in or sign-up. After that, authorization completes automatically: the CDT API key is transferred server-to-server and is never shown to the AI app, browser URL, or MCP logs.

- **ChatGPT:** enable Developer mode, add a custom plugin/connector, and enter the URL above.
- **Claude web/desktop:** add a custom connector using the URL above. Claude API callers can obtain an OAuth token with the same flow and pass it as `authorization_token`.
- **Gemini:** use the URL as a Streamable HTTP MCP server. Availability of custom remote servers in consumer Gemini surfaces depends on the Google product/account; the Gemini Interactions API accepts remote MCP URLs.

The existing MCPB/stdio package remains available for local-only use.

### Run the remote server

```bash
cp .env.example .env
# Set MCP_OAUTH_SECRET to: openssl rand -base64 48
npm ci
npm run build
npm run start:http
```

Or build and run the included `Dockerfile`. Production requires HTTPS at `MCP_PUBLIC_BASE_URL`. The [Cloud Run deployment guide](docs/cloud-run-deployment.md) covers WIF/IAM provisioning, GitHub configuration, and the Cloudflare DNS mapping. Configure the `visual-eyes` deployment with `CDT_MCP_URL=https://mcp.riskthinking.ai/mcp` so its `/mcp/authorize` route can complete the authenticated handoff.

The HTTP server provides:

- Streamable HTTP at `/mcp`, with JSON responses for broad client compatibility.
- OAuth protected-resource and authorization-server discovery.
- OAuth 2.1 authorization code flow with S256 PKCE and RFC 8707 resource binding.
- CIMD for current clients and dynamic client registration for backward compatibility.
- One-hour encrypted access tokens and 30-day encrypted refresh tokens. No credential database is required.
- Strict callback-origin allowlisting, bearer checks on every MCP request, per-token session binding, host/origin validation, and bounded request bodies.

`MCP_OAUTH_SECRET` is the only durable secret and must be shared by all remote MCP instances. Rotating it invalidates existing client registrations and tokens. The current TypeScript SDK negotiates MCP through `2025-11-25`, which is what the major hosted clients currently use; the endpoint is deliberately structured for the stateless `2026-07-28` transport and can switch once the stable TypeScript SDK exposes that protocol revision.

## MCPB Extension Installation

1. Download and install the Claude app from https://claude.ai/download.
2. Download the `cdt-express.mcpb` file from the [releases](https://github.com/RiskThinking/cdt-express-mcp/releases) page.
3. Open the Claude Desktop app, go to "Settings" -> "Extensions" -> "Advanced settings".
4. Click on "Install Extension", select the downloaded `cdt-express.mcpb` file.
5. Click on "Install".
6. When prompted, enter your CDT Express API key, which is available at https://velo.riskthinking.ai/cdt-express.
7. Review and enable the extension, then close the preview.
8. The extension will be installed and you can use it in the app.
9. When using for the first time, you may see the following prompt requesting for permission to use the extension provided tools, click on "Allow once" or "Always allow".
  a. Alternatively, you can manually configure in "Settings" -> "Extensions", and configure the Tool permissions for this extension.
10. To update a new version, simply follow the same steps to "Install Extension", and click on "Update".

## Roadmap

CDT Express Climate API:
- [x] Since `v0.1.0`: [Climate exposure metrics](https://api.riskthinking.ai/v4/climate/metrics/exposure)
- [x] Since `v0.2.0`: [Climate impact metrics](https://api.riskthinking.ai/v4/climate/metrics/impact)
- [x] Since `v0.2.0`: [Probability-adjusted impact](https://api.riskthinking.ai/v4/climate/metrics/probability_adjusted_impact)
- [x] Since `v0.2.0`: [Climate exposure distribution](https://api.riskthinking.ai/v4/climate/distribution/exposure)
- [x] Since `v0.2.0`: [Climate impact distribution](https://api.riskthinking.ai/v4/climate/distribution/impact)

Other CDT Express APIs:
- [x] Since `v0.3.0`: [Physical Assets API](https://api.docs.riskthinking.ai/#tag/Assets)
- [x] Since `v0.3.0`: [Companies API](https://api.docs.riskthinking.ai/#tag/Companies)
- [x] Since `v0.3.0`: [Markets API](https://api.docs.riskthinking.ai/#tag/Markets)

Integration:
- [x] Since `v0.1.0`: Support Stdio transport for local MCP server connectivity (e.g. extension for Claude desktop app and IDEs such as Cursor.)
- [x] Since `v0.6.0`: Support authenticated Streamable HTTP transport for remote MCP server connectivity to web AI chat experiences.

## Development

- [Optional] Use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
  - `nvm use` to use the version specified in `.nvmrc`.
- Install dependencies: `npm i`
- Build and package the extension: `npm run pack:dev`. You should find the `cdt-express.mcpb` file in the root directory.
  - This command is different from `npm run pack` in that it installs back the development dependencies after packaging.
- Run the remote OAuth + MCP integration test: `npm test`.

## Release

1. [Human] Bump and sync the version in `package.json` and `src/constants.ts` (constant `SERVER_VERSION`), without the `v` prefix (e.g. `0.5.2` instead of `v0.5.2`.)
2. [Human] Create a new git tag with the new version, with the `v` prefix (e.g. `v0.5.2`). Typically do this through a new GitHub Release https://github.com/RiskThinking/cdt-express-mcp/releases/new, which has the advantage of ensuring code integrity and avoid unexpected local commits/changes.
3. [CI/CD] The GitHub Actions workflow will be triggered, and the MCPB extension will be built and published to the MCP Registry.
  - The version across the git tag and package.json are checked to ensure consistency.

### MCP Registry `server.json`

The `version`, `package[0].sha256`, and `package[0].identifier` fields in `server.json` are automatically calculated and injected by the GitHub Actions workflow, therefore intentionally not kept in version control.

Please refer to https://github.com/modelcontextprotocol/registry for latest details on the MCP Registry and track potential changes to the process.

### MCPB `manifest.json`

The `version` field in `manifest.json` is automatically synced with the version in `package.json` by the `npm run sync-manifest` command (invoked by `npm run pack`), therefore intentionally not kept in version control. If you intend to make any `manifest.json` changes other than `version`, you should make sure to commit the changes before running `npm run pack` as it would reset (by `git checkout manifest.json`) the whole file.

Please refer to https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md for the latest MCPB manifest specification.

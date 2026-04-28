# CDT Express MCP Server

Interact with climate metrics via Riskthinking.AI's CDT Express API in supported AI chat experiences.

This project contains:
- The core MCP server that can be used to interact with Riskthinking.AI's CDT Express API.
- Distributable MCPB extension for the Claude desktop app in [releases](https://github.com/RiskThinking/cdt-express-mcp/releases).

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
- [ ] Support Streamable HTTP transport for remote MCP server connectivity to support web AI chat experiences.

## Development

- [Optional] Use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
  - `nvm use` to use the version specified in `.nvmrc`.
- Install dependencies: `npm i`
- Build and package the extension: `npm run pack:dev`. You should find the `cdt-express.mcpb` file in the root directory.
  - This command is different from `npm run pack` in that it installs back the development dependencies after packaging.

### Versioning

To bump the version of the project:
- Update the version in package.json by running `npm --no-git-tag-version version <major|minor|patch>`.
- Update the version in manifest.json to match the version in package.json.

In CI/CD workflows, the version is checked to ensure consistency across the manifest, package, and git tag.

## Release

The process is automated through GitHub Actions. For details, see [.github/workflows/release.yml](.github/workflows/release.yml).

In a nutshell, the process is as follows:
- [Human] Bump and sync the version in package.json (see [Development/Versioning](#versioning) section) and `src/server.ts` (constant `SERVER_VERSION`), without the `v` prefix (e.g. `0.5.2` instead of `v0.5.2`.)
- [Human] Create a new git tag with the new version, with the `v` prefix (e.g. `v0.5.2`). Typically do this through a new GitHub Release https://github.com/RiskThinking/cdt-express-mcp/releases/new, which has the advantage of ensuring code integrity and avoid unexpected local commits/changes.
- [CI/CD] The GitHub Actions workflow will be triggered, and the MCPB extension will be built and published to the MCP Registry.
  - The version across the git tag and package.json are checked to ensure consistency.

### MCP Registry `server.json`

The `version`, `package[0].sha256`, and `package[0].identifier` fields in `server.json` are automatically calculated and injected by the GitHub Actions workflow, therefore intentionally not kept in version control.

Please refer to https://github.com/modelcontextprotocol/registry for latest details on the MCP Registry and track potential changes to the process.

### MCPB `manifest.json`

The `version` field in `manifest.json` is automatically synced with the version in `package.json` by the `npm run sync-manifest` command (invoked by `npm run pack`), therefore intentionally not kept in version control.

Please refer to https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md for the latest MCPB manifest specification.

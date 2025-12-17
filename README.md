# CDT Express MCP Server

Interact with climate metrics via Riskthinking.AI's CDT Express API in supported AI chat experiences.

This project contains:
- The core MCP server that can be used to interact with Riskthinking.AI's CDT Express API.
- Distributable MCPB extension for the Claude desktop app in [releases](https://github.com/riskthinking-ai/cdt-express-mcp/releases).

## MCPB Extension Installation

1. Download and install the Claude app from https://claude.ai/download.
2. Download the `cdt-express.mcpb` file from the [releases](https://github.com/riskthinking-ai/cdt-express-mcp/releases) page.
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
- [ ] [Physical Assets API](https://api.docs.riskthinking.ai/#tag/Assets)
- [ ] [Companies API](https://api.docs.riskthinking.ai/#tag/Companies)
- [ ] [Markets API](https://api.docs.riskthinking.ai/#tag/Markets)

Integration:
- [x] Since `v0.1.0`: Support Stdio transport for local MCP server connectivity (e.g. extension for Claude desktop app and IDEs such as Cursor.)
- [ ] Support Streamable HTTP transport for remote MCP server connectivity to support web AI chat experiences.

## Development

- [Optional] Use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
  - `nvm use` to use the version specified in `.nvmrc`.
- Install dependencies: `npm i`
- Build the project (transpiles the TypeScript files to portable JavaScript): `npm run build`
- Package the extension: `npm run pack:dev`. You should find the `cdt-express.mcpb` file in the root directory.
  - This command is different from `npm run pack` in that it installs back the development dependencies after packaging.

To bump the version of the project:
- Update the version in package.json by running `npm --no-git-tag-version version <major|minor|patch>`.
- Update the version in manifest.json to match the version in package.json.

In CI/CD workflows, the version is checked to ensure consistency across the manifest, package, and git tag.

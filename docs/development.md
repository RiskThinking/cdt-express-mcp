# Development and releases

## Build and test

Use the Node.js version in `.nvmrc` (`nvm use` if available), then run:

```bash
npm ci
npm test
npm run pack
npm run smoke
```

`npm test` builds the TypeScript sources and verifies version consistency,
OAuth behavior, input handling, and tool metadata. Redis integration tests run
when `MCP_TEST_REDIS_URL` points to disposable Redis; see
[OAuth state management](oauth-state.md). Never use a shared or production
Redis database for the test suite.

`npm run pack` creates `cdt-express.mcpb` in the repository root. It bundles the
stdio server and its dependencies, excluding remote HTTP, OAuth, and Redis
modules. `npm run smoke` verifies the built stdio entry point can initialize
and list tools.

To run the HTTP entry point, copy `.env.example` to `.env`, configure the
required values, and run `npm run dev:http`. Self-hosting requires a compatible
authorization service; use the [hosting guide](cloud-run-deployment.md).

## Release

1. Run `npm run bump:version -- <version>`. This updates `package.json`, the
   lockfile, `manifest.json`, `server.json`, and the runtime version constant.
   It does not create a Git tag.
2. Verify the build, tests, and MCPB, then commit and push the changes. If the
   release changes `public/` (icons), confirm the Cloud Run deployment serves
   the new files before tagging: the registry record and the initialize
   response point at `https://mcp.riskthinking.ai/icon-*.png`.
3. Create a GitHub release with the matching `v`-prefixed tag, targeting the
   verified commit.
4. Confirm the release workflow uploads `cdt-express.mcpb` and publishes the
   server metadata to the MCP Registry.

`server.json` is a remote-only source definition. The release workflow adds the
MCPB download URL and checksum to the published registry record. Package
versions in the staged MCPB manifest are synchronized from `package.json`.

## Server identity

The title, description, website, icons, and agent instructions sent in the
`initialize` response live in `src/constants.ts`. Keep `server.json` (`title`,
`websiteUrl`, `icons`) and `manifest.json` (`homepage`) aligned with them;
`npm test` checks this, along with the registry's 100-character description
limit and that every tool named in the instructions exists. Icons are in
`public/`, served by the remote deployment, and `public/icon-512.png` is
bundled as the MCPB icon. The remote deployment also serves a landing page at
`/` for people who open the server URL in a browser.

Reference specifications:

- [MCP Registry](https://github.com/modelcontextprotocol/registry)
- [MCPB manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
- [Connector publishing checklist](anthropic-directory-submission.md)

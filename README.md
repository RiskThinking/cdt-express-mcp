# CDT Express MCP

Explore climate hazards, physical assets, companies, and market climate risk
with [Riskthinking.AI](https://riskthinking.ai) data in your AI app.

## Connect by URL (recommended)

Use the hosted **Streamable HTTP** server. You need a
[VELO account with CDT Express access](https://velo.riskthinking.ai/cdt-express).

```text
https://mcp.riskthinking.ai/mcp
```

1. **Add a custom MCP connection** in your AI app. Name it **CDT Express** and
   paste the URL above. If asked for a transport, choose **Streamable HTTP**.
2. **Connect with OAuth.** Sign in to VELO and approve access. Keep automatic
   client registration or the client's published identity selected; leave manual
   client ID, client secret, and API key fields empty. Depending on your app,
   sign-in happens when you add the connection or the first time CDT Express
   fetches data; you can browse the tools and metric definitions before that.
3. **Enable CDT Express in your conversation** and try a prompt below.

Where to add the connection:

| App | Setup |
| --- | --- |
| Claude web or Desktop | **Customize → Connectors → + Add → Add custom connector**. [Setup guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |
| ChatGPT | **Plugins → + → Add custom MCP server**. [Setup guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) |
| Other MCP clients | Add a remote server with the URL above and OAuth authentication. |

Custom connections depend on your app and workspace permissions. A workspace
administrator may need to add or allow the connection first. No local server
installation or API key is needed for the remote connection.

## Try it

- “Explain dcr_score and cvar_95 using the CDT Express metric glossary.”
- “Show extreme-heat exposure for Toronto at latitude 43.6532, longitude
  -79.3832, under ssp245 in 2050.”
- “Find Microsoft in CDT Express and retrieve its climate risk scores for
  ssp245 in 2050.”

The 30 read-only tools cover climate exposure and impact metrics, hazard
distributions, assets, companies, and market indexes. List tools return one
page at a time, or every page as CSV with `fetch_all`; results also come as
structured JSON for apps that support it. Available data depends on your
account permissions; API calls may consume your quota. Use narrower filters or
ask for a small sample when exploring large datasets.

The `list_all_*` and `get_all_*` tools are deprecated and will be removed in
0.9.0; use the matching list tool with `fetch_all: true`.

## Local Claude Desktop extension (MCPB)

The MCPB runs the connector on your computer and uses your CDT Express API key.
It still needs an internet connection to retrieve data.

1. Install [Claude Desktop](https://claude.ai/download) and
   [download the latest `cdt-express.mcpb`](https://github.com/RiskThinking/cdt-express-mcp/releases/latest/download/cdt-express.mcpb).
2. Open **Settings → Desktop app**, select **Manage** next to **Extensions**,
   then **Advanced settings → Install Extension** and choose the file. Older
   Claude versions show **Settings → Extensions → Advanced settings**.
3. Enter your API key from [VELO](https://velo.riskthinking.ai/cdt-express),
   finish installation, and enable the extension's tools in your conversation.

To update, install the newer MCPB and choose **Update**. See
[Claude's extension guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
if the settings differ in your version.

## UTCP

[UTCP](https://www.utcp.io/) clients call the CDT Express API directly, with no
server in between. Register this manual:

```text
https://mcp.riskthinking.ai/utcp
```

It describes the same tools as the MCP server, except the `fetch_all` option
and the deprecated `list_all_*` tools. List parameters such as `risk_factor`,
`pathway`, and `horizon` are comma-separated strings. Calls use your CDT
Express API key from [VELO](https://velo.riskthinking.ai/cdt-express), set as
the `CDT_API_KEY` variable. The metric glossary needs no key.

With the TypeScript SDK (`@utcp/sdk` and `@utcp/http`), variables are prefixed
with the manual name:

```ts
import "@utcp/http";
import { UtcpClient } from "@utcp/sdk";

const client = await UtcpClient.create(process.cwd(), {
  manual_call_templates: [
    {
      name: "cdtexpress",
      call_template_type: "http",
      http_method: "GET",
      url: "https://mcp.riskthinking.ai/utcp",
    },
  ],
  variables: { cdtexpress_CDT_API_KEY: process.env.CDT_API_KEY },
});
const exposure = await client.callTool(
  "cdtexpress.get_climate_metrics_exposure",
  { latitude: 43.6532, longitude: -79.3832, risk_factor: "hot_days", horizon: "2050" },
);
```

Other UTCP clients report the exact variable name they expect when it is
missing. Each release also attaches `utcp.json` and `tools.json` (MCP tool
metadata).

## Need help?

- **Can't add a connection?** Check that your app and workspace allow custom MCP
  servers. Use the setup guide for your client above.
- **Sign-in expired or access stopped?** Disconnect and reconnect to authorize
  again. For local MCPB, check the API key in the extension settings.
- **Permission or quota error?** Check your CDT Express access and usage in VELO.
- **Large response or timeout?** Narrow the filters or request fewer results.

[Report an issue](https://github.com/RiskThinking/cdt-express-mcp/issues) with your
client, tool name, and error message. Remove API keys, tokens, authorization
URLs, and private data before sharing. More detailed checks are in the
[client testing guide](docs/remote-mcp-live-testing.md).

## Privacy

Read [RiskThinking.ai’s Privacy Policy](https://riskthinking.ai/privacy-policy).

Tool inputs, such as coordinates and company searches, are sent to the CDT
Express API; results return to your AI app. The connector does not request your
whole conversation. Remote authorization uses VELO; the local extension uses
the API key you configure in Claude. Your AI app and connected services apply
their respective data-handling policies.

## For developers

See [development and releases](docs/development.md),
[hosting configuration](docs/cloud-run-deployment.md), and
[OAuth state management](docs/oauth-state.md). This project is
[MIT licensed](LICENSE).

# Remote MCP client testing

Public endpoint:

```text
https://mcp.riskthinking.ai/mcp
```

Use a test account with CDT Express access and data that can be shared with the
AI client. Client availability and settings depend on the platform, plan, and
workspace policy; consult the vendor documentation.

## Endpoint checks

```bash
curl --fail --silent --show-error https://mcp.riskthinking.ai/health
curl --fail --silent --show-error \
  https://mcp.riskthinking.ai/.well-known/oauth-protected-resource/mcp
curl --fail --silent --show-error \
  https://mcp.riskthinking.ai/.well-known/oauth-authorization-server
```

Health and discovery should return HTTP 200. An MCP request without a bearer
token should return HTTP 401 with protected-resource discovery information in
`WWW-Authenticate`.

## Browser authorization

1. Add the endpoint as a custom connector in the client. Leave manual OAuth
   client credentials empty when the client supports discovery and registration.
2. Connect and confirm the browser opens VELO for sign-in and consent.
3. Approve access and confirm the browser returns to the client.
4. Discover the tools and run the example prompts below.
5. Test sign-up, email verification, cancellation, refresh, and reconnect.

The browser should never ask for a CDT API key during remote OAuth, and the key
must not appear in URLs. Refresh should preserve access without requiring the
user to paste credentials. MCP requests do not require session affinity.

Client setup references:

- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [ChatGPT developer mode](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta)
- [Gemini custom apps](https://support.google.com/gemini/answer/17209137)

## Example prompts

- “Use CDT Express to give me the official definition of dcr_score.”
  Expected tool: `get_metrics_definition`.
- “Retrieve extreme-heat exposure (hot_days) for Toronto at latitude 43.6532,
  longitude -79.3832, pathway ssp245, horizon 2050.”
  Expected tool: `get_climate_metrics_exposure`.
- “Search CDT Express for Microsoft and return at most three matches.”
  Expected tool: `search_companies`.

Confirm at least one successful authenticated API response in addition to the
local glossary. Exercise each tool with representative inputs and account
permissions before publishing a connector listing.

## Gemini CLI

Follow the [Gemini CLI MCP configuration guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md).
A Streamable HTTP entry can use:

```json
{
  "mcpServers": {
    "cdt-express": {
      "httpUrl": "https://mcp.riskthinking.ai/mcp"
    }
  }
}
```

Use the client's authentication command to complete browser OAuth. Do not put
an API key in the remote connector configuration.

## Disconnect and revocation

Remove or disconnect the connector and verify that the client no longer offers
its tools. Verify server-side revocation separately: `/revoke` invalidates an
authorization and its access/refresh tokens. Reconnect and confirm a new
authorization succeeds.

## Troubleshooting

- Check endpoint reachability and client eligibility if adding a connector fails.
- Restart Connect if an authorization request has expired.
- Reconnect after a 401; authorization may have expired or been revoked.
- Check API permissions for downstream 401/403 responses.
- Check that the client stores each rotated refresh token if access fails after
  token expiry.
- Use narrower filters or pagination for timeouts and large responses.

When sharing diagnostics, redact authorization codes, bearer tokens, sealed
`cdt_*` values, cookies, API keys, and private deployment identifiers.

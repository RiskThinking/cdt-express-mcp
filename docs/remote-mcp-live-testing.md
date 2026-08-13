# Remote MCP live testing

This runbook validates the production CDT Express remote MCP integration after
the corresponding VELO changes are deployed.

Tested endpoint:

```text
https://mcp.riskthinking.ai/mcp
```

The platform instructions below were checked against vendor documentation on
2026-08-12. Product names, eligibility, and menu locations can change.

## 1. Preconditions

Use a non-production test user whose CDT Express data can safely be exposed to
the AI platform under test. The user should either already have a VELO account
with CDT Express access, or have access to an inbox that can complete sign-up
and email verification.

Confirm that:

- The latest `cdt-express-mcp` revision is serving production traffic.
- The VELO revision containing the MCP authorize, consent, and verification
  return-path changes is deployed to `https://velo.riskthinking.ai`.
- The test user has an active CDT Express subscription and an API key in VELO.
- Pop-up blocking does not prevent the platform from opening OAuth in a browser.

Run this preflight before testing a client:

```bash
curl --fail --silent --show-error https://mcp.riskthinking.ai/health

curl --fail --silent --show-error \
  https://mcp.riskthinking.ai/.well-known/oauth-protected-resource/mcp

curl --fail --silent --show-error \
  https://mcp.riskthinking.ai/.well-known/oauth-authorization-server

curl --silent --show-error --dump-header - --output /dev/null \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  https://mcp.riskthinking.ai/mcp
```

Expected results:

- `/health` returns HTTP 200 and `{"status":"ok"}`.
- Both discovery endpoints return HTTP 200.
- Protected-resource metadata names `https://mcp.riskthinking.ai/mcp` as the
  resource and `https://mcp.riskthinking.ai/` as its authorization server.
- Authorization-server metadata advertises authorization code, refresh token,
  S256 PKCE, and a registration endpoint.
- The unauthenticated MCP request returns HTTP 401 with a `WWW-Authenticate`
  header pointing at the protected-resource metadata.

## 2. OAuth acceptance flow

Run the normal flow once on each platform:

1. Add `https://mcp.riskthinking.ai/mcp` as a custom MCP server/app/connector.
2. Start the platform's Connect, Authenticate, or Scan tools action.
3. Confirm that the browser is sent to `velo.riskthinking.ai`, never asked to
   paste a CDT Express API key, and never displays the key in a URL.
4. Sign in to VELO, review the CDT Express consent screen, and approve it.
5. Confirm that the browser returns to the originating AI platform.
6. Confirm that CDT Express tools are discovered and can be enabled in a chat.

Also exercise the recently repaired branches on at least one platform:

- **Sign-up:** begin from a logged-out browser, create a VELO account, verify
  the email, sign in, approve consent, and confirm the original MCP hand-off
  resumes without adding the server again.
- **Unverified existing user:** start MCP authorization while signed in but
  unverified, complete verification, and confirm the same return behavior.
- **Consent rejection:** choose Cancel or Deny and confirm no connector is
  linked and no tool can access CDT Express data.
- **Refresh continuity:** keep a connected chat/session open for more than one
  hour, then invoke another tool. It should refresh authorization without a 403,
  losing the MCP session, or requiring the API key again.

## 3. Common tool smoke tests

Use explicit prompts so the platform does not answer from general knowledge.
Where supported, select or `@`-mention the CDT Express app first.

```text
Use the CDT Express tool to give me the official definition of dcr_score.
State the exact tool name you called.
```

Expected tool: `get_metrics_definition`.

```text
Use CDT Express to retrieve physical climate exposure metrics for Toronto at
latitude 43.6532 and longitude -79.3832, pathway ssp245, horizon 2050, for
extreme heat (hot_days). State the exact tool name you called and summarize the
returned data without inventing missing values.
```

Expected tool: `get_climate_metrics_exposure` and a successful CDT API result.

```text
Use CDT Express to search public companies for Microsoft. Return at most three
matches and state the exact tool name you called.
```

Expected tool: `search_companies`. Results depend on the test user's CDT access.

For each platform, record whether tool discovery, OAuth, consent, the glossary
call, an authenticated API call, disconnect, and reconnect all pass.

## 4. ChatGPT

Current requirements and controls are documented in [Developer mode and MCP
apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta).
Developer mode availability and publishing permissions depend on the plan and
workspace role. ChatGPT connects to the remote endpoint; it does not need a
locally running MCP process.

1. In ChatGPT, open **Settings > Apps > Advanced settings** and enable
   **Developer mode**. A workspace admin may need to enable access first.
2. From user settings, go to **Apps > Create**. Workspace admins can instead use
   **Workspace settings > Apps > Create**.
3. Name the app `CDT Express` and enter
   `https://mcp.riskthinking.ai/mcp` as its MCP endpoint.
4. Select OAuth as the authentication mechanism. Do not enter a client ID,
   client secret, API key, or custom headers; discovery and client registration
   are automatic.
5. Select **Scan tools**, complete the VELO OAuth and consent flow, wait for the
   scan to finish, and create the app.
6. Start a new chat and select the development app from the Apps/tools picker,
   then run the common smoke prompts.
7. If the ChatGPT desktop client exposes the same enabled development app for
   the account, repeat one tool call there. Treat web as the primary acceptance
   surface when the desktop build or workspace does not expose developer apps.

Expected: the app is labelled as a development app, its CDT Express tools are
listed after scanning, and invocation shows the selected tool and its result.

## 5. Claude web and Desktop

Anthropic documents current setup in [Get started with custom connectors using
remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
Remote custom connectors are available on Claude Pro, Max, Team, and Enterprise.
For Team and Enterprise, an Owner must add the connector for the organization
before members connect their own accounts.

For Pro or Max:

1. Open **Customize > Connectors** in Claude.
2. Select **+ > Add custom connector**.
3. Name it `CDT Express` and enter `https://mcp.riskthinking.ai/mcp`.
4. Leave advanced client ID and client secret fields empty.
5. Add the connector, select **Connect**, and complete VELO OAuth and consent.

For Team or Enterprise, an Owner first uses **Organization settings >
Connectors > Add > Custom > Web** with the same URL. Each member then opens
**Customize > Connectors** and selects **Connect** individually.

In a new conversation, use **+ > Connectors** to enable CDT Express and run the
common smoke prompts. Then open Claude Desktop under the same Claude account,
enable the remote connector, and repeat an authenticated tool call. Do not add
this remote connector to `claude_desktop_config.json`; that file configures the
separate local stdio mechanism.

## 6. Gemini web and mobile

Google documents the current flow in [Connect and manage custom apps for Gemini
Spark](https://support.google.com/gemini/answer/17209137). At the time of this
runbook, direct custom MCP apps require Gemini Spark eligibility, age 18+, a
personal US Google account, English, and Keep Activity enabled. Work/school
accounts are not eligible for this consumer flow.

1. On `gemini.google.com`, open **Settings & help > Connected Apps**. In some
   layouts this is under **Personal Intelligence > Connected Apps**.
2. Under **Custom apps for Spark**, select **Add a custom app**.
3. Enter `https://mcp.riskthinking.ai/mcp` and select **Next**.
4. Leave Advanced features credentials empty; the server supports dynamic
   client registration.
5. Complete VELO OAuth and consent.
6. In Gemini Spark, type `@`, select CDT Express, and run the smoke prompts.

Custom apps must be added on the web. Once linked, they can also be used in
Gemini Spark on mobile. If **Custom apps for Spark** is absent, record the test
as blocked by account/product eligibility and use Gemini CLI for an independent
Gemini-client test.

## 7. Gemini CLI

Gemini CLI provides a practical desktop fallback and supports automatic OAuth
discovery for Streamable HTTP MCP servers. See Google's [MCP server
configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md).

Merge this entry into `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "cdt-express": {
      "httpUrl": "https://mcp.riskthinking.ai/mcp"
    }
  }
}
```

Start or reload Gemini CLI, then run:

```text
/mcp auth cdt-express
/mcp list
/mcp schema
```

The auth command should open the local browser, complete VELO OAuth and consent,
and return to a loopback callback owned by Gemini CLI. Run the common smoke
prompts after `cdt-express` reports as connected. No API key belongs in
`settings.json`.

## 8. Disconnect and revocation checks

For every tested platform:

1. Disconnect or remove CDT Express in the platform's app/connector settings.
2. Confirm a new chat cannot invoke its tools.
3. Re-add it and confirm OAuth requires consent again.
4. Confirm neither browser history nor copied callback URLs contain the CDT API
   key or an MCP bearer/refresh token.

The current shim is stateless and does not maintain a server-side grant list.
Disconnecting removes the platform's stored tokens. Rotating the user's CDT API
key in VELO or rotating `MCP_OAUTH_SECRET` invalidates existing credentials; the
latter signs out every connected MCP client.

## 9. Troubleshooting

- **Server cannot be added or tools cannot be scanned:** run all preflight
  curls, verify the exact URL ends in `/mcp`, and check platform eligibility
  and workspace policy.
- **OAuth opens but VELO reports an invalid or expired request:** confirm the
  VELO and MCP production revisions match. Retry from a fresh Connect action
  instead of reusing browser history.
- **Login or verification lands on a generic VELO page:** confirm production
  VELO includes the MCP return-path changes and that cookies are allowed.
- **Consent succeeds but the AI platform never reconnects:** inspect the final
  redirect origin, verify the MCP server allows that platform callback, and
  check Cloud Run logs for `/authorize`, `/token`, and `/oauth/velo/callback`.
- **A tool call returns 401:** disconnect and reconnect, then check token and
  refresh exchange logs and OAuth metadata.
- **A tool call returns 403 after about one hour:** check that the deployed
  session binding uses the stable authorization identity rather than the raw
  access token.
- **A tool call returns a CDT API 401/403:** verify the VELO user's subscription
  and API key. This is downstream API authorization, not MCP OAuth discovery.
- **Only one platform fails callback validation:** capture the rejected
  `redirect_uri` origin from sanitized logs and compare it with
  `MCP_ALLOWED_REDIRECT_ORIGINS`. Never log codes, tokens, or API keys.

Useful Cloud Run log query:

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"

gcloud run services logs read cdt-express-mcp \
  --project="$PROJECT_ID" \
  --region=northamerica-northeast1 \
  --limit=100
```

Adjust the project or service name if the production GitHub variables differ.
When sharing evidence, redact authorization codes, bearer tokens, sealed
`cdt_*` values, cookies, and API keys.

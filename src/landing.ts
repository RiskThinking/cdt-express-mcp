import {
  SERVER_DESCRIPTION,
  SERVER_TITLE,
  SERVER_VERSION,
  WEBSITE_URL,
} from "./constants.js";

const REPOSITORY_URL = "https://github.com/RiskThinking/cdt-express-mcp";
const PRIVACY_URL = "https://riskthinking.ai/privacy-policy";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );

/** Static page for people who open the MCP endpoint's origin in a browser. */
export const renderLandingPage = (resourceUrl: URL) => {
  const endpoint = escapeHtml(resourceUrl.href);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(SERVER_TITLE)}</title>
<meta name="description" content="${escapeHtml(SERVER_DESCRIPTION)}">
<link rel="icon" href="/icon-192.png" type="image/png">
<style>
:root { color-scheme: light dark; --fg: #1a1d1b; --muted: #5b625e; --bg: #fff; --panel: #f3f5f3; --accent: #1f5c3a; }
@media (prefers-color-scheme: dark) { :root { --fg: #eef1ef; --muted: #a8b0ab; --bg: #121513; --panel: #1d221f; --accent: #8fd1a8; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, sans-serif; }
main { max-width: 42rem; margin: 0 auto; padding: 3rem 1rem; }
header { display: flex; gap: 1rem; align-items: center; }
header img { width: 56px; height: 56px; border-radius: 12px; }
h1 { font-size: 1.5rem; margin: 0; }
p.lead { color: var(--muted); }
code { display: block; padding: .75rem 1rem; background: var(--panel); border-radius: 8px; overflow-wrap: anywhere; font-size: .95rem; }
a { color: var(--accent); }
footer { margin-top: 2.5rem; color: var(--muted); font-size: .875rem; }
</style>
</head>
<body>
<main>
<header>
<img src="/icon-192.png" alt="">
<h1>${escapeHtml(SERVER_TITLE)}</h1>
</header>
<p class="lead">${escapeHtml(SERVER_DESCRIPTION)}</p>
<h2>Connect</h2>
<p>This is a remote MCP server. Add it to your AI app (Claude, ChatGPT, or another MCP client) as a custom connector with this URL:</p>
<code>${endpoint}</code>
<p>Choose <strong>Streamable HTTP</strong> if asked for a transport, then sign in with your VELO account when prompted. No API key is needed for this connection.</p>
<h2>Get access</h2>
<p>You need a VELO account with CDT Express access. <a href="${WEBSITE_URL}">Sign up or get your API key</a> for the local Claude Desktop extension and direct API use.</p>
<p><a href="${REPOSITORY_URL}#readme">Setup guide and example prompts</a></p>
<footer>
Version ${escapeHtml(SERVER_VERSION)} · <a href="${PRIVACY_URL}">Privacy policy</a> · <a href="${REPOSITORY_URL}/issues">Report an issue</a>
</footer>
</main>
</body>
</html>
`;
};

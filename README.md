# CDT Express MCP Server

Interact with climate metrics via Riskthinking.AI's CDT Express API in supported AI chat experiences.

This project contains:
- The core MCP server that can be used to interact with Riskthinking.AI's CDT Express API.
- Distributable MCPB extension for the Claude desktop app.

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

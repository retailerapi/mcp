// Bin entry. Connects the server to stdio transport so it can be spawned by
// Claude Desktop / Cursor / Claude Code as a subprocess.
//
// Run via: `npx @retailerapi/mcp` (after `npm install -g @retailerapi/mcp`)
// or directly: `RETAILERAPI_API_KEY=rk_live_... retailerapi-mcp`

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The transport keeps the process alive while the parent (Claude Desktop /
  // Cursor / etc.) holds the stdio pipes open. No further work required here.
}

main().catch((err) => {
  // Stdout is the protocol channel — log errors to stderr so they show up
  // in the MCP host's log viewer without corrupting messages.
  // eslint-disable-next-line no-console
  console.error('[retailerapi-mcp] fatal:', err);
  process.exit(1);
});

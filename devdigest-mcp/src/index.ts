#!/usr/bin/env -S npx tsx
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer, defaultDeps } from './server.js';

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const server = createServer(defaultDeps(config));

process.on('SIGINT', () => {
  void server.close().finally(() => process.exit(0));
});

await server.connect(new StdioServerTransport());
// stdout is the JSON-RPC stream — every log line goes to stderr only.
console.error(`devdigest-mcp ready -> ${config.apiBase}`);

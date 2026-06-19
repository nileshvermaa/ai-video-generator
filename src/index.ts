// Reel MCP server entry. Claude Code launches this over stdio.
// IMPORTANT: never write to stdout except MCP protocol — use log() (stderr).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";
import { log } from "./env";

async function main(): Promise<void> {
  const server = new McpServer({ name: "reel-mcp", version: "0.0.1" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("server ready (stdio) — tools: list_providers, create_project, generate_narration, generate_clip, get_job");
}

main().catch((e) => {
  log("fatal:", e?.message || e);
  process.exit(1);
});

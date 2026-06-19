// Remote MCP endpoint (Streamable HTTP) as a STATIC route. Reached via the
// secret URL: /<MCP_SECRET>/mcp (middleware strips the secret → /mcp).
//
// Why static (app/mcp) and not the dynamic [transport] catch-all: rewriting to a
// dynamic route re-invokes middleware on the internal path, which re-trips the
// gate and 404s. A static route behaves like /setup (which works). SSE is
// deprecated for Claude connectors, so we only need the Streamable HTTP endpoint.
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../../src/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

const handler = createMcpHandler((server) => {
  registerTools(server);
});

export { handler as GET, handler as POST, handler as DELETE };

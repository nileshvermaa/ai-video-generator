// Remote MCP endpoint. The secret is a real path segment validated in-handler —
// no middleware, so nothing re-gates the request. mcp-handler keeps its required
// [transport] catch-all; basePath is the (fixed) secret prefix so it strips
// /<secret> and parses the transport ("mcp").
//
//   connector URL: https://<app>/<MCP_SECRET>/mcp
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../../../src/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

const SECRET = process.env.MCP_SECRET || "";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {},
  { basePath: `/${SECRET}` }
);

async function guard(req: Request, ctx: { params: Promise<{ secret: string; transport: string }> }) {
  const { secret } = await ctx.params;
  if (!SECRET || secret !== SECRET) return new Response("Not found", { status: 404 });
  return handler(req);
}

export { guard as GET, guard as POST, guard as DELETE };

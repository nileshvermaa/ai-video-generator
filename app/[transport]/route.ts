// Remote MCP endpoint (Streamable HTTP) served as a Vercel Function.
// The [transport] catch-all serves /mcp (and the SSE fallback). For deploy we
// move this whole route under a secret path segment (see DEPLOY notes) — that
// secret URL is the connector's only credential, since Claude connectors don't
// accept pasted tokens.
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../../src/tools";

export const runtime = "nodejs";
export const maxDuration = 300; // covers generate_narration (TTS+Whisper); render is offloaded to Sandbox

const handler = createMcpHandler((server) => {
  registerTools(server);
});

export { handler as GET, handler as POST, handler as DELETE };

// Connector auth — Claude custom connectors can't send a pasted token/header,
// so THE SECRET IS THE URL:
//
//   https://<app>/<MCP_SECRET>/mcp      ← add this as the connector
//   https://<app>/<MCP_SECRET>/setup    ← paste the OpenAI key (one time)
//
// MCP_SECRET lives in the Vercel env (NOT in this repo). This middleware
// rewrites /<secret>/<path> -> /<path> and 404s the bare paths / wrong secret.
//
// Re-entrancy: rewriting to a DYNAMIC route (/mcp -> app/[transport]) can
// re-invoke middleware on the internal path, where the bare "mcp" would trip the
// gate. So once we authorize a request we stamp it with the secret as a marker
// header (unforgeable without the secret) and let any re-run pass straight
// through to the handler.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

const PROTECTED = new Set(["mcp", "sse", "setup"]);

export function middleware(req: NextRequest) {
  const secret = process.env.MCP_SECRET || "";

  // Already authorized on a prior pass (internal rewrite re-ran middleware).
  if (secret.length > 0 && req.headers.get("x-reel-gate") === secret) {
    return NextResponse.next();
  }

  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return NextResponse.next(); // root health page

  // Correct secret prefix → strip it, stamp the marker, serve the inner path.
  if (secret.length > 0 && parts[0] === secret) {
    const rest = parts.slice(1);
    const url = req.nextUrl.clone();
    url.pathname = rest.length === 0 ? "/setup" : "/" + rest.join("/"); // bare secret → setup
    const headers = new Headers(req.headers);
    headers.set("x-reel-gate", secret);
    return NextResponse.rewrite(url, { request: { headers } });
  }

  // No/wrong secret: hide protected areas, allow everything else.
  if (PROTECTED.has(parts[0])) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

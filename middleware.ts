// Connector auth — Claude custom connectors can't send a pasted token/header,
// so THE SECRET IS THE URL:
//
//   https://<app>/<MCP_SECRET>/mcp      ← add this as the connector
//   https://<app>/<MCP_SECRET>/setup    ← paste the OpenAI key (one time)
//
// MCP_SECRET lives in the Vercel env (NOT in this repo). This middleware
// rewrites /<secret>/<path> -> /<path> and 404s the bare paths / wrong secret.
// Both /mcp and /setup are STATIC routes, so the rewrite does not re-invoke
// middleware (verified: a dynamic route did, which is why /mcp is now static).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

const PROTECTED = new Set(["mcp", "sse", "setup"]);

export function middleware(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return NextResponse.next(); // root health page

  const secret = process.env.MCP_SECRET || "";

  // Correct secret prefix → strip it and serve the inner path.
  if (secret.length > 0 && parts[0] === secret) {
    const rest = parts.slice(1);
    const url = req.nextUrl.clone();
    url.pathname = rest.length === 0 ? "/setup" : "/" + rest.join("/"); // bare secret → setup
    return NextResponse.rewrite(url);
  }

  // No/wrong secret: hide protected areas, allow everything else.
  if (PROTECTED.has(parts[0])) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

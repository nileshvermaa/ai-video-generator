// Connector auth — Claude custom connectors can't send a pasted token/header,
// so THE SECRET IS THE URL. Everything sensitive lives under a secret prefix:
//
//   https://<app>/<MCP_SECRET>/mcp      ← the MCP endpoint (add this as the connector)
//   https://<app>/<MCP_SECRET>/setup    ← paste the OpenAI key (one time)
//
// MCP_SECRET lives in the Vercel env (NOT in this repo). This middleware:
//   - rewrites /<secret>/<path>  ->  /<path>   (the real handlers)
//   - 404s the bare protected paths and any wrong/missing secret
// If MCP_SECRET is unset, everything protected is closed (safe default).
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

  // No/wrong secret: hide protected areas, allow everything else (health/assets).
  if (PROTECTED.has(parts[0])) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

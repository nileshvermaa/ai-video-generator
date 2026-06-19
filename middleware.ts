// Connector auth — Claude custom connectors can't send a pasted token/header,
// so the SECRET IS THE URL. The connector URL is:
//
//     https://<your-app>.vercel.app/<MCP_SECRET>/mcp
//
// MCP_SECRET lives in the Vercel env (NOT in this repo), so the secret never
// ships in source. This middleware:
//   - rewrites /<secret>/mcp  ->  /mcp   (the real handler route)
//   - 404s the bare /mcp and any wrong/missing secret
// If MCP_SECRET is unset, the endpoint is fully closed (safe default).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};

export function middleware(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  const isEndpoint = last === "mcp" || last === "sse";
  if (!isEndpoint) return NextResponse.next(); // health page, assets, etc.

  const secret = process.env.MCP_SECRET || "";
  if (parts.length === 2 && secret.length > 0 && parts[0] === secret) {
    const url = req.nextUrl.clone();
    url.pathname = "/" + last; // strip the secret prefix → real handler
    return NextResponse.rewrite(url);
  }
  return new NextResponse("Not found", { status: 404 });
}

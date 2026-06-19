// Public, uncached probe: which commit is actually live on Vercel? Lets us tell
// whether a push has finished deploying without guessing. Not gated (harmless).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    marker: "static-mcp-v1",
    mcpSecretSet: !!process.env.MCP_SECRET,
    blobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}

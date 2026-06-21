// "My Reels" gallery at /<MCP_SECRET>/reels — every finished reel, newest first,
// playable inline + downloadable. So she never digs through chat for a link.
import { listReels } from "../../../src/core/blob";

export const runtime = "nodejs";

const SECRET = process.env.MCP_SECRET || "";

export async function GET(_req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!SECRET || secret !== SECRET) return new Response("Not found", { status: 404 });

  const reels = await listReels();
  const grid = reels.length
    ? reels
        .map(
          (r) =>
            `<div class="cell"><video src="${r.url}" controls playsinline preload="metadata"></video>` +
            `<a class="dl" href="${r.url}" download>Download</a></div>`
        )
        .join("")
    : `<p style="color:#5e6b8a">No reels yet. Make one from the Claude app, then refresh.</p>`;

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Reels</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0e1a;color:#e8edf7;margin:0;padding:28px 20px;display:flex;justify-content:center}
  .wrap{max-width:760px;width:100%}
  h1{font-size:24px;margin:0 0 4px}
  a.back{color:#22d3ee;text-decoration:none;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-top:18px}
  .cell{background:#111729;border:1px solid #2a3a5a;border-radius:12px;overflow:hidden}
  .cell video{width:100%;aspect-ratio:9/16;object-fit:cover;display:block;background:#000}
  a.dl{display:block;text-align:center;padding:10px;font-size:14px;font-weight:600;color:#22d3ee;text-decoration:none;border-top:1px solid #2a3a5a}
</style></head><body><div class="wrap">
  <a class="back" href="/${secret}">&larr; home</a>
  <h1>My Reels (${reels.length})</h1>
  <div class="grid">${grid}</div>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

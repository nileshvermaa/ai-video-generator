// Home / hub page at /<MCP_SECRET> — one bookmark linking everything she needs.
export const runtime = "nodejs";

const SECRET = process.env.MCP_SECRET || "";

export async function GET(_req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!SECRET || secret !== SECRET) return new Response("Not found", { status: 404 });
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0e1a;color:#e8edf7;margin:0;padding:40px 32px;display:flex;justify-content:center}
  .card{max-width:460px;width:100%}
  h1{font-size:30px;margin:0 0 6px;background:linear-gradient(90deg,#22d3ee,#e879f9);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{color:#93a0bd;line-height:1.5}
  a.btn{display:block;text-decoration:none;text-align:center;font-size:18px;font-weight:700;padding:18px;border-radius:14px;margin:12px 0;background:linear-gradient(90deg,#22d3ee,#e879f9);color:#04121a}
  a.alt{background:#111729;color:#e8edf7;border:1px solid #2a3a5a}
  ol{color:#93a0bd;line-height:1.7;padding-left:20px}
</style></head><body><div class="card">
  <h1>Reel</h1>
  <p>Make Instagram reels of yourself, from the Claude app.</p>
  <a class="btn" href="/${secret}/upload">📸 My photos &amp; upload</a>
  <a class="btn alt" href="/${secret}/reels">🎬 My reels</a>
  <p style="margin-top:24px"><b>How to make one:</b></p>
  <ol>
    <li>Add a photo above (tap to take one or pick from your library).</li>
    <li>In the Claude app: <i>"Use Reel: make a reel of me &lt;doing something&gt;."</i></li>
    <li>It comes back as a link — find it here under <b>My reels</b> too.</li>
  </ol>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// Photo upload page at /<MCP_SECRET>/upload. The user drops a selfie here; it's
// stored as the "latest photo" so generate_clip(useMyPhoto:true) can animate it
// (image-to-video). This exists because Claude can't forward an in-app attached
// image's bytes to a tool call.
import { storeUpload } from "../../../src/core/uploads";

export const runtime = "nodejs";

const SECRET = process.env.MCP_SECRET || "";
const okSecret = (s: string) => SECRET.length > 0 && s === SECRET;

function page(body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel — Upload photo</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0e1a;color:#e8edf7;margin:0;padding:32px;display:flex;justify-content:center}
  .card{max-width:520px;width:100%}
  h1{font-size:24px;margin:0 0 4px}
  p{color:#93a0bd;line-height:1.5}
  input[type=file]{width:100%;box-sizing:border-box;font-size:16px;padding:14px;border-radius:10px;border:1px solid #2a3a5a;background:#111729;color:#e8edf7;margin:10px 0}
  button{width:100%;font-size:17px;font-weight:700;padding:15px;border:0;border-radius:10px;background:linear-gradient(90deg,#22d3ee,#e879f9);color:#04121a;cursor:pointer}
  .ok{color:#34d399;font-weight:600}.bad{color:#fb7185;font-weight:600}
  code{background:#111729;padding:2px 6px;border-radius:5px;color:#22d3ee}
</style></head><body><div class="card">${body}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!okSecret(secret)) return new Response("Not found", { status: 404 });
  return page(`
    <h1>Reel — upload your photo</h1>
    <p>Pick a clear photo of yourself. We'll use it as the first frame and animate it into a vertical reel when you ask Claude.</p>
    <form method="post" enctype="multipart/form-data">
      <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>
      <button type="submit">Upload photo</button>
    </form>
    <p style="font-size:13px;margin-top:20px">JPEG / PNG / WebP. After uploading, tell Claude: <code>Use Reel to make an 8s reel of me &lt;doing something&gt;</code>.</p>
  `);
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!okSecret(secret)) return new Response("Not found", { status: 404 });
  try {
    const form = await req.formData();
    const file = form.get("photo");
    if (!file || typeof file === "string") return page(`<h1>Upload</h1><p class="bad">No file received.</p><p><a href="">← back</a></p>`, 400);
    const f = file as File;
    const type = f.type || "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) {
      return page(`<h1>Upload</h1><p class="bad">Unsupported type (${type}). Use JPEG, PNG, or WebP. (iPhone HEIC: share/export as JPEG first.)</p><p><a href="">← back</a></p>`, 400);
    }
    const bytes = Buffer.from(await f.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) return page(`<h1>Upload</h1><p class="bad">That image is over 15 MB. Pick a smaller one.</p><p><a href="">← back</a></p>`, 400);

    await storeUpload(bytes, type);

    return page(`
      <h1 class="ok">✓ Photo uploaded</h1>
      <p>Now go to the Claude app and say something like:</p>
      <p><code>Use Reel to make an 8-second vertical reel of me dancing in Times Square at night</code></p>
      <p style="font-size:13px">Re-upload here any time to change the photo. Each reel uses the most recent upload.</p>
    `);
  } catch (e: any) {
    return page(`<h1>Upload</h1><p class="bad">Error: ${String(e?.message || e)}</p><p><a href="">← back</a></p>`, 500);
  }
}

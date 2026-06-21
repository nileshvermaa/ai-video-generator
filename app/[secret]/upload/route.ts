// Photo library page at /<MCP_SECRET>/upload. Upload photos with names (tap to
// take one with the camera or pick from library); pick one per reel via
// generate_clip/make_reel. Exists because Claude can't forward an in-app
// attached image's bytes to a tool call.
import { storeNamedUpload, listPhotos, deletePhoto } from "../../../src/core/uploads";

export const runtime = "nodejs";

const SECRET = process.env.MCP_SECRET || "";
const okSecret = (s: string) => SECRET.length > 0 && s === SECRET;

function shell(inner: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel — Photos</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0e1a;color:#e8edf7;margin:0;padding:28px 20px;display:flex;justify-content:center}
  .card{max-width:520px;width:100%}
  a.back{color:#22d3ee;text-decoration:none;font-size:14px}
  h1{font-size:24px;margin:6px 0 4px}h3{margin:24px 0 8px;font-size:15px;color:#93a0bd}
  p{color:#93a0bd;line-height:1.5}
  input[name=label]{width:100%;box-sizing:border-box;font-size:16px;padding:13px;border-radius:10px;border:1px solid #2a3a5a;background:#111729;color:#e8edf7;margin:8px 0}
  input[type=file]{width:100%;box-sizing:border-box;font-size:15px;padding:12px;border-radius:10px;border:1px solid #2a3a5a;background:#111729;color:#e8edf7;margin:8px 0}
  button{font-size:16px;font-weight:700;padding:13px;border:0;border-radius:10px;background:linear-gradient(90deg,#22d3ee,#e879f9);color:#04121a;cursor:pointer;width:100%}
  .row{display:flex;justify-content:space-between;align-items:center;border:1px solid #2a3a5a;border-radius:10px;padding:8px 12px;margin:8px 0}
  .row img{height:38px;width:38px;object-fit:cover;border-radius:7px;vertical-align:middle;margin-right:10px}
  .row form{margin:0;width:auto}.row button{width:auto;padding:7px 13px;background:#2a1722;color:#fb7185;font-size:13px}
  .ok{color:#34d399;font-weight:600}.bad{color:#fb7185;font-weight:600}
  code{background:#111729;padding:2px 6px;border-radius:5px;color:#22d3ee}
</style></head><body><div class="card">${inner}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function body(secret: string, msg = ""): Promise<string> {
  const photos = await listPhotos();
  const lib = photos.length
    ? `<h3>Your photos (${photos.length})</h3>` +
      photos
        .map(
          (p) =>
            `<div class="row"><span><img src="${p.url}" alt=""> <code>${p.name}</code></span>` +
            `<form method="post"><input type="hidden" name="action" value="delete"><input type="hidden" name="name" value="${p.name}"><button>remove</button></form></div>`
        )
        .join("")
    : `<p style="color:#5e6b8a">No photos yet — add one above.</p>`;
  return `<a class="back" href="/${secret}">&larr; home</a>
    ${msg ? `<p>${msg}</p>` : ""}
    <h1>Your photos</h1>
    <p>Add photos to turn into reels. Give each a short name so you can pick it in Claude (e.g. "make a reel from my beach photo").</p>
    <form method="post" enctype="multipart/form-data">
      <input type="hidden" name="action" value="upload">
      <input name="label" placeholder="name (e.g. beach, gym, suit)" autocapitalize="off" required>
      <input type="file" name="photo" accept="image/*" required>
      <button type="submit">Add photo</button>
    </form>
    <p style="font-size:13px">Tap the field to <b>take a photo</b> or choose from your library. JPEG / PNG / WebP (iPhone HEIC: export as JPEG first).</p>
    ${lib}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!okSecret(secret)) return new Response("Not found", { status: 404 });
  return shell(await body(secret));
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!okSecret(secret)) return new Response("Not found", { status: 404 });
  try {
    const form = await req.formData();
    const action = String(form.get("action") || "upload");

    if (action === "delete") {
      const name = String(form.get("name") || "");
      const removed = await deletePhoto(name);
      return shell(await body(secret, removed ? `<span class="ok">Removed "${name}".</span>` : `<span class="bad">Couldn't find "${name}".</span>`));
    }

    const label = String(form.get("label") || "").trim();
    const file = form.get("photo");
    if (!label) return shell(await body(secret, `<span class="bad">Please give the photo a name.</span>`), 400);
    if (!file || typeof file === "string") return shell(await body(secret, `<span class="bad">No file received.</span>`), 400);
    const f = file as File;
    const type = f.type || "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) {
      return shell(await body(secret, `<span class="bad">Unsupported type (${type}). Use JPEG, PNG, or WebP — iPhone HEIC: export as JPEG first.</span>`), 400);
    }
    const bytes = Buffer.from(await f.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) return shell(await body(secret, `<span class="bad">Over 15 MB — pick a smaller image.</span>`), 400);

    const name = await storeNamedUpload(label, bytes, type);
    return shell(await body(secret, `<span class="ok">✓ Saved as "${name}".</span> In Claude: <code>make a reel from my ${name} photo</code>`));
  } catch (e: any) {
    return shell(await body(secret, `<span class="bad">Error: ${String(e?.message || e)}</span>`), 500);
  }
}

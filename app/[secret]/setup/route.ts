// Bring-your-own-key setup page at /<MCP_SECRET>/setup. Secret validated
// in-handler (static "setup" segment wins over the sibling [transport] route).
import { OPENAI_BASE_URL } from "../../../src/env";
import { storeApiKey } from "../../../src/core/keystore";

export const runtime = "nodejs";

const SECRET = process.env.MCP_SECRET || "";
const okSecret = (s: string) => SECRET.length > 0 && s === SECRET;

function page(body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel — Setup</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0e1a;color:#e8edf7;margin:0;padding:32px;display:flex;justify-content:center}
  .card{max-width:520px;width:100%}
  h1{font-size:24px;margin:0 0 4px}
  p{color:#93a0bd;line-height:1.5}
  input{width:100%;box-sizing:border-box;font-size:16px;padding:14px;border-radius:10px;border:1px solid #2a3a5a;background:#111729;color:#e8edf7;margin:10px 0}
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
    <h1>Reel — connect your OpenAI key</h1>
    <p>Paste your OpenAI API key below. It's encrypted and stored privately — it never appears in the dashboard or the code. You only do this once (re-paste to rotate).</p>
    <form method="post">
      <input type="password" name="openai_key" placeholder="sk-..." autocomplete="off" autocapitalize="off" spellcheck="false" required>
      <button type="submit">Save key</button>
    </form>
    <p style="font-size:13px;margin-top:20px">Needs a key with <b>Sora-2</b> access for video. We'll tell you if it's missing.</p>
  `);
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  if (!okSecret(secret)) return new Response("Not found", { status: 404 });
  try {
    const form = await req.formData();
    const key = String(form.get("openai_key") || "").trim();
    if (!key.startsWith("sk-")) return page(`<h1>Setup</h1><p class="bad">That doesn't look like an OpenAI key (should start with <code>sk-</code>).</p><p><a href="">← back</a></p>`, 400);

    const res = await fetch(`${OPENAI_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return page(`<h1>Setup</h1><p class="bad">OpenAI rejected that key (HTTP ${res.status}). Not saved.</p><p><a href="">← back</a></p>`, 400);
    const data: any = await res.json();
    const ids: string[] = (data.data || []).map((m: any) => m.id);
    const sora = ids.includes("sora-2") || ids.includes("sora-2-pro");

    await storeApiKey(key);

    return page(`
      <h1 class="ok">✓ Key saved</h1>
      <p>Your key is encrypted and stored. You can close this page and use the <b>Reel</b> connector in the Claude app.</p>
      <p>Sora-2 video: ${sora ? '<span class="ok">available ✓</span>' : '<span class="bad">NOT available on this key</span> — voiceover/images still work, but video will fail until the key has Sora-2 access.'}</p>
    `);
  } catch (e: any) {
    return page(`<h1>Setup</h1><p class="bad">Error: ${String(e?.message || e)}</p><p><a href="">← back</a></p>`, 500);
  }
}

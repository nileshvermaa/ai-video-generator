#!/usr/bin/env node
/**
 * probe-openai.mjs — Phase 0 capability check for the Reel MCP platform.
 *
 * Tells us what your OpenAI key can actually reach before we build on it.
 * Zero dependencies (Node 20+, global fetch / FormData / Blob).
 *
 *   node scripts/probe-openai.mjs            # cheap: models + TTS + Whisper
 *   node scripts/probe-openai.mjs --image    # also generate 1 small image (~$0.01-0.04)
 *   node scripts/probe-openai.mjs --video    # also create 1 Sora-2 job (real $$, async)
 *   node scripts/probe-openai.mjs --image --video
 *
 * Nothing is generated unless its flag is passed, except the tiny TTS+Whisper
 * pair (a few cents at most) which proves the core narration→timestamp loop.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = join(ROOT, ".probe-tmp");
const args = new Set(process.argv.slice(2));
const DO_IMAGE = args.has("--image");
const DO_VIDEO = args.has("--video");

// ── tiny .env loader (no dependency) ────────────────────────────────────────
function loadEnv() {
  try {
    const txt = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env file — rely on real env */ }
}
loadEnv();

const KEY = process.env.OPENAI_API_KEY;
const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

// ── pretty output ───────────────────────────────────────────────────────────
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", d: "\x1b[90m", b: "\x1b[1m", x: "\x1b[0m" };
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok === true ? `${C.g}✓ PASS${C.x}` : ok === "warn" ? `${C.y}~ WARN${C.x}` : `${C.r}✗ FAIL${C.x}`;
  console.log(`${mark}  ${C.b}${name}${C.x}  ${C.d}${detail || ""}${C.x}`);
}
const hr = () => console.log(`${C.d}${"─".repeat(64)}${C.x}`);

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${KEY}`, ...(opts.headers || {}) },
  });
  return res;
}

// ── checks ──────────────────────────────────────────────────────────────────
async function checkAuthAndModels() {
  const res = await api("/models");
  if (!res.ok) {
    record("auth + /models", false, `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`);
    return null;
  }
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id);
  record("auth + /models", true, `${ids.length} models visible`);

  const want = {
    "Sora-2 video": ["sora-2", "sora-2-pro"],
    "TTS": ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"],
    "Whisper transcribe": ["whisper-1", "gpt-4o-transcribe"],
    "Image (gpt-image-1)": ["gpt-image-1"],
    "GPT text": ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-4.1"],
  };
  for (const [label, candidates] of Object.entries(want)) {
    const found = candidates.filter((c) => ids.includes(c));
    if (found.length) record(`  listed: ${label}`, true, found.join(", "));
    else record(`  listed: ${label}`, "warn", `none of [${candidates.join(", ")}] in /models (may still work — listing ≠ access)`);
  }
  return ids;
}

async function checkTTS() {
  const body = { model: "gpt-4o-mini-tts", input: "Reel MCP audio check, one two three.", voice: "alloy", response_format: "mp3" };
  let res = await api("/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    // fallback to tts-1
    body.model = "tts-1";
    res = await api("/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  if (!res.ok) {
    record("TTS generation", false, `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(TMP, { recursive: true });
  const out = join(TMP, "tts.mp3");
  writeFileSync(out, buf);
  record("TTS generation", true, `model=${body.model}, ${buf.length} bytes → .probe-tmp/tts.mp3`);
  return out;
}

async function checkWhisper(audioPath) {
  if (!audioPath) { record("Whisper word-timestamps", "warn", "skipped (no TTS audio to transcribe)"); return; }
  const fd = new FormData();
  fd.append("file", new Blob([readFileSync(audioPath)], { type: "audio/mpeg" }), "tts.mp3");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  const res = await api("/audio/transcriptions", { method: "POST", body: fd });
  if (!res.ok) {
    record("Whisper word-timestamps", false, `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`);
    return;
  }
  const data = await res.json();
  const words = data.words || [];
  if (words.length) {
    const sample = words.slice(0, 3).map((w) => `${w.word}@${w.start?.toFixed?.(2)}s`).join(" ");
    record("Whisper word-timestamps", true, `${words.length} words — ${sample} …  (the sync loop works)`);
  } else {
    record("Whisper word-timestamps", "warn", `transcribed but no words[] — text="${(data.text || "").slice(0, 40)}"`);
  }
}

async function checkImage() {
  const body = { model: "gpt-image-1", prompt: "a single small cyan circle on black, flat", size: "1024x1024" };
  const res = await api("/images/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { record("Image generation", false, `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`); return; }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (b64) {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, "image.png"), Buffer.from(b64, "base64"));
    record("Image generation", true, "gpt-image-1 → .probe-tmp/image.png");
  } else record("Image generation", "warn", "200 OK but no b64_json in response");
}

async function checkVideo() {
  // Sora-2 video create. Param shape varies across API revisions — surface raw response.
  const body = { model: "sora-2", prompt: "a calm cyan particle drifting on a dark blue background", seconds: "4", size: "720x1280" };
  const res = await api("/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) { record("Sora-2 video create", false, `HTTP ${res.status} — ${text.slice(0, 220)}`); return; }
  let data = {}; try { data = JSON.parse(text); } catch {}
  record("Sora-2 video create", true, `job id=${data.id || "?"} status=${data.status || "?"} (async — poll GET /videos/{id})`);
}

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${C.b}${C.c}Reel MCP — OpenAI capability probe${C.x}`);
  console.log(`${C.d}base=${BASE}  image=${DO_IMAGE}  video=${DO_VIDEO}${C.x}`);
  hr();

  if (!KEY) {
    record("OPENAI_API_KEY present", false, "not found in .env or environment");
    console.log(`\n${C.y}→ Put your key in F:\\video-gen\\.env  (copy .env.example), then re-run: npm run probe${C.x}\n`);
    process.exit(1);
  }
  record("OPENAI_API_KEY present", true, `len=${KEY.length}, prefix=${KEY.slice(0, 7)}…`);

  try {
    await checkAuthAndModels();
    hr();
    const audio = await checkTTS();
    await checkWhisper(audio);
    if (DO_IMAGE) { hr(); await checkImage(); }
    if (DO_VIDEO) { hr(); await checkVideo(); }
  } catch (e) {
    record("probe runtime", false, e?.message || String(e));
  }

  hr();
  const fails = results.filter((r) => r.ok === false).length;
  const warns = results.filter((r) => r.ok === "warn").length;
  console.log(`${C.b}Summary:${C.x} ${results.length - fails - warns} pass, ${warns} warn, ${fails} fail`);
  if (!DO_VIDEO) console.log(`${C.d}Sora-2 video not tested (costs real $). Run \`npm run probe:full\` to include image + video.${C.x}`);
  console.log("");
  process.exit(fails ? 1 : 0);
})();

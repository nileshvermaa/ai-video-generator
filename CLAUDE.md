# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this is

**Reel MCP** — a remote **MCP server** that turns a text prompt into AI video, driven entirely from the **Claude app** (including on a tablet). It's deployed on **Vercel** and connected to Claude as a **custom connector**. There is no separate app or website to open: you chat with Claude, Claude calls this server's tools, and you get back a link to an MP4.

- **Target user:** a non-technical person on a tablet who already has the Claude app.
- **Engine (target):** *hybrid* — AI footage (OpenAI Sora-2) composited under animated HTML/GSAP overlays (HyperFrames), narrated with OpenAI TTS, captions synced via Whisper word timestamps.
- **Providers:** OpenAI-first, but every capability sits behind a pluggable `Provider` interface (`src/providers/types.ts`) so any provider can drop in. This also hedges OpenAI's Sora API deprecation (see Gotchas).
- **Hosting model:** the tablet/app can't run Node, ffmpeg, or a browser — so all compute lives on Vercel. Anthropic's cloud calls our server; the tablet is just the remote control.

## Current status (what works today)

| Capability | State |
|---|---|
| MCP server over Streamable HTTP on Vercel | ✅ live |
| `list_providers`, `create_project` | ✅ |
| `generate_narration` (TTS → Blob URL + Whisper word timings) | ✅ (needs Blob store) |
| `generate_clip` + `get_clip` (Sora-2 → public MP4 URL) | ✅ (needs Sora-capable key) |
| Secret-URL connector auth (middleware) | ✅ |
| **Hybrid render** (Sora footage + HyperFrames overlays → one MP4) | ⏳ next phase (Vercel Sandbox) |

So today the connector can generate **AI video clips** and **narration** and hand back links. The full *hybrid composite* (overlays burned over footage) is the next phase — see Roadmap.

## Architecture

```
Claude app (tablet)  ──custom connector──▶  Vercel
   types a request          Streamable HTTP    │
                                               ├─ app/[transport]/route.ts   ← MCP endpoint (mcp-handler)
                                               ├─ middleware.ts              ← secret-URL gate
                                               └─ src/                       ← transport-agnostic logic
                                                    ├─ tools.ts              ← the MCP tools
                                                    ├─ providers/            ← Provider interface + OpenAI adapter
                                                    └─ core/                 ← projects (ids), blob (storage)
   OpenAI  ◀── TTS · Whisper · Sora-2 · images
   Vercel Blob  ◀── narration.mp3, transcript.json, clips/*.mp4  ──▶  public URLs
```

**Serverless rules this code obeys (important):**
- **No filesystem writes.** Vercel functions are read-only + ephemeral. Providers return `Buffer`s; `tools.ts` persists them to **Vercel Blob**, never disk.
- **No in-memory state across calls.** Each request may hit a fresh instance. Video state lives in **OpenAI's own job** — `generate_clip` returns a `videoId`, `get_clip` polls OpenAI by that id. No server-side job store needed.
- **Artifacts are delivered as public Blob URLs**, so the tablet can open them directly.

## The MCP tools (`src/tools.ts`)

| Tool | Input | Returns |
|---|---|---|
| `list_providers` | — | capability/routing matrix |
| `create_project` | `title`, `aspect` | `projectId` (groups artifacts under one Blob prefix) |
| `generate_narration` | `script`, `voice?`, `projectId?` | `audioUrl`, `transcriptUrl`, word timings |
| `generate_clip` | `prompt`, `seconds?`, `aspect?`, `photoName?`, `useMyPhoto?`, `imageUrl?`, `dryRun?` | `videoId` (async) |
| `list_photos` | — | names of uploaded photos |
| `get_clip` | `videoId`, `projectId?` | status; when done, public `videoUrl` |

**Reels (selfie → video, image-to-video):** the user uploads photos at `/<MCP_SECRET>/upload` — a **named library** (`uploads/photos/<name>` in Blob), with thumbnails + delete. (This page exists because Claude can't forward an in-app attachment's bytes to a tool.) Then `generate_clip(photoName: "beach", prompt: "...")` picks that photo (or `useMyPhoto: true` for the most recent); `list_photos` enumerates names; name matching is forgiving ("beach photo" → "beach"). The chosen photo is resized to 720×1280 with `sharp` (`src/core/images.ts`) and sent as Sora's `input_reference` (multipart) — Sora animates ONE image per reel (its first frame), and requires it to exactly match the video size, which is why we resize. iPhone HEIC isn't supported by sharp here; users export as JPEG.

`dryRun: true` on `generate_clip` returns the exact request without spending — use it to test wiring.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Var | Required | What |
|---|---|---|
| `MCP_SECRET` | yes | High-entropy string. Connector URL is `https://<app>/<MCP_SECRET>/mcp`; setup page is `/<MCP_SECRET>/setup`. Also derives the AES key that encrypts the stored OpenAI key. Never in the repo. |
| `BLOB_READ_WRITE_TOKEN` | yes | Auto-injected when you create + link a Vercel **Blob store**. Stores artifacts + the encrypted key. |
| `OPENAI_API_KEY` | no | NOT used in production — the key is provided via the `/setup` page (see below). This env var is only a convenience for **local dev**. |
| `OPENAI_BASE_URL` | no | Override the API base (Azure/proxy). |

After changing env vars, **redeploy**.

### Bring-your-own-key (no OpenAI key in the dashboard)

The OpenAI key is never a Vercel env var. After deploy, open `https://<app>/<MCP_SECRET>/setup`, paste the key once — it's validated against OpenAI (and we report Sora-2 availability), encrypted with AES-256-GCM using a key derived from `MCP_SECRET`, and stored in Blob (`config/openai.enc`). Tools decrypt it at call time (`src/core/keystore.ts`). Rotate by re-pasting.

## Deploy

The repo is connected to Vercel; every push to `main` auto-deploys.

1. In Vercel: create a **Blob store** and link it to the project (sets `BLOB_READ_WRITE_TOKEN`).
2. Add the env var `MCP_SECRET` (a long random string). No OpenAI key here.
3. Push to `main` (or hit Redeploy).
4. Open `https://<app>/<MCP_SECRET>/setup` and paste the OpenAI key (validated + stored encrypted).
5. Smoke-check: `GET https://<app>/` → 200; `GET https://<app>/mcp` → 404 (bare path closed); connector is `https://<app>/<MCP_SECRET>/mcp`.

## Connect it to the Claude app (one-time, do it on claude.ai web)

Custom connectors can only be *added* on the claude.ai website (then they sync to the mobile/tablet app). On a tablet, open claude.ai in the browser:

1. Settings → **Connectors** → **Add custom connector**.
2. Name: `Reel`. URL: `https://<app>/<MCP_SECRET>/mcp`. Auth: **none** (the secret URL is the credential).
3. Save. It now appears in the Claude **app** on the tablet.

## Use it from the tablet

In the Claude app, with the `Reel` connector enabled, just ask in plain language:

> "Make me an 8-second vertical video of waves crashing on a neon beach at night."

Claude will call `generate_clip`, then poll `get_clip` until it's ready, and hand back a link to tap. For narration: *"Now narrate this script in the nova voice: …"* → returns an audio link.

## Local development

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY (+ BLOB_READ_WRITE_TOKEN for narration/clip delivery)

npm run smoke    # offline: drives the MCP server via an in-memory client (no spend)
npm run probe    # check what your OpenAI key can reach (models, TTS, Whisper)
npm run stdio    # run the server in stdio mode for local MCP clients (Claude Code)
npm run build    # next build — validates the deployable app
npm run dev      # next dev — local HTTP server
```

`.mcp.json` registers a local **stdio** instance as `reel-local` for Claude Code dev. The deployed connector is the remote HTTP one.

## Roadmap

- **Phase done:** remote MCP server, OpenAI audio + Sora clips, Blob delivery, secret-URL auth.
- **Next — hybrid render:** a `render` tool that fires a **Vercel Sandbox** (headless Chromium + ffmpeg) to composite Sora footage under HyperFrames overlays (captions synced to the Whisper word timings) into one MP4 → Blob. `render` returns a jobId; `get_job` polls a Blob-backed status doc (`waitUntil` babysits the Sandbox).
- **Later:** multi-scene stitching + long-form, a second video provider (de-risk Sora deprecation), spend caps.

## Gotchas

- **Sora-2 API is on a deprecation clock — shutdown ~Sept 24, 2026.** The `Provider` abstraction exists largely to swap in another video provider (Runway/Kling/Veo) before then. Don't hard-couple anything to Sora specifics outside `providers/openai.ts`.
- **Sora access is gated.** A fresh OpenAI key may NOT be able to call `/v1/videos` even though TTS/Whisper/images work. Run `npm run probe:full` against the key before relying on it.
- **Claude connectors can't take a pasted token.** Only OAuth or authless. We use authless behind a secret URL (`middleware.ts`). If `MCP_SECRET` is unset, the endpoint is fully closed (404) by design.
- **Never write to disk in tool code.** It works locally but throws on Vercel. Return `Buffer`s and use `uploadBlob`.
- **Heavy render must not run inside the MCP function** (function time limit + Claude tool-call timeout). It belongs in a Sandbox, with the tool returning a jobId immediately. (Phase: next.)
- **`@modelcontextprotocol/sdk` is pinned to `1.26.0`** to satisfy `mcp-handler`'s exact peer dependency.
- **Cost.** Sora bills per second of video. `generate_clip` caps `seconds` at 12; keep clips short. Whoever's key is in `OPENAI_API_KEY` pays.

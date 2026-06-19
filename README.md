# Reel MCP

Hybrid AI-video platform driven by **Claude Code over MCP**. AI-generated footage
(OpenAI Sora-2) composited under **HyperFrames** HTML/GSAP overlays, narrated with
OpenAI TTS and caption-synced via Whisper word timestamps. OpenAI-first, but every
capability sits behind a pluggable adapter so any provider can drop in later.

There is **no app and no website** — you drive it through Claude Code; the MCP
server is an invisible Node process. Output is an `.mp4`.

## Status: Phase 1 done — MCP server live

Phase 0 (key probe) ✅ and Phase 1 (MCP skeleton + OpenAI audio path) ✅.
The server exposes 5 tools and produces real `narration.mp3` + word-timestamp
`transcript.json` through the MCP path. Sora video is wired but dry-run by default.

**Tools:** `list_providers` · `create_project` · `generate_narration`
(TTS → Whisper) · `generate_clip` (Sora-2, dry-run by default) · `get_job`.

Next: Phase 0 render spike (one Sora clip under a HyperFrames overlay → MP4),
then Phase 2 (real `generate_clip`).

## Setup

```bash
# 1. paste your OpenAI key:  edit .env  →  OPENAI_API_KEY=sk-...
# 2. install + build
npm install
npm run build

# Validation:
npm run probe        # cheap: models + TTS + Whisper
npm run probe:full   # also 1 image + 1 Sora job (real $$)
npm run smoke        # drive the MCP server end-to-end (free/dry-run)
npm run smoke -- --narrate   # + a tiny real narration (few cents)
```

## Connect it to Claude Code

A project-scoped `.mcp.json` is included (used when you run `claude` from this
folder). To use the server from any project, register it globally:

```bash
claude mcp add reel -- node F:/video-gen/dist/index.js
```

Then Claude Code can call `reel`'s tools directly. The server is an invisible
stdio process — nothing to open.

Requirements: Node 20+ (have it). `ffmpeg` needed from Phase 2 for clip
stitching — not yet on PATH on this machine; install before then.

## Roadmap

| Phase | What |
|---|---|
| 0 | Probe key + prove hybrid render composites |
| 1 | MCP skeleton + OpenAI audio (`create_project`, `generate_narration`, `list_providers`, `get_job`) |
| 2 | Video generation (`generate_clip` via Sora-2, async jobs, cost guard) |
| 3 | Hybrid compose (footage + overlays + audio synced to transcript) + lint/preview/render |
| 4 | Long-form + multi-scene stitching, 16:9 templates |
| 5 | Second provider adapter (de-risk Sora's Sept 2026 shutdown) |

Full plan: see the architecture artifact shared in the planning session.

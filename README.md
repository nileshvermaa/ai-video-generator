# Reel MCP — make AI videos from the Claude app

A remote **MCP server** (deployed on Vercel) that turns a text prompt into AI video,
driven from the **Claude app on a tablet/phone** — no separate app or website.
You chat with Claude, it calls this server, you get back a link to an MP4.

Built with OpenAI (Sora-2 video, TTS, Whisper) behind a pluggable provider layer,
inspired by the HyperFrames video pipeline.

> **Full docs & architecture:** see [`CLAUDE.md`](./CLAUDE.md).

---

## What works today

- `generate_clip` / `get_clip` — generate an AI video clip (Sora-2), get a public link
- `generate_narration` — TTS voiceover + word-level transcript, as a link
- `create_project`, `list_providers`
- Secret-URL connector auth

Next phase: **hybrid render** — footage + animated caption/overlays composited into one MP4 (Vercel Sandbox).

## Set it up (one-time, ~5 min)

In your **Vercel** project (repo is already connected — pushes auto-deploy):

1. **Storage → Create → Blob**, link it to the project. (Sets `BLOB_READ_WRITE_TOKEN`.)
2. **Settings → Environment Variables**, add:
   - `OPENAI_API_KEY` — an OpenAI key **with Sora-2 access** (gated; verify with `npm run probe:full`)
   - `MCP_SECRET` — a long random string (the connector URL embeds it)
3. **Redeploy.**

Your connector URL is: `https://<your-app>.vercel.app/<MCP_SECRET>/mcp`

## Connect it to the Claude app

Add the connector **on claude.ai in a browser** (it then syncs to the app):

> Settings → Connectors → Add custom connector → name `Reel`, paste the URL above, auth **none**.

## Use it from the tablet

Open the Claude app, make sure the `Reel` connector is on, and ask:

> *"Make an 8-second vertical clip of a neon city in the rain."*

Claude generates it and replies with a link to tap. 🎬

## Local development

```bash
npm install
cp .env.example .env      # add OPENAI_API_KEY
npm run smoke             # offline end-to-end test (no spend)
npm run probe             # what can your OpenAI key reach?
npm run build             # next build (validates the deployable app)
```

See [`CLAUDE.md`](./CLAUDE.md) for the tool reference, env vars, serverless rules, roadmap, and gotchas.

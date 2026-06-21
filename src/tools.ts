// The MCP tool surface — what Claude (in the tablet app) calls to drive the
// pipeline. Stateless + serverless-safe: video state lives in OpenAI's own job
// (polled by videoId), artifacts are delivered as public Vercel Blob URLs.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider, listProviders } from "./providers/registry";
import { makeProjectId, type Aspect } from "./core/projects";
import { uploadBlob, blobConfigured } from "./core/blob";
import { listPhotos, resolvePhotoBytes, getLatestPhotoBytes, fetchImageBytes } from "./core/uploads";
import { resizeToVideo } from "./core/images";
import { videoModel, videoSize } from "./core/sizes";
import { log } from "./env";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string): ToolResult => ({ content: [{ type: "text", text: `ERROR: ${msg}` }], isError: true });

// Proven look presets appended to the prompt. "ugc" is the workhorse for brand
// collabs that should read as an authentic creator, not an AI render.
const STYLE_PRESETS: Record<string, string> = {
  ugc: "Authentic Instagram UGC reel shot on a smartphone, natural handheld camera with subtle real movement, candid real-person energy, soft natural lighting, true-to-life skin tones and textures, not overly polished or glossy.",
  studio: "Polished branded content with soft studio key lighting, clean flattering look, crisp focus, professional color grade, premium feel.",
  product: "Brand product showcase: the product clearly featured and in sharp focus, clean uncluttered background, soft flattering light, premium commercial look.",
  cinematic: "Cinematic look, shallow depth of field, dramatic directional lighting, smooth deliberate camera motion, subtle film grain, color-graded.",
};

// Shared clip creation used by generate_clip (full control) and make_reel (one-tap).
type ClipArgs = {
  prompt: string;
  seconds: number;
  aspect: Aspect;
  quality: "standard" | "high";
  style?: string;
  photoName?: string;
  useMyPhoto: boolean;
  imageUrl?: string;
  dryRun: boolean;
};

async function createClip(a: ClipArgs): Promise<ToolResult> {
  try {
    const provider = getProvider("video");
    const finalPrompt = a.style && STYLE_PRESETS[a.style] ? `${a.prompt}. ${STYLE_PRESETS[a.style]}` : a.prompt;
    const req = { prompt: finalPrompt, durationSec: a.seconds, aspect: a.aspect, quality: a.quality };

    let imageBytes: Buffer | undefined;
    if (a.photoName || a.useMyPhoto || a.imageUrl) {
      let raw: Buffer | null;
      if (a.photoName) raw = await resolvePhotoBytes(a.photoName);
      else if (a.useMyPhoto) raw = await getLatestPhotoBytes();
      else raw = await fetchImageBytes(a.imageUrl!);
      if (!raw) {
        const names = (await listPhotos()).map((p) => p.name);
        return fail(`Photo not found.${names.length ? ` Available photos: ${names.join(", ")}.` : " No photos uploaded yet — upload one at the /upload page."}`);
      }
      imageBytes = await resizeToVideo(raw, a.aspect, a.quality);
    }

    const mode = imageBytes ? "image-to-video" : "text-to-video";
    if (a.dryRun) {
      return ok({ dryRun: true, mode, model: videoModel(a.quality), size: videoSize(a.aspect, a.quality).size, style: a.style || null, photo: a.photoName || (a.useMyPhoto ? "latest" : null), seconds: a.seconds, note: "No money spent." });
    }
    const ref = await provider.createVideo!(req, imageBytes);
    log("clip created", mode, videoModel(a.quality), ref.providerJobId, ref.status);
    return ok({ videoId: ref.providerJobId, status: ref.status, mode, model: videoModel(a.quality), size: videoSize(a.aspect, a.quality).size, note: "Poll get_clip with this videoId every ~10s until status=completed." });
  } catch (e: any) {
    return fail(e?.message || String(e));
  }
}

export function registerTools(server: McpServer): void {
  // ── list_providers ──────────────────────────────────────────────────────────
  server.tool(
    "list_providers",
    "List which provider handles video / tts / transcribe / image, and the active routing.",
    {},
    async () => ok(listProviders())
  );

  // ── create_project ──────────────────────────────────────────────────────────
  server.tool(
    "create_project",
    "Start a video project. Returns a projectId (a label that groups this video's narration + clips). Pass it to the other tools.",
    {
      title: z.string().describe("Short human title for the video"),
      aspect: z.enum(["9:16", "16:9", "1:1"]).default("9:16").describe("9:16 vertical (shorts), 16:9 landscape, 1:1 square"),
    },
    async ({ title, aspect }) => ok({ projectId: makeProjectId(title), title, aspect })
  );

  // ── generate_narration ──────────────────────────────────────────────────────
  server.tool(
    "generate_narration",
    "Generate spoken narration (OpenAI TTS) and a word-level transcript (Whisper). Returns a public audio URL plus word timings (used later to sync captions).",
    {
      script: z.string().describe("The narration text to speak"),
      voice: z.string().default("alloy").describe("OpenAI voice: alloy, echo, fable, onyx, nova, shimmer"),
      projectId: z.string().optional().describe("From create_project; auto-generated if omitted"),
    },
    async ({ script, voice, projectId }) => {
      try {
        if (!blobConfigured()) return fail("Storage not configured — create a Vercel Blob store so BLOB_READ_WRITE_TOKEN is set.");
        const pid = projectId || makeProjectId("narration");
        const tts = getProvider("tts");
        const stt = getProvider("transcribe");
        const speech = await tts.generateSpeech!({ text: script, voice });
        const tr = await stt.transcribe!({ audio: speech.audio });
        const audioUrl = await uploadBlob(`${pid}/narration.mp3`, speech.audio, "audio/mpeg");
        const transcriptUrl = await uploadBlob(`${pid}/transcript.json`, JSON.stringify(tr), "application/json");
        log("narration", pid, `${tr.words.length}w/${tr.durationSec}s`);
        return ok({ projectId: pid, audioUrl, transcriptUrl, voice, ttsModel: speech.model, durationSec: tr.durationSec, wordCount: tr.words.length, words: tr.words });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );

  // ── generate_clip ───────────────────────────────────────────────────────────
  server.tool(
    "generate_clip",
    "Generate an AI video clip with OpenAI Sora (Instagram Reels / brand UGC). Async: returns a videoId — poll get_clip until 'completed'. Animate one of the user's photos with photoName (see list_photos) or useMyPhoto:true. quality 'high' = sora-2-pro at 1024x1792 (crisp, survives Instagram compression; pricier) — default, use for brand work. style applies a proven look — use 'ugc' for brand collabs that should look like an authentic creator, not AI. COSTS MONEY per second.",
    {
      prompt: z.string().describe("The action/scene. Describe what the PERSON does + setting, e.g. 'the person walks toward camera holding the product, smiling, sunlit street'."),
      seconds: z.number().int().min(1).max(12).default(8).describe("Clip length (1-12s)"),
      aspect: z.enum(["9:16", "16:9", "1:1"]).default("9:16").describe("9:16 for Instagram Reels / vertical"),
      quality: z.enum(["standard", "high"]).default("high").describe("'high' = sora-2-pro 1024x1792 (brand quality, crisp on IG, costs more). 'standard' = sora-2 720x1280 (cheap draft)."),
      style: z.enum(["ugc", "studio", "product", "cinematic"]).optional().describe("Look preset. 'ugc' = authentic handheld creator (best for brand collabs). 'studio'/'product' = polished/commercial. 'cinematic' = filmic."),
      photoName: z.string().optional().describe("Animate a specific uploaded photo by name (see list_photos)."),
      useMyPhoto: z.boolean().default(false).describe("true = animate the user's MOST RECENT uploaded photo."),
      imageUrl: z.string().optional().describe("A public image URL to animate instead of an uploaded photo"),
      dryRun: z.boolean().default(false).describe("true = show what would happen without spending money"),
    },
    async ({ prompt, seconds, aspect, quality, style, photoName, useMyPhoto, imageUrl, dryRun }) =>
      createClip({ prompt, seconds, aspect: aspect as Aspect, quality, style, photoName, useMyPhoto, imageUrl, dryRun })
  );

  // ── make_reel (one-tap) ─────────────────────────────────────────────────────
  server.tool(
    "make_reel",
    "One-tap Instagram Reel of the user — the EASY default for 'make a reel of me ...'. Give a plain description; it uses the user's photo (most recent, or photoName), brand quality (sora-2-pro), authentic UGC style, 8s, 9:16. Returns a videoId — then poll get_clip until completed.",
    {
      description: z.string().describe("Plain description: what the person does + setting, e.g. 'holding the serum, smiling, sunlit bathroom'."),
      photoName: z.string().optional().describe("Specific uploaded photo (see list_photos). Omit to use the most recent."),
      seconds: z.number().int().min(1).max(12).default(8),
    },
    async ({ description, photoName, seconds }) =>
      createClip({ prompt: description, seconds, aspect: "9:16", quality: "high", style: "ugc", photoName, useMyPhoto: !photoName, dryRun: false })
  );

  // ── list_photos ─────────────────────────────────────────────────────────────
  server.tool(
    "list_photos",
    "List the photos the user has uploaded (by name) that can be animated into reels via generate_clip.",
    {},
    async () => {
      try {
        const photos = await listPhotos();
        return ok({ count: photos.length, photos: photos.map((p) => ({ name: p.name, uploadedAt: p.uploadedAt })) });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );

  // ── get_clip ────────────────────────────────────────────────────────────────
  server.tool(
    "get_clip",
    "Check a Sora-2 video job. While running, returns its status. When completed, downloads the MP4 and returns a public URL to watch/download on any device.",
    {
      videoId: z.string().describe("The videoId from generate_clip / make_reel"),
    },
    async ({ videoId }) => {
      try {
        const provider = getProvider("video");
        const ref = await provider.getVideo!(videoId);
        if (ref.status !== "completed") {
          const progress = (ref.raw as any)?.progress;
          return ok({ videoId, status: ref.status, progress, note: "Not done yet — call get_clip again in ~10s." });
        }
        if (!blobConfigured()) return fail("Video is ready but storage isn't configured — create a Vercel Blob store (sets BLOB_READ_WRITE_TOKEN).");
        const bytes = await provider.downloadVideo!(videoId);
        const videoUrl = await uploadBlob(`reels/${videoId}.mp4`, bytes, "video/mp4");
        log("clip done", videoId, `${bytes.length}b`);
        return ok({ videoId, status: "completed", videoUrl, bytes: bytes.length, note: "Open videoUrl to watch or download. Also saved in My Reels (/reels)." });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );
}

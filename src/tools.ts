// The MCP tool surface — what Claude (in the tablet app) calls to drive the
// pipeline. Stateless + serverless-safe: video state lives in OpenAI's own job
// (polled by videoId), artifacts are delivered as public Vercel Blob URLs.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider, listProviders } from "./providers/registry";
import { makeProjectId, type Aspect } from "./core/projects";
import { uploadBlob, blobConfigured } from "./core/blob";
import { getLatestUploadBytes, fetchImageBytes } from "./core/uploads";
import { resizeToVideo, videoSize } from "./core/images";
import { log } from "./env";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string): ToolResult => ({ content: [{ type: "text", text: `ERROR: ${msg}` }], isError: true });

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
    "Generate an AI video clip with OpenAI Sora-2 (great for Instagram Reels). Async: returns a videoId — poll get_clip until 'completed'. To make a reel STARRING the user, set useMyPhoto:true to animate the selfie they uploaded at the connector's /upload page (image-to-video). COSTS MONEY per second of video.",
    {
      prompt: z.string().describe("The action/scene. For a selfie reel, describe what the PERSON does, e.g. 'the person dances energetically in Times Square at night, neon lights, handheld vertical reel'."),
      seconds: z.number().int().min(1).max(12).default(8).describe("Clip length (1-12s)"),
      aspect: z.enum(["9:16", "16:9", "1:1"]).default("9:16").describe("9:16 for Instagram Reels / vertical"),
      useMyPhoto: z.boolean().default(false).describe("true = animate the photo the user uploaded at the /upload page (image-to-video). Use this when the user wants a reel of themselves."),
      imageUrl: z.string().optional().describe("A public image URL to animate instead of the uploaded photo"),
      projectId: z.string().optional(),
      dryRun: z.boolean().default(false).describe("true = show what would happen without spending money"),
    },
    async ({ prompt, seconds, aspect, useMyPhoto, imageUrl, projectId, dryRun }) => {
      try {
        const provider = getProvider("video");
        const req = { prompt, durationSec: seconds, aspect: aspect as Aspect };

        let imageBytes: Buffer | undefined;
        if (useMyPhoto || imageUrl) {
          const raw = useMyPhoto ? await getLatestUploadBytes() : await fetchImageBytes(imageUrl!);
          if (!raw) {
            return fail("No uploaded photo found. Open the upload page (your connector URL with /upload instead of /mcp), upload a photo, then try again.");
          }
          imageBytes = await resizeToVideo(raw, req.aspect);
        }

        const mode = imageBytes ? "image-to-video" : "text-to-video";
        if (dryRun) return ok({ dryRun: true, mode, size: videoSize(req.aspect).size, prompt, seconds, note: "No money spent." });

        const ref = await provider.createVideo!(req, imageBytes);
        log("clip created", mode, ref.providerJobId, ref.status);
        return ok({ videoId: ref.providerJobId, status: ref.status, mode, projectId: projectId || null, note: "Poll get_clip with this videoId every ~10s until status=completed." });
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
      videoId: z.string().describe("The videoId from generate_clip"),
      projectId: z.string().optional(),
    },
    async ({ videoId, projectId }) => {
      try {
        const provider = getProvider("video");
        const ref = await provider.getVideo!(videoId);
        if (ref.status !== "completed") {
          const progress = (ref.raw as any)?.progress;
          return ok({ videoId, status: ref.status, progress, note: "Not done yet — call get_clip again in ~10s." });
        }
        if (!blobConfigured()) return fail("Video is ready but storage isn't configured — create a Vercel Blob store (sets BLOB_READ_WRITE_TOKEN).");
        const bytes = await provider.downloadVideo!(videoId);
        const videoUrl = await uploadBlob(`${projectId || "clips"}/${videoId}.mp4`, bytes, "video/mp4");
        log("clip done", videoId, `${bytes.length}b`);
        return ok({ videoId, status: "completed", videoUrl, bytes: bytes.length, note: "Open videoUrl to watch or download." });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );
}

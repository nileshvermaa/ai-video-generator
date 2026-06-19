// The MCP tool surface — what Claude Code calls to drive the platform.
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProvider, listProviders } from "./providers/registry";
import { createProject, resolveProject, type Aspect } from "./core/projects";
import { addJob, getJob, newJobId, updateJob } from "./core/jobs";
import { log } from "./env";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string): ToolResult => ({ content: [{ type: "text", text: `ERROR: ${msg}` }], isError: true });

const TERMINAL = new Set(["completed", "failed", "dry-run"]);

export function registerTools(server: McpServer): void {
  // ── list_providers ────────────────────────────────────────────────────────
  server.tool(
    "list_providers",
    "List the capability matrix: which provider handles video / tts / transcribe / image, and the active routing.",
    {},
    async () => ok(listProviders())
  );

  // ── create_project ──────────────────────────────────────────────────────────
  server.tool(
    "create_project",
    "Scaffold a new video project folder (meta.json + audio/ assets/ clips/ out/ + empty script.txt). Returns the project id used by every other tool.",
    {
      title: z.string().describe("Human title; also the basis for the slug/id"),
      aspect: z.enum(["9:16", "16:9", "1:1"]).default("9:16").describe("9:16 shorts, 16:9 long-form, 1:1 square"),
      targetDurationSec: z.number().int().positive().max(900).default(30).describe("Target final video length in seconds"),
    },
    async ({ title, aspect, targetDurationSec }) => {
      try {
        const { id, dir, meta } = createProject(title, aspect as Aspect, targetDurationSec, new Date().toISOString());
        log("created project", id);
        return ok({ projectId: id, dir, meta });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );

  // ── generate_narration ────────────────────────────────────────────────────
  server.tool(
    "generate_narration",
    "Generate narration for a project: OpenAI TTS -> audio/narration.mp3, then Whisper -> transcript.json (word-level timestamps for caption sync). One call replaces TTS + transcribe.",
    {
      projectId: z.string().describe("Project id from create_project"),
      script: z.string().describe("The narration text to speak"),
      voice: z.string().default("alloy").describe("OpenAI TTS voice (alloy, echo, fable, onyx, nova, shimmer, ...)"),
    },
    async ({ projectId, script, voice }) => {
      try {
        const { dir } = resolveProject(projectId);
        writeFileSync(join(dir, "script.txt"), script);

        const tts = getProvider("tts");
        const stt = getProvider("transcribe");
        const audioPath = join(dir, "audio", "narration.mp3");

        const speech = await tts.generateSpeech!({ text: script, voice }, audioPath);
        const tr = await stt.transcribe!({ audioPath });
        const transcriptPath = join(dir, "transcript.json");
        writeFileSync(transcriptPath, JSON.stringify(tr, null, 2));

        log("narration", projectId, `${tr.words.length} words / ${tr.durationSec}s`);
        return ok({
          audioPath,
          transcriptPath,
          voice,
          ttsModel: speech.model,
          bytes: speech.bytes,
          wordCount: tr.words.length,
          durationSec: tr.durationSec,
          firstWords: tr.words.slice(0, 5),
        });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );

  // ── generate_clip ─────────────────────────────────────────────────────────
  server.tool(
    "generate_clip",
    "Generate AI footage (Sora-2) for a project. Returns a job id; poll get_job. SAFE BY DEFAULT: dryRun=true returns the exact request that WOULD be sent (no spend). Set dryRun=false to actually generate (costs real money).",
    {
      projectId: z.string().describe("Project id from create_project"),
      prompt: z.string().describe("Footage description for the video model"),
      durationSec: z.number().int().min(1).max(20).default(4).describe("Clip length in seconds"),
      aspect: z.enum(["9:16", "16:9", "1:1"]).optional().describe("Defaults to the project aspect"),
      dryRun: z.boolean().default(true).describe("true = no spend, just show the planned request"),
    },
    async ({ projectId, prompt, durationSec, aspect, dryRun }) => {
      try {
        const { meta } = resolveProject(projectId);
        const provider = getProvider("video");
        const req = { prompt, durationSec, aspect: (aspect as Aspect) || meta.aspect };
        const jobId = newJobId();

        if (dryRun) {
          const plan = provider.planVideo!(req);
          const job = addJob({ id: jobId, type: "video", projectId, status: "dry-run", providerId: provider.id, request: req, result: { plan } });
          return ok({ jobId, status: job.status, dryRun: true, plan, note: "No money spent. Re-call with dryRun=false to generate." });
        }

        const ref = await provider.createVideo!(req);
        const job = addJob({
          id: jobId,
          type: "video",
          projectId,
          status: "in_progress",
          providerId: provider.id,
          providerJobId: ref.providerJobId,
          request: req,
          result: ref.raw,
        });
        log("video job created", jobId, ref.providerJobId, ref.status);
        return ok({ jobId, status: job.status, providerJobId: ref.providerJobId, note: "Generating. Poll get_job until completed." });
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );

  // ── get_job ─────────────────────────────────────────────────────────────────
  server.tool(
    "get_job",
    "Poll a long-running job (e.g. video generation). Refreshes status from the provider when the job isn't terminal yet.",
    { jobId: z.string().describe("Job id from generate_clip") },
    async ({ jobId }) => {
      try {
        const job = getJob(jobId);
        if (!job) return fail(`Job "${jobId}" not found`);

        if (job.type === "video" && job.providerJobId && !TERMINAL.has(job.status)) {
          const provider = getProvider("video", job.providerId);
          const ref = await provider.getVideo!(job.providerJobId);
          const status = ref.status === "completed" ? "completed" : ref.status === "failed" ? "failed" : "in_progress";
          updateJob(jobId, { status, result: ref.raw });
        }
        return ok(getJob(jobId));
      } catch (e: any) {
        return fail(e?.message || String(e));
      }
    }
  );
}

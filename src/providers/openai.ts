// OpenAI adapter — implements every capability with raw fetch (proven in the
// Phase 0 probe). No SDK dependency, no surprises.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { OPENAI_API_KEY, OPENAI_BASE_URL } from "../env";
import type {
  Provider,
  SpeechRequest,
  SpeechResult,
  TranscribeRequest,
  TranscribeResult,
  ImageRequest,
  ImageResult,
  VideoRequest,
  VideoJobRef,
} from "./types";

function auth(): Record<string, string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (put it in .env)");
  return { Authorization: `Bearer ${OPENAI_API_KEY}` };
}

// gpt-image-1 supports a fixed set of sizes.
function aspectToImageSize(aspect = "1:1"): string {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "16:9") return "1536x1024";
  return "1024x1024";
}
// Sora-2 portrait/landscape sizes.
function aspectToVideoSize(aspect = "9:16"): string {
  if (aspect === "16:9") return "1280x720";
  return "720x1280"; // 9:16 default
}

export class OpenAIProvider implements Provider {
  id = "openai";
  capabilities = { video: true, tts: true, transcribe: true, image: true } as const;

  async generateSpeech(req: SpeechRequest, outPath: string): Promise<SpeechResult> {
    const model = "gpt-4o-mini-tts";
    const res = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: req.text, voice: req.voice || "alloy", response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    return { audioPath: outPath, bytes: buf.length, model };
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const fd = new FormData();
    fd.append("file", new Blob([readFileSync(req.audioPath)], { type: "audio/mpeg" }), "narration.mp3");
    fd.append("model", "whisper-1");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "word");
    const res = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, { method: "POST", headers: auth(), body: fd });
    if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const words = (data.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end }));
    const durationSec = data.duration ?? (words.length ? words[words.length - 1].end : 0);
    return { words, text: data.text || "", durationSec };
  }

  async generateImage(req: ImageRequest, outPath: string): Promise<ImageResult> {
    const res = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt: req.prompt, size: aspectToImageSize(req.aspect) }),
    });
    if (!res.ok) throw new Error(`Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image: 200 OK but no b64_json in response");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(b64, "base64"));
    return { assetPath: outPath };
  }

  planVideo(req: VideoRequest) {
    return {
      endpoint: `${OPENAI_BASE_URL}/videos`,
      method: "POST",
      body: { model: "sora-2", prompt: req.prompt, seconds: String(req.durationSec), size: aspectToVideoSize(req.aspect) },
    };
  }

  async createVideo(req: VideoRequest): Promise<VideoJobRef> {
    const plan = this.planVideo(req);
    const res = await fetch(plan.endpoint, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(plan.body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Sora create ${res.status}: ${text.slice(0, 300)}`);
    const data: any = JSON.parse(text);
    return { providerJobId: data.id, status: data.status, raw: data };
  }

  async getVideo(providerJobId: string): Promise<VideoJobRef> {
    const res = await fetch(`${OPENAI_BASE_URL}/videos/${providerJobId}`, { headers: auth() });
    const text = await res.text();
    if (!res.ok) throw new Error(`Sora get ${res.status}: ${text.slice(0, 300)}`);
    const data: any = JSON.parse(text);
    return { providerJobId, status: data.status, raw: data };
  }
}

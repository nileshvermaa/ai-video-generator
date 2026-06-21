// OpenAI adapter — implements every capability with raw fetch. Pure: returns
// bytes, never writes to disk (serverless-safe). The API key is resolved at
// call time from the keystore (env var locally, encrypted Blob in production).
import { OPENAI_BASE_URL } from "../env";
import { getApiKey } from "../core/keystore";
import { videoModel, videoSize } from "../core/sizes";
import type { Aspect } from "../core/projects";
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

async function authHeaders(): Promise<Record<string, string>> {
  const key = await getApiKey();
  if (!key) {
    throw new Error("No OpenAI key configured. Open the setup page (your connector URL with /setup instead of /mcp) and paste your OpenAI API key.");
  }
  return { Authorization: `Bearer ${key}` };
}

function aspectToImageSize(aspect = "1:1"): string {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "16:9") return "1536x1024";
  return "1024x1024";
}

export class OpenAIProvider implements Provider {
  id = "openai";
  capabilities = { video: true, tts: true, transcribe: true, image: true } as const;

  async generateSpeech(req: SpeechRequest): Promise<SpeechResult> {
    const model = "gpt-4o-mini-tts";
    const res = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: req.text, voice: req.voice || "alloy", response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { audio: Buffer.from(await res.arrayBuffer()), model };
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(req.audio)], { type: "audio/mpeg" }), "narration.mp3");
    fd.append("model", "whisper-1");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "word");
    const res = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, { method: "POST", headers: await authHeaders(), body: fd });
    if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const words = (data.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end }));
    const durationSec = data.duration ?? (words.length ? words[words.length - 1].end : 0);
    return { words, text: data.text || "", durationSec };
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const res = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt: req.prompt, size: aspectToImageSize(req.aspect) }),
    });
    if (!res.ok) throw new Error(`Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image: 200 OK but no b64_json in response");
    return { image: Buffer.from(b64, "base64") };
  }

  planVideo(req: VideoRequest) {
    const quality = req.quality ?? "high";
    return {
      endpoint: `${OPENAI_BASE_URL}/videos`,
      method: "POST",
      body: { model: videoModel(quality), prompt: req.prompt, seconds: String(req.durationSec), size: videoSize(req.aspect as Aspect, quality).size },
    };
  }

  async createVideo(req: VideoRequest, imageBytes?: Buffer): Promise<VideoJobRef> {
    const quality = req.quality ?? "high";
    const model = videoModel(quality);
    const size = videoSize(req.aspect as Aspect, quality).size;
    let res: Response;
    if (imageBytes) {
      // Image-to-video: multipart with input_reference (image must match size).
      const fd = new FormData();
      fd.append("model", model);
      fd.append("prompt", req.prompt);
      fd.append("seconds", String(req.durationSec));
      fd.append("size", size);
      fd.append("input_reference", new Blob([new Uint8Array(imageBytes)], { type: "image/jpeg" }), "reference.jpg");
      res = await fetch(`${OPENAI_BASE_URL}/videos`, { method: "POST", headers: await authHeaders(), body: fd });
    } else {
      // Text-to-video: JSON.
      res = await fetch(`${OPENAI_BASE_URL}/videos`, {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: req.prompt, seconds: String(req.durationSec), size }),
      });
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Sora create ${res.status}: ${text.slice(0, 300)}`);
    const data: any = JSON.parse(text);
    return { providerJobId: data.id, status: data.status, raw: data };
  }

  async getVideo(providerJobId: string): Promise<VideoJobRef> {
    const res = await fetch(`${OPENAI_BASE_URL}/videos/${providerJobId}`, { headers: await authHeaders() });
    const text = await res.text();
    if (!res.ok) throw new Error(`Sora get ${res.status}: ${text.slice(0, 300)}`);
    const data: any = JSON.parse(text);
    return { providerJobId, status: data.status, raw: data };
  }

  async downloadVideo(providerJobId: string): Promise<Buffer> {
    const res = await fetch(`${OPENAI_BASE_URL}/videos/${providerJobId}/content`, { headers: await authHeaders() });
    if (!res.ok) throw new Error(`Sora content ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

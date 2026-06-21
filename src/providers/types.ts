// The pluggability seam. Every AI capability sits behind this interface so any
// provider (OpenAI today; Runway/Kling/ElevenLabs tomorrow) can drop in.
//
// SERVERLESS NOTE: providers are PURE — they return bytes (Buffer), never touch
// the filesystem. The caller decides where to persist (Vercel Blob). This is
// what lets the whole pipeline run on Vercel's read-only/ephemeral functions.

export type Capability = "video" | "tts" | "transcribe" | "image";

export interface SpeechRequest {
  text: string;
  voice?: string;
}
export interface SpeechResult {
  audio: Buffer;
  model: string;
}

export interface TranscribeRequest {
  audio: Buffer;
}
export interface Word {
  word: string;
  start: number;
  end: number;
}
export interface TranscribeResult {
  words: Word[];
  text: string;
  durationSec: number;
}

export interface ImageRequest {
  prompt: string;
  aspect?: string;
}
export interface ImageResult {
  image: Buffer;
}

export interface VideoRequest {
  prompt: string;
  durationSec: number;
  aspect: string;
  imageRef?: string;
  quality?: "standard" | "high";
}
export interface VideoJobRef {
  providerJobId: string;
  status: string;
  raw: unknown;
}

export interface Provider {
  id: string;
  capabilities: Record<Capability, boolean>;

  generateSpeech?(req: SpeechRequest): Promise<SpeechResult>;
  transcribe?(req: TranscribeRequest): Promise<TranscribeResult>;
  generateImage?(req: ImageRequest): Promise<ImageResult>;

  // Video generation is async/long. createVideo kicks off a job; getVideo polls;
  // downloadVideo fetches the finished MP4 bytes. Pass imageBytes (already sized
  // to the target) for image-to-video.
  createVideo?(req: VideoRequest, imageBytes?: Buffer): Promise<VideoJobRef>;
  getVideo?(providerJobId: string): Promise<VideoJobRef>;
  downloadVideo?(providerJobId: string): Promise<Buffer>;
  // Transparency: describe the exact request without spending money (dry-run).
  planVideo?(req: VideoRequest): { endpoint: string; method: string; body: unknown };
}

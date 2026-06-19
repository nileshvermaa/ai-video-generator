// The pluggability seam. Every AI capability sits behind this interface so any
// provider (OpenAI today; Runway/Kling/ElevenLabs tomorrow) can drop in.
// This is what protects us from OpenAI's Sora API deprecation (Sept 2026).

export type Capability = "video" | "tts" | "transcribe" | "image";

export interface SpeechRequest {
  text: string;
  voice?: string;
}
export interface SpeechResult {
  audioPath: string;
  bytes: number;
  model: string;
}

export interface TranscribeRequest {
  audioPath: string;
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
  assetPath: string;
}

export interface VideoRequest {
  prompt: string;
  durationSec: number;
  aspect: string;
  imageRef?: string;
}
export interface VideoJobRef {
  providerJobId: string;
  status: string;
  raw: unknown;
}

export interface Provider {
  id: string;
  capabilities: Record<Capability, boolean>;

  generateSpeech?(req: SpeechRequest, outPath: string): Promise<SpeechResult>;
  transcribe?(req: TranscribeRequest): Promise<TranscribeResult>;
  generateImage?(req: ImageRequest, outPath: string): Promise<ImageResult>;

  // Video generation is async/long. createVideo kicks off a job; getVideo polls.
  createVideo?(req: VideoRequest): Promise<VideoJobRef>;
  getVideo?(providerJobId: string): Promise<VideoJobRef>;
  // Transparency: describe the exact request without spending money (dry-run).
  planVideo?(req: VideoRequest): { endpoint: string; method: string; body: unknown };
}

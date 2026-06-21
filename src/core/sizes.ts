// Video model + size selection by quality tier. Kept dependency-free so both the
// OpenAI adapter and the sharp resizer can share it.
//
//   standard -> sora-2     720x1280 / 1280x720   (cheaper, softer; blurs on IG)
//   high     -> sora-2-pro 1024x1792 / 1792x1024 (~1080p, the API max; crisp on IG)
// True 4K / 1920x1080 is NOT available on the direct OpenAI Sora API.
import type { Aspect } from "./projects";

export type Quality = "standard" | "high";

export function videoModel(q: Quality): string {
  return q === "high" ? "sora-2-pro" : "sora-2";
}

export function videoSize(aspect: Aspect, q: Quality = "high"): { w: number; h: number; size: string } {
  if (q === "high") {
    return aspect === "16:9" ? { w: 1792, h: 1024, size: "1792x1024" } : { w: 1024, h: 1792, size: "1024x1792" };
  }
  return aspect === "16:9" ? { w: 1280, h: 720, size: "1280x720" } : { w: 720, h: 1280, size: "720x1280" };
}

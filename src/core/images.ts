// Sora image-to-video requires the reference image to EXACTLY match the video
// size (720x1280 or 1280x720). We cover-crop the user's photo to that size.
import sharp from "sharp";
import type { Aspect } from "./projects";

export function videoSize(aspect: Aspect): { w: number; h: number; size: string } {
  if (aspect === "16:9") return { w: 1280, h: 720, size: "1280x720" };
  return { w: 720, h: 1280, size: "720x1280" }; // 9:16 (and 1:1 fallback) — reels
}

export async function resizeToVideo(bytes: Buffer, aspect: Aspect): Promise<Buffer> {
  const { w, h } = videoSize(aspect);
  return await sharp(bytes)
    .rotate() // respect EXIF orientation (phone photos)
    .resize(w, h, { fit: "cover", position: "attention" }) // crop to fill, keep the face
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Sora image-to-video requires the reference image to EXACTLY match the video
// size. We cover-crop the user's photo to that size (model/quality dependent).
import sharp from "sharp";
import type { Aspect } from "./projects";
import { videoSize, type Quality } from "./sizes";

export async function resizeToVideo(bytes: Buffer, aspect: Aspect, quality: Quality = "high"): Promise<Buffer> {
  const { w, h } = videoSize(aspect, quality);
  return await sharp(bytes)
    .rotate() // respect EXIF orientation (phone photos)
    .resize(w, h, { fit: "cover", position: "attention" }) // crop to fill, keep the face
    .jpeg({ quality: 92 })
    .toBuffer();
}

// User-uploaded reference image (the selfie for image-to-video). Stored in Blob
// at a stable path so generate_clip can find "the latest photo" without the user
// pasting a URL. Single-tenant, so one "latest" slot is exactly right.
import { put, list } from "@vercel/blob";

const UPLOAD_PATH = "uploads/latest";

export async function storeUpload(bytes: Buffer, contentType: string): Promise<string> {
  const res = await put(UPLOAD_PATH, bytes, {
    access: "public",
    contentType,
    allowOverwrite: true,
    addRandomSuffix: false,
  });
  return res.url;
}

export async function getLatestUploadBytes(): Promise<Buffer | null> {
  try {
    const { blobs } = await list({ prefix: UPLOAD_PATH });
    const found = blobs.find((b) => b.pathname === UPLOAD_PATH);
    if (!found) return null;
    const r = await fetch(found.url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function fetchImageBytes(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not fetch image URL (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// Vercel Blob storage — how artifacts (narration audio, transcripts, rendered
// MP4s) are persisted and delivered as public URLs the tablet can open.
// Requires BLOB_READ_WRITE_TOKEN (auto-injected when a Blob store is linked to
// the Vercel project). @vercel/blob reads that env var automatically.
import { put, list } from "@vercel/blob";

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Finished reels for the gallery, newest first. */
export async function listReels(): Promise<{ url: string; uploadedAt: string }[]> {
  try {
    const { blobs } = await list({ prefix: "reels/" });
    return blobs
      .map((b) => ({ url: b.url, uploadedAt: b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt ?? "") }))
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function uploadBlob(
  pathname: string,
  data: Buffer | string,
  contentType: string
): Promise<string> {
  const res = await put(pathname, data, {
    access: "public",
    contentType,
    addRandomSuffix: true, // unguessable URL — public store, but nobody can enumerate media
  });
  return res.url;
}

// Vercel Blob storage — how artifacts (narration audio, transcripts, rendered
// MP4s) are persisted and delivered as public URLs the tablet can open.
// Requires BLOB_READ_WRITE_TOKEN (auto-injected when a Blob store is linked to
// the Vercel project). @vercel/blob reads that env var automatically.
import { put } from "@vercel/blob";

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function uploadBlob(
  pathname: string,
  data: Buffer | string,
  contentType: string
): Promise<string> {
  const res = await put(pathname, data, {
    access: "public",
    contentType,
    allowOverwrite: true,
    addRandomSuffix: false,
  });
  return res.url;
}

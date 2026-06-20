// User photo library for image-to-video reels. Each photo is stored by a slug
// name under uploads/photos/<name> in Blob. generate_clip animates ONE photo per
// reel (Sora's input_reference is a single image), but the user keeps a set and
// picks per reel. Single-tenant, so the whole library is theirs.
import { put, list, del } from "@vercel/blob";

const PREFIX = "uploads/photos/";

export function slugName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "photo"
  );
}

export interface PhotoEntry {
  name: string;
  url: string;
  uploadedAt: string;
}

export async function storeNamedUpload(name: string, bytes: Buffer, contentType: string): Promise<string> {
  const s = slugName(name);
  await put(PREFIX + s, bytes, { access: "public", contentType, allowOverwrite: true, addRandomSuffix: false });
  return s;
}

export async function listPhotos(): Promise<PhotoEntry[]> {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .map((b) => ({
      name: b.pathname.slice(PREFIX.length),
      url: b.url,
      uploadedAt: b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt ?? ""),
    }))
    .filter((p) => p.name.length > 0)
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)); // newest first
}

/** Forgiving lookup: exact slug, then contains either way. */
export async function resolvePhotoBytes(query: string): Promise<Buffer | null> {
  const photos = await listPhotos();
  if (!photos.length) return null;
  const s = slugName(query);
  const match =
    photos.find((p) => p.name === s) ||
    photos.find((p) => p.name.includes(s) || s.includes(p.name)) ||
    null;
  if (!match) return null;
  const r = await fetch(match.url);
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

export async function getLatestPhotoBytes(): Promise<Buffer | null> {
  const photos = await listPhotos();
  if (!photos.length) return null;
  const r = await fetch(photos[0].url);
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

export async function deletePhoto(name: string): Promise<boolean> {
  const s = slugName(name);
  const { blobs } = await list({ prefix: PREFIX + s });
  const found = blobs.find((b) => b.pathname === PREFIX + s);
  if (!found) return false;
  await del(found.url);
  return true;
}

export async function fetchImageBytes(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not fetch image URL (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// Bring-your-own-key store. The user's OpenAI key is NEVER a Vercel env var and
// never in the repo. It's pasted into the /setup page, encrypted with a key
// derived from MCP_SECRET (AES-256-GCM), and stored in Vercel Blob. Even if the
// stored blob leaks, it's useless without MCP_SECRET.
import crypto from "node:crypto";
import { put, list } from "@vercel/blob";

const KEY_PATH = "config/openai.enc";
const TTL_MS = 60_000;
let cache: { key: string; at: number } | null = null;

function aesKey(): Buffer {
  const secret = process.env.MCP_SECRET || "";
  if (!secret) throw new Error("MCP_SECRET is not set (needed to encrypt/decrypt the stored OpenAI key)");
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: tag.toString("base64"), data: data.toString("base64") });
}

export function decrypt(blob: string): string {
  const o = JSON.parse(blob);
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(o.iv, "base64"));
  decipher.setAuthTag(Buffer.from(o.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(o.data, "base64")), decipher.final()]).toString("utf8");
}

export async function storeApiKey(key: string): Promise<void> {
  await put(KEY_PATH, encrypt(key), { access: "public", contentType: "application/json", allowOverwrite: true, addRandomSuffix: false });
  cache = { key, at: Date.now() };
}

/** Resolve the OpenAI key: env var (local dev) → cache → encrypted Blob. */
export async function getApiKey(): Promise<string | null> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.key;
  try {
    const { blobs } = await list({ prefix: KEY_PATH });
    const found = blobs.find((b) => b.pathname === KEY_PATH);
    if (!found) return null;
    const enc = await (await fetch(found.url)).text();
    const key = decrypt(enc);
    cache = { key, at: Date.now() };
    return key;
  } catch {
    return null;
  }
}

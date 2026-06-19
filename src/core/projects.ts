// A "project" is just a label that groups a video's artifacts under one Blob
// prefix (e.g. claude-code-2-0-lr8x2k/narration.mp3). No filesystem, no DB —
// the id IS the state, which keeps the server stateless on serverless.

export type Aspect = "9:16" | "16:9" | "1:1";

const STOPWORDS = new Set(["the", "a", "an", "of", "for", "to", "with", "about", "on", "in", "and", "or", "is", "are"]);

export function slugify(title: string): string {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return tokens.slice(0, 6).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "video";
}

export function makeProjectId(title: string): string {
  return `${slugify(title)}-${Date.now().toString(36)}`;
}

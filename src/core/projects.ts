// Project scaffolding + resolution. A project is a self-contained folder under
// projects/<slug>/ that will (Phase 3) become a HyperFrames composition.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS_DIR } from "../env";

export type Aspect = "9:16" | "16:9" | "1:1";

const STOPWORDS = new Set(["the", "a", "an", "of", "for", "to", "with", "about", "on", "in", "and", "or", "is", "are"]);

export function slugify(title: string): string {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const slug = tokens.slice(0, 6).join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || "untitled";
}

export interface ProjectMeta {
  id: string;
  name: string;
  aspect: Aspect;
  targetDurationSec: number;
  createdAt: string;
}

export function projectDir(id: string): string {
  return join(PROJECTS_DIR, id);
}

export function resolveProject(id: string): { dir: string; meta: ProjectMeta } {
  const dir = projectDir(id);
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) throw new Error(`Project "${id}" not found (no ${metaPath})`);
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as ProjectMeta;
  return { dir, meta };
}

export function createProject(title: string, aspect: Aspect, targetDurationSec: number, createdAt: string) {
  let id = slugify(title);
  // Avoid clobbering an existing project.
  let n = 2;
  while (existsSync(projectDir(id))) id = `${slugify(title)}-${n++}`;

  const dir = projectDir(id);
  for (const sub of ["", "audio", "assets", "clips", "out"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  const meta: ProjectMeta = { id, name: title, aspect, targetDurationSec, createdAt };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(join(dir, "script.txt"), "");
  return { id, dir, meta };
}

// Environment + path anchoring for the Reel MCP server.
// Anchored to the repo via import.meta.url (NOT cwd) — Claude Code may launch
// the server from anywhere.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECTS_DIR = join(ROOT, "projects");

// Tiny .env loader (no dependency) — mirrors scripts/probe-openai.mjs.
function loadEnv(): void {
  try {
    const txt = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env — rely on real environment */
  }
}
loadEnv();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

/** Logs MUST go to stderr — stdout is the MCP protocol channel. */
export function log(...args: unknown[]): void {
  console.error("[reel-mcp]", ...args);
}

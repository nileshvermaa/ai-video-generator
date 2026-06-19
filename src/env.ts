// Config + logging. On Vercel, env vars come from the project settings; the
// local .env loader below is a no-op there (file absent → caught).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = (() => {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), "..");
  } catch {
    return process.cwd();
  }
})();

// Tiny .env loader for LOCAL dev (no dependency). On Vercel this file doesn't
// exist, so the read throws and is swallowed — real env vars win.
function loadEnv(): void {
  try {
    const txt = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env — rely on real environment (Vercel) */
  }
}
loadEnv();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

/** Logs MUST go to stderr — stdout is the MCP protocol channel (stdio mode). */
export function log(...args: unknown[]): void {
  console.error("[reel-mcp]", ...args);
}

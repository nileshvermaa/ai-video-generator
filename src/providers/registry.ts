// Provider registry: maps each capability to a provider, with a per-call
// override possible later. Swap any line to repoint a capability at a new
// provider — that's the whole point of the abstraction.
import { OpenAIProvider } from "./openai";
import type { Capability, Provider } from "./types";

const providers: Record<string, Provider> = {
  openai: new OpenAIProvider(),
};

// Default routing. Today everything is OpenAI; tomorrow video could be "runway".
const routing: Record<Capability, string> = {
  video: "openai",
  tts: "openai",
  transcribe: "openai",
  image: "openai",
};

export function getProvider(cap: Capability, override?: string): Provider {
  const id = override || routing[cap];
  const p = providers[id];
  if (!p) throw new Error(`No provider "${id}" registered`);
  if (!p.capabilities[cap]) throw new Error(`Provider "${id}" does not support "${cap}"`);
  return p;
}

export function listProviders() {
  return {
    routing,
    providers: Object.values(providers).map((p) => ({ id: p.id, capabilities: p.capabilities })),
    note: "OpenAI video (Sora-2) API is flagged for shutdown Sept 24, 2026 — keep a second video adapter ready.",
  };
}

// End-to-end smoke test: spins up the real MCP server, connects a real MCP
// client over an in-memory transport, and calls the tools the way Claude Code
// will. Proves the wiring, not just the internals.
//
//   npm run smoke              # free + dry-run only (no OpenAI spend)
//   npm run smoke -- --narrate # also generate a tiny narration (few cents)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/tools";

const NARRATE = process.argv.includes("--narrate");

function show(label: string, res: any) {
  const text = res?.content?.[0]?.text ?? "";
  const flag = res?.isError ? "✗" : "✓";
  console.log(`\n${flag} ${label}\n${text}`);
  if (res?.isError) throw new Error(`${label} failed`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const server = new McpServer({ name: "reel-mcp", version: "test" });
  registerTools(server);

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "smoke", version: "test" });
  await server.connect(serverT);
  await client.connect(clientT);

  const tools = await client.listTools();
  console.log("Tools exposed:", tools.tools.map((t) => t.name).join(", "));

  show("list_providers", await client.callTool({ name: "list_providers", arguments: {} }));

  const proj: any = show(
    "create_project",
    await client.callTool({ name: "create_project", arguments: { title: "Smoke Test Reel", aspect: "9:16", targetDurationSec: 15 } })
  );
  const projectId = proj.projectId;

  if (NARRATE) {
    show(
      "generate_narration (PAID — tiny)",
      await client.callTool({ name: "generate_narration", arguments: { projectId, script: "This is the Reel MCP narration test.", voice: "alloy" } })
    );
  } else {
    console.log("\n· skipped generate_narration (pass --narrate to run it; costs a few cents)");
  }

  const clip: any = show(
    "generate_clip (dry-run — no spend)",
    await client.callTool({ name: "generate_clip", arguments: { projectId, prompt: "calm cyan particles drifting on dark blue", durationSec: 4 } })
  );
  show("get_job", await client.callTool({ name: "get_job", arguments: { jobId: clip.jobId } }));

  console.log("\n✅ smoke test passed");
  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ smoke test failed:", e?.message || e);
  process.exit(1);
});

// End-to-end smoke test: real MCP server + real MCP client over an in-memory
// transport. Tests the offline-safe tools (no OpenAI spend, no Blob needed):
// list_providers, create_project, and generate_clip in dry-run.
//
//   npm run smoke
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/tools";

function show(label: string, res: any) {
  const text = res?.content?.[0]?.text ?? "";
  console.log(`\n${res?.isError ? "✗" : "✓"} ${label}\n${text}`);
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
    await client.callTool({ name: "create_project", arguments: { title: "Smoke Test", aspect: "9:16" } })
  );
  show(
    "generate_clip (dry-run — no spend)",
    await client.callTool({ name: "generate_clip", arguments: { projectId: proj.projectId, prompt: "cyan particles on dark blue", seconds: 4, dryRun: true } })
  );

  console.log("\n✅ smoke test passed");
  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ smoke test failed:", e?.message || e);
  process.exit(1);
});

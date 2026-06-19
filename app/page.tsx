export default function Home() {
  return (
    <main style={{ padding: 48, maxWidth: 640 }}>
      <h1>Reel MCP</h1>
      <p>Remote MCP video server is running. Connect Claude to the MCP endpoint at a secret path.</p>
      <p style={{ color: "#888", fontSize: 14 }}>This page is just a health check — the work happens over the MCP protocol.</p>
    </main>
  );
}

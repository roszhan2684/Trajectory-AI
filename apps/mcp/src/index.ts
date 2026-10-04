#!/usr/bin/env -S npx tsx
/**
 * Trajectory MCP server (stdio). Exposes recruiting capabilities to Claude Desktop / Claude Code /
 * Cursor by calling the same application service layer as the web app, via its REST API.
 *
 * Auth: TRAJECTORY_API_KEY is a per-user key (hashed server-side, scoped to one organization).
 * This is appropriate for local use; a hosted deployment should use OAuth 2.1 per the MCP
 * authorization spec (see docs/security.md).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "./client";
import { TOOLS, runTool } from "./tools";

const baseUrl = process.env.TRAJECTORY_API_URL ?? "http://localhost:3000";
const apiKey = process.env.TRAJECTORY_API_KEY;
if (!apiKey) {
  console.error(
    "TRAJECTORY_API_KEY is required (create one under Settings → Integrations, or use a seeded trj_demo_* key locally).",
  );
  process.exit(1);
}

const client = createClient(baseUrl, apiKey);
const server = new McpServer(
  { name: "trajectory", version: "0.1.0" },
  {
    instructions:
      "Evidence-backed talent matching. Read tools are safe. Write tools only create drafts/proposals; applyRankingRefinement requires confirm=true after the user reviews the proposed changes. Never claim an intro was sent — that requires candidate consent and recruiter approval in the app.",
  },
);

for (const t of TOOLS) {
  server.registerTool(
    t.name,
    {
      title: t.title,
      description: t.description,
      inputSchema: t.input,
      annotations: {
        readOnlyHint: t.sideEffect === "none",
        destructiveHint: false,
        idempotentHint: t.sideEffect === "none",
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => {
      const res = await runTool(client, t.name, args);
      return res.ok
        ? { content: [{ type: "text" as const, text: JSON.stringify(res.data, null, 2) }] }
        : {
            isError: true,
            content: [{ type: "text" as const, text: `${res.error.code}: ${res.error.message}` }],
          };
    },
  );
}

await server.connect(new StdioServerTransport());
console.error(`trajectory-mcp ready · ${TOOLS.length} tools · API ${baseUrl}`);

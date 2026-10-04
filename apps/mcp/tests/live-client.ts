/** Manual smoke test: spawn the MCP server over stdio and call tools like a real MCP client would. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/index.ts"],
  env: {
    ...process.env,
    TRAJECTORY_API_URL: process.env.TRAJECTORY_API_URL ?? "http://localhost:3000",
    TRAJECTORY_API_KEY: process.env.TRAJECTORY_API_KEY ?? "trj_demo_priya",
  } as Record<string, string>,
});
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => `${t.name}${t.annotations?.readOnlyHint ? "" : "*"}`).join(", "));
const text = (r: Awaited<ReturnType<typeof client.callTool>>) => (r.content as { text: string }[])[0]!.text;
const search = JSON.parse(
  text(
    await client.callTool({
      name: "searchCandidates",
      arguments: { query: "search ranking engineer typesense in SF", limit: 3 },
    }),
  ),
);
console.log(
  "search:",
  search.found,
  "found ·",
  search.results.map((r: { name: string }) => r.name).join(", "),
  "· interpreted",
  search.interpreted.map((c: { label: string }) => c.label).join("/"),
);
const matches = JSON.parse(
  text(await client.callTool({ name: "listRoleMatches", arguments: { roleId: "role_0001", limit: 3 } })),
);
console.log(
  "matches:",
  matches.matches
    .map((m: { rank: number; candidate: string; score: number }) => `#${m.rank} ${m.candidate} ${m.score}`)
    .join(" | "),
);
const explain = JSON.parse(
  text(await client.callTool({ name: "explainMatch", arguments: { matchId: matches.matches[0].matchId } })),
);
console.log("explain:", explain.summary);
console.log(
  "why-not-100:",
  explain.whyNot100
    .slice(0, 2)
    .map((w: { label: string; pointsLost: number }) => `${w.label} −${w.pointsLost}`)
    .join(", "),
);
const refused = await client.callTool({
  name: "applyRankingRefinement",
  arguments: { refinementId: "ref_0001", confirm: false },
});
console.log("apply without confirm →", text(refused));
await client.close();

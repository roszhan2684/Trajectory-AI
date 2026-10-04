import { CircleDot, KeyRound, Plug, Terminal } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { integrationStatus } from "@/server/integrations";
import { getDB } from "@/server/db/store";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { ApiKeyCreator, RevokeKey } from "@/components/settings/forms";
import { SettingsNav } from "@/components/settings/settings-nav";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const actor = await requireActor();
  const rows = integrationStatus();
  const keys = getDB().apiKeys.filter((k) => k.userId === actor.user.id);
  const candidateKey = `trj_demo_${actor.user.email.split("@")[0]}`;
  const hasDemoKey = keys.some((k) => k.name === "Local demo key");
  const demoKey = hasDemoKey ? candidateKey : "<create a key above>";
  return (
    <>
      <PageHeader
        title="Settings"
        description="What this deployment is actually connected to — reported honestly."
      />
      <SettingsNav active="integrations" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            icon={<Plug className="size-3.5 text-muted" />}
            title="Integrations"
            description="This demo build ships local adapters behind the same interfaces a hosted stack would use. Nothing is faked as “connected”."
          />
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CircleDot className="size-3.5 text-info" />
                  <span className="text-[13px] font-medium text-ink">{r.name}</span>
                  <span className="text-xs text-muted">· {r.purpose}</span>
                  <Badge tone="info" className="ml-auto">
                    local adapter
                  </Badge>
                  {r.credentialsDetected && (
                    <Badge tone="warn">credentials detected — adapter not in this build</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{r.detail}</p>
                <p className="mt-1 font-mono text-[10.5px] text-faint">{r.env.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              icon={<KeyRound className="size-3.5 text-muted" />}
              title="API keys (MCP & REST)"
              description="Keys act as you, scoped to your organization. Stored as SHA-256 hashes."
            />
            <div className="space-y-4 p-4">
              <ApiKeyCreator />
              <ul className="divide-y divide-line rounded-lg border border-line text-[13px]">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1">
                      <span className="font-medium text-ink">{k.name}</span>{" "}
                      <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                      <span className="block text-[11px] text-faint">
                        created {timeAgo(k.createdAt)} · last used{" "}
                        {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}
                      </span>
                    </span>
                    <RevokeKey id={k.id} />
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
          <Panel>
            <PanelHeader
              icon={<Terminal className="size-3.5 text-muted" />}
              title="Connect an MCP client"
              description="Claude Desktop / Claude Code / Cursor — stdio transport."
            />
            <div className="space-y-2 p-4">
              <pre className="overflow-x-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-bg">{`{
  "mcpServers": {
    "trajectory": {
      "command": "pnpm",
      "args": ["--dir", "<repo>/apps/mcp", "start"],
      "env": {
        "TRAJECTORY_API_URL": "http://localhost:3000",
        "TRAJECTORY_API_KEY": "${demoKey}"
      }
    }
  }
}`}</pre>
              <p className="text-[11px] text-muted">
                The seeded <code className="font-mono">{demoKey}</code> key is a local-demo convenience — not
                production-grade auth. Production would use OAuth 2.1 per the MCP authorization spec (see
                docs/security.md).
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

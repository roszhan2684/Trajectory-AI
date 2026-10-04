"use client";
import * as React from "react";
import { ReactFlow, Background, Controls, type Edge, type Node, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Candidate } from "@trajectory/engine/client";
import { useEvidence } from "./evidence";

const STATUS_COLOR: Record<string, string> = {
  SUPPORTED: "var(--good)",
  PARTIAL: "var(--warn)",
  UNSUPPORTED: "var(--unknown)",
  CONFLICTED: "var(--bad)",
};

/** Claims (left) ↔ evidence nodes (right). Click any evidence node to open its source excerpt. */
export function EvidenceGraph({ candidate, focusSkills }: { candidate: Candidate; focusSkills?: string[] }) {
  const ev = useEvidence();
  const { nodes, edges } = React.useMemo(() => {
    const claims = candidate.claims
      .filter((c) => c.claimType !== "skill" || !focusSkills?.length || focusSkills.includes(c.claimKey))
      .sort(
        (a, b) =>
          (a.status === "CONFLICTED" ? -1 : 0) - (b.status === "CONFLICTED" ? -1 : 0) ||
          b.confidence - a.confidence,
      )
      .slice(0, 14);
    const claimIds = new Set(claims.map((c) => c.id));
    const links = candidate.claimLinks.filter((l) => claimIds.has(l.claimId));
    const evIds = [...new Set(links.map((l) => l.evidenceNodeId))].slice(0, 18);
    const evSet = new Set(evIds);
    const nodes: Node[] = [
      ...(claims.map((c, i) => ({
        id: c.id,
        position: { x: 0, y: i * 54 },
        data: { label: `${c.claimValue}` },
        style: {
          width: 210,
          fontSize: 11,
          borderRadius: 10,
          border: `1.5px solid ${STATUS_COLOR[c.status]}`,
          background: "var(--panel)",
          color: "var(--ink)",
          padding: "6px 8px",
        },
        sourcePosition: "right",
        targetPosition: "left",
      })) as Node[]),
      ...evIds.map((id, i) => {
        const n = candidate.evidence.find((x) => x.id === id)!;
        return {
          id,
          position: { x: 380, y: i * 46 },
          data: {
            label: `${n.type === "REPOSITORY" ? "⌥ " : n.type === "ANSWER" ? "✎ " : ""}${n.title.slice(0, 40)}`,
          },
          style: {
            width: 240,
            fontSize: 10.5,
            borderRadius: 8,
            border: "1px solid var(--line-strong)",
            background: "var(--panel-2)",
            color: "var(--ink-2)",
            padding: "5px 8px",
            cursor: "pointer",
          },
          targetPosition: "left",
          sourcePosition: "right",
        } as Node;
      }),
    ];
    const edges: Edge[] = links
      .filter((l) => evSet.has(l.evidenceNodeId))
      .map((l, i) => ({
        id: `e${i}`,
        source: l.claimId,
        target: l.evidenceNodeId,
        animated: l.relation === "CONTRADICTS",
        style: {
          stroke:
            l.relation === "CONTRADICTS"
              ? "var(--bad)"
              : l.relation === "CONTEXT"
                ? "var(--line-strong)"
                : "var(--accent)",
          strokeWidth: 0.5 + l.strength * 1.5,
          strokeDasharray: l.relation === "CONTEXT" ? "4 4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: l.relation === "CONTRADICTS" ? "var(--bad)" : "var(--accent)",
        },
      }));
    return { nodes, edges };
  }, [candidate, focusSkills]);

  return (
    <div
      className="h-[460px] rounded-xl border border-line bg-panel-2"
      aria-label="Evidence graph: claims linked to source evidence"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, n) => candidate.evidence.some((x) => x.id === n.id) && ev.open(n.id)}
        minZoom={0.4}
      >
        <Background gap={20} size={1} color="var(--line)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

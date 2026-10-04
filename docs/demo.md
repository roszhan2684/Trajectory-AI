# Demo script (4–6 minutes)

Setup: `pnpm install && pnpm seed && pnpm dev` → http://localhost:3000. Reset any time from _Settings → Organization → Reset demo data_ (owner) or `pnpm seed:reset`.

**Scene 0 — Landing (30s).** The hero card is the live ranking engine replaying the flagship re-rank. Mention: no AI APIs; models trained from scratch.

**Scene 1 — Role intake.** Sign in as **Jordan Reyes**. _Roles → New role → “Founding full-stack (demo script)”_ → _Parse brief_. Show confidence dots + source snippets, the Must/Strong/Nice/Hard/Needs-clarification buckets, and the protected-trait sample being blocked. _Approve & activate_ → matching job steps → matches.

**Scene 2 — Ranked candidates.** Open _Founding Full-Stack AI Engineer_. Walk the funnel: 150 in pool → 80 hybrid retrieval → 33 failed hard constraints → 47 scored → 25 reranked. Click _trace_.

**Scene 3 — Evidence & uncertainty.** Open **Ava Lindqvist (≈90)**. Click an evidence chip (resume excerpt highlighted at its exact offsets). _Why not 100?_ — production search is _missing evidence_, not negative. _What would change the score?_ — verified search experience → concrete delta.

**Scene 4 — Adaptive ranking.** _Refine ranking_: “These candidates feel too enterprise. Prioritize people who independently shipped products in teams under 30.” Review three allowlisted deltas → _Apply & re-rank_ → rows move; Noor rises to #1, Rafael ↑4, Marcus drops. Mention revert on the role page. Try “Prioritize younger engineers” → refused.

**Scene 5 — Qualification.** Open **Noor Haddad** (onsite willingness unknown) → _Ask questions_ → _Conversation_ → _Open candidate portal_ → answer _Yes_ → the portal shows the job steps; back in the app the constraint is PASS and score/confidence moved.

**Scene 6 — Human-approved intro.** _Introductions_ → Leila (awaiting candidate) → open portal → _Yes, introduce me_ → back → _Approve_ → _Mark as sent (demo — no email integration)_.

**Scene 7 — Engineering depth.** _Evals_ (ablation + external benchmark + training curve) · _Lab → Jobs_ (inject a transient failure, watch retries) · _Lab → Search internals_ (drift detection & repair) · `pnpm mcp` in Claude Desktop: “list matches for role_0001 and explain the top one”.

Closing line: _built around retrieval, ranking, explainability, uncertainty, feedback loops and human control — not a chatbot wrapped around a database._

## Personas

| Persona         | Org · role                        | Shows                              |
| --------------- | --------------------------------- | ---------------------------------- |
| Maya Okafor     | Northstar · Owner (+ Helix admin) | everything incl. Lab, org switcher |
| Jordan Reyes    | Northstar · Recruiter             | the main flow                      |
| Priya Natarajan | Northstar · Hiring manager        | HM intro approval (org setting)    |
| Sam Whitfield   | Northstar · Viewer                | read-only RBAC                     |
| Daniel Kim      | Helix · Admin                     | tenant isolation                   |
| Elena Rossi     | Lumen · Recruiter                 | robotics roles                     |
| Trajectory Ops  | all · Internal operator           | Lab/evals without hiring actions   |

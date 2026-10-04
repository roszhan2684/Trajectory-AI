# Contributing

```bash
pnpm install && pnpm seed && pnpm dev     # PORT=3100 pnpm dev if 3000 is busy
```

Before opening a PR, run what CI runs:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm eval -- --min-ndcg 0.80              # ranking quality gate
pnpm build && pnpm test:e2e
```

Ground rules:

- **Data access goes through services** in `apps/web/src/server/services`, which call `requireCap` and `assertTenant`. Pages, actions and API routes never touch the store directly.
- **Scoring changes bump `SCORE_VERSION`** (`packages/engine/src/scoring/config.ts`) and include before/after `pnpm eval` numbers in the PR.
- **Taxonomy changes** (`packages/engine/src/data/skills.json`) require `pnpm ml:train`; the parity test enforces it.
- **No LLM or AI API calls**, no new runtime network dependencies; see `docs/ai-safety.md`.
- Demo data is generated deterministically by `apps/web/src/server/seed`. Change the generator, not `.data/store.json`.

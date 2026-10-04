# Evaluation

## 1. Synthetic ranking suite (`/app/evals`, `pnpm eval`)

- **Dataset:** `Trajectory synthetic relevance v1` — 429 graded pairs (0–3) across all 20 roles: up to 18 family-relevant candidates + 6 negatives per role, plus hand labels for the 10 flagship candidates.
- **Labels come from generator intent, not from the ranker:** a role-family × candidate-archetype relevance table, adjusted for seniority fit and startup affinity, with explicit incompatibilities (won't work the required mode/location, needs sponsorship the role can't offer, salary > 1.15× max) labeled non-relevant.
- **Metrics:** Precision@5, Recall@10, NDCG@10 (exponential gains), MRR, hard-constraint violation rate in the top 10, explanation citation validity, structured-output (reranker schema) success, hallucinated-evidence rate, average ranking latency, LLM cost ($0 — no API calls).
- **Condensed lists (Sakai, 2007):** judgments are incomplete, so metrics are computed over the judged candidates in the order the system ranked them.
- **Configurations:** BM25 only → deterministic → + semantic → full pipeline. Custom blends can be run from the UI; every run stores scoring/prompt/code versions and its config.
- **CI gate:** `pnpm eval -- --min-ndcg 0.80` fails the build if the full pipeline drops below the threshold or surfaces any constraint violation.

## 2. External benchmark (fit model)

`ml/train.py` trains on the public `cnamuangtoun/resume-job-description-fit` dataset and evaluates once on its held-out test split (no job description overlap with training). Model selection (hidden size, L2, interaction features) uses a JD-grouped validation split only. Results, baselines (TF-IDF cosine, LSA cosine, skill coverage, near-linear scalar model), confusion matrix and the training curve are shown on the Evals page and stored in `reranker.json`.

| Model                         | NDCG@10   | P@5       | MRR       | Accuracy | Macro-F1 |
| ----------------------------- | --------- | --------- | --------- | -------- | -------- |
| Skill coverage                | 0.698     | 0.507     | 0.781     | —        | —        |
| TF-IDF cosine                 | 0.679     | 0.521     | 0.697     | —        | —        |
| LSA cosine                    | 0.724     | 0.571     | 0.786     | —        | —        |
| Near-linear (scalar features) | 0.697     | 0.529     | 0.806     | 0.453    | 0.356    |
| **Fit MLP**                   | **0.802** | **0.571** | **0.905** | 0.481    | 0.435    |

(Majority-class accuracy is 0.487 with macro-F1 ≈ 0.22; class-balanced training trades accuracy for macro-F1. The "Potential fit" class is genuinely ambiguous.)

## 3. Online signals

Shortlists, rejections with reasons, refinement frequency, intro requests/approvals and question answers are captured as audit events and PII-free analytics (`/app/lab/traces`). Demo values are labeled synthetic everywhere.

## What these numbers are not

Not production performance, not user traction. They show that each layer is measured and that changes can be compared.

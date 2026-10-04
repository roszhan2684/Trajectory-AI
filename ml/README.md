# ml/ — models trained from scratch

Two models power Trajectory's learned ranking layers. Both are trained here with **numpy only** (no scikit-learn, no PyTorch, no AI APIs) and served by hand-written TypeScript inference in `packages/engine/src/ml/`.

| Model                          | What                                                                                                                                                                                                   | Used for                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `lsa.json`                     | TF-IDF (uni+bigram, 10k vocab, min-df 5) → randomized truncated SVD, 96 dims, int8-quantized                                                                                                           | Semantic relevance layer (20% of the blend), evidence relevance, local hybrid search vectors               |
| `reranker.json` (`fit-mlp-v1`) | 2-layer MLP, 16 hidden units, over 12 scalar features + 12 element-wise LSA interactions. Hand-written forward/backward pass, Adam, class-balanced cross-entropy, dropout 0.3, L2 0.01, early stopping | Fit model on the top 25 candidates (15% of the blend), via expected relevance `P(Potential)·0.5 + P(Good)` |

## Dataset

[`cnamuangtoun/resume-job-description-fit`](https://huggingface.co/datasets/cnamuangtoun/resume-job-description-fit) — 6,241 train / 1,759 test resume ↔ job-description pairs labeled _No Fit / Potential Fit / Good Fit_. Downloaded to `ml/data/` (gitignored).

## Run

```bash
python3 -m pip install numpy        # the only dependency
python3 ml/download.py              # ~ curl from Hugging Face
pnpm ml:train                       # = python3 ml/train.py (~1–2 min on a laptop)
pnpm --filter @trajectory/engine test   # TS ↔ Python parity must still pass
```

Training writes `packages/engine/src/ml/models/{lsa,reranker}.json` and `packages/engine/tests/fixtures/ml-parity.json`. **Retrain whenever `packages/engine/src/data/skills.json` changes** — skill coverage features depend on the taxonomy and the parity test will fail otherwise.

## Methodology

- Validation is **grouped by job description** (15% of training JDs held out) so the model can't memorize a JD's candidate pool.
- Model selection (hidden ∈ {8, 16}, L2 ∈ {1e-4, 1e-3, 1e-2}, interactions on/off) uses **validation NDCG@10 only**; the test split is touched once.
- Ranking metrics are computed per JD with ≥ 1 Good Fit and ≥ 5 candidates (28 test queries).

## Held-out test results

| Ranker                             | NDCG@10   | P@5       | MRR       | Accuracy | Macro-F1 |
| ---------------------------------- | --------- | --------- | --------- | -------- | -------- |
| Majority class                     | —         | —         | —         | 0.487    | —        |
| TF-IDF cosine                      | 0.679     | 0.521     | 0.697     | —        | —        |
| Skill coverage                     | 0.698     | 0.507     | 0.781     | —        | —        |
| LSA cosine                         | 0.724     | 0.571     | 0.786     | —        | —        |
| Near-linear (scalar features only) | 0.697     | 0.529     | 0.806     | 0.453    | 0.356    |
| **Fit MLP**                        | **0.802** | **0.571** | **0.905** | 0.481    | 0.435    |

The 3-class accuracy is modest — below the majority-class baseline's 0.487, while macro-F1 is far higher because the model actually predicts all three classes. Labels are noisy and _Potential Fit_ is hard to separate, which is why the model is used only as a bounded reranking signal, never as a gate. Full numbers, curves and the model-selection grid are embedded in `reranker.json` (`training`, `modelSelection`, `testResults`). See `docs/evaluation.md` for in-product evaluation.

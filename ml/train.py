"""Trajectory AI — from-scratch model training.

Trains two models used by the matching engine, with no AI APIs and no ML libraries
(numpy is used only for array math):

1. LSA embeddings  — TF-IDF (uni+bigram) + randomized truncated SVD over resume/JD chunks.
                     Powers the "semantic relevance" ranking layer and evidence relevance.
2. Fit reranker    — a 2-layer MLP (hand-written forward/backward pass, Adam, class-balanced
                     softmax cross-entropy, early stopping) that predicts
                     P(No Fit | Potential Fit | Good Fit) for a (role, candidate) text pair.
                     Replaces the "LLM reranker" layer from the build spec.

Dataset: cnamuangtoun/resume-job-description-fit (run ml/download.py first).
Outputs: packages/engine/src/ml/models/{lsa,reranker}.json + parity fixtures for TS tests.
"""

from __future__ import annotations

import base64
import csv
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "ml", "data")
ENGINE_DATA = os.path.join(ROOT, "packages", "engine", "src", "data")
OUT = os.path.join(ROOT, "packages", "engine", "src", "ml", "models")
FIXTURES = os.path.join(ROOT, "packages", "engine", "tests", "fixtures")

SEED = 7
DIMS = 96
VOCAB_SIZE = 10000
MIN_DF = 5
MAX_DF_RATIO = 0.5
CHUNK_TOKENS = 120
DATASET_PRESENT_YEAR = 2024  # resumes in the corpus were collected ~2023-2024
LABELS = ["No Fit", "Potential Fit", "Good Fit"]

csv.field_size_limit(sys.maxsize)

# ----------------------------------------------------------------------------------------------
# Text processing (mirrored exactly in packages/engine/src/text.ts)
# ----------------------------------------------------------------------------------------------
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.]*")
STOPWORDS = set(json.load(open(os.path.join(ENGINE_DATA, "stopwords.json"))))
SKILLS = json.load(open(os.path.join(ENGINE_DATA, "skills.json")))


def tokenize(text: str) -> list[str]:
    out = []
    for t in TOKEN_RE.findall(text.lower()):
        t = t.rstrip(".")
        if t:
            out.append(t)
    return out


def terms(tokens: list[str]) -> list[str]:
    """Content terms: stopwords/digits removed, plus adjacent bigrams."""
    kept = [t for t in tokens if len(t) >= 2 and t not in STOPWORDS and not t.isdigit()]
    return kept + [kept[i] + "_" + kept[i + 1] for i in range(len(kept) - 1)]


# Skill alias index: first token -> list of (alias token tuple, skill key)
ALIAS_INDEX: dict[str, list[tuple[tuple[str, ...], str]]] = defaultdict(list)
for s in SKILLS:
    for a in s["aliases"]:
        toks = tuple(tokenize(a))
        if toks:
            ALIAS_INDEX[toks[0]].append((toks, s["key"]))
for k in ALIAS_INDEX:
    ALIAS_INDEX[k].sort(key=lambda x: -len(x[0]))
SKILL_CATEGORY = {s["key"]: s["category"] for s in SKILLS}


def extract_skills(tokens: list[str]) -> set[str]:
    found = set()
    i = 0
    n = len(tokens)
    while i < n:
        matched = 0
        for toks, key in ALIAS_INDEX.get(tokens[i], ()):
            L = len(toks)
            if tuple(tokens[i : i + L]) == toks:
                found.add(key)
                matched = L
                break
        i += matched or 1
    return found


YEARS_REQ_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)")
RANGE_RE = re.compile(
    r"(?:\d{1,2}/)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:(?:\d{1,2}/)?((?:19|20)\d{2})|(present|current|now))"
)


def years_required(text: str) -> float | None:
    vals = [int(m) for m in YEARS_REQ_RE.findall(text.lower()) if 0 < int(m) <= 20]
    return float(min(vals)) if vals else None


def years_experience(text: str, present_year: int) -> float:
    intervals = []
    for start, end, cur in RANGE_RE.findall(text.lower()):
        s = int(start)
        e = present_year if cur else int(end)
        if 1970 <= s <= present_year and s <= e <= present_year:
            intervals.append((s, e))
    if not intervals:
        return 0.0
    intervals.sort()
    total, cs, ce = 0, intervals[0][0], intervals[0][1]
    for s, e in intervals[1:]:
        if s <= ce:
            ce = max(ce, e)
        else:
            total += ce - cs
            cs, ce = s, e
    total += ce - cs
    return float(min(total, 40))


# ----------------------------------------------------------------------------------------------
# Sparse helpers (CSR) — randomized SVD needs X@B and X^T@B without a sparse library
# ----------------------------------------------------------------------------------------------
class CSR:
    def __init__(self, data, indices, indptr, ncols):
        self.data = data.astype(np.float32)
        self.indices = indices.astype(np.int64)
        self.indptr = indptr.astype(np.int64)
        self.nrows = len(indptr) - 1
        self.ncols = ncols

    def matmul(self, B: np.ndarray, batch_rows: int = 2000) -> np.ndarray:
        out = np.zeros((self.nrows, B.shape[1]), dtype=np.float32)
        for r0 in range(0, self.nrows, batch_rows):
            r1 = min(self.nrows, r0 + batch_rows)
            a, b = self.indptr[r0], self.indptr[r1]
            if a == b:
                continue
            prod = self.data[a:b, None] * B[self.indices[a:b]]
            starts = self.indptr[r0:r1] - a
            nonempty = self.indptr[r0 + 1 : r1 + 1] > self.indptr[r0:r1]
            sums = np.add.reduceat(prod, np.minimum(starts, len(prod) - 1), axis=0)
            out[r0:r1][nonempty] = sums[nonempty]
        return out

    def transpose(self) -> "CSR":
        order = np.argsort(self.indices, kind="stable")
        rows = np.repeat(np.arange(self.nrows), np.diff(self.indptr))
        t_indices = rows[order]
        t_data = self.data[order]
        counts = np.bincount(self.indices, minlength=self.ncols)
        t_indptr = np.concatenate([[0], np.cumsum(counts)])
        return CSR(t_data, t_indices, t_indptr, self.nrows)


def randomized_svd(X: CSR, k: int, oversample: int = 12, power_iters: int = 4, seed: int = SEED):
    """Halko–Martinsson–Tropp randomized range finder + small dense SVD."""
    rng = np.random.default_rng(seed)
    XT = X.transpose()
    omega = rng.standard_normal((X.ncols, k + oversample)).astype(np.float32)
    Y = X.matmul(omega)
    Q, _ = np.linalg.qr(Y)
    for _ in range(power_iters):
        Z, _ = np.linalg.qr(XT.matmul(Q.astype(np.float32)))
        Q, _ = np.linalg.qr(X.matmul(Z.astype(np.float32)))
    Bt = XT.matmul(Q.astype(np.float32))  # (V x l) == (Q^T X)^T
    U_b, S, Vt = np.linalg.svd(Bt.T, full_matrices=False)
    return S[:k], Vt[:k].T  # singular values, term vectors (V x k)


# ----------------------------------------------------------------------------------------------
# Data loading
# ----------------------------------------------------------------------------------------------
def load(split: str):
    rows = list(csv.DictReader(open(os.path.join(DATA, f"{split}.csv"), encoding="utf-8")))
    return [(r["resume_text"], r["job_description_text"], LABELS.index(r["label"])) for r in rows]


class Vectorizer:
    def __init__(self, vocab: list[str], idf: np.ndarray):
        self.vocab = vocab
        self.index = {t: i for i, t in enumerate(vocab)}
        self.idf = idf

    def tfidf(self, text: str) -> dict[int, float]:
        return self.tfidf_tokens(tokenize(text))

    def tfidf_tokens(self, tokens: list[str]) -> dict[int, float]:
        c = Counter(t for t in terms(tokens) if t in self.index)
        vec = {self.index[t]: (1.0 + math.log(n)) * float(self.idf[self.index[t]]) for t, n in c.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {i: v / norm for i, v in vec.items()}


def sparse_dot(a: dict[int, float], b: dict[int, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(i, 0.0) for i, v in a.items())


def embed(vec: dict[int, float], term_vectors: np.ndarray) -> np.ndarray:
    if not vec:
        return np.zeros(term_vectors.shape[1], dtype=np.float32)
    idx = np.fromiter(vec.keys(), dtype=np.int64)
    val = np.fromiter(vec.values(), dtype=np.float32)
    e = val @ term_vectors[idx]
    n = float(np.linalg.norm(e))
    return e / n if n > 0 else e


PASSAGE_TOKENS = 60
KEY_TERMS = 25
INTERACTION_DIMS = 12

SCALAR_FEATURES = [
    "tfidf_cosine",
    "lsa_cosine",
    "best_passage_cosine",
    "top3_passage_cosine",
    "key_term_coverage",
    "skill_coverage",
    "skill_precision",
    "category_coverage",
    "log_role_skills",
    "log_candidate_skills",
    "years_gap",
    "has_years_requirement",
]


def pair_features(role_text, cand_text, vz, tv, cache, present_year):
    def info(text):
        if text not in cache:
            toks = tokenize(text)
            v = vz.tfidf(text)
            passages = []
            for i in range(0, max(1, len(toks)), PASSAGE_TOKENS):
                seg = toks[i : i + PASSAGE_TOKENS]
                if len(seg) >= 8 or i == 0:
                    pv = vz.tfidf_tokens(seg)
                    if pv:
                        passages.append(embed(pv, tv))
            top = sorted(v.items(), key=lambda x: (-x[1], x[0]))[:KEY_TERMS]
            cache[text] = {
                "vec": v,
                "emb": embed(v, tv),
                "passages": np.array(passages) if passages else np.zeros((1, tv.shape[1]), dtype=np.float32),
                "top": top,
                "skills": extract_skills(toks),
                "years_req": years_required(text),
                "years_exp": years_experience(text, present_year),
            }
        return cache[text]

    r, c = info(role_text), info(cand_text)
    rs, cs = r["skills"], c["skills"]
    inter = rs & cs
    rcat = {SKILL_CATEGORY[s] for s in rs}
    ccat = {SKILL_CATEGORY[s] for s in cs}
    yr = r["years_req"]
    pc = np.sort(c["passages"] @ r["emb"])[::-1]
    tw = sum(w for _, w in r["top"]) or 1.0
    scal = [
        sparse_dot(r["vec"], c["vec"]),
        float(r["emb"] @ c["emb"]),
        float(pc[0]),
        float(pc[:3].mean()),
        sum(w for i, w in r["top"] if i in c["vec"]) / tw,
        len(inter) / max(1, len(rs)),
        len(inter) / max(1, len(cs)),
        len(rcat & ccat) / max(1, len(rcat)),
        math.log1p(len(rs)),
        math.log1p(len(cs)),
        float(np.clip((c["years_exp"] - yr) / 5.0, -2, 2)) if yr is not None else 0.0,
        1.0 if yr is not None else 0.0,
    ]
    k = INTERACTION_DIMS
    return (r["emb"][:k] * c["emb"][:k]), np.array(scal, dtype=np.float32)


# ----------------------------------------------------------------------------------------------
# MLP (hand-written)
# ----------------------------------------------------------------------------------------------
class MLP:
    def __init__(self, d_in, d_hidden, d_out, rng):
        self.W1 = (rng.standard_normal((d_in, d_hidden)) * math.sqrt(2.0 / d_in)).astype(np.float64)
        self.b1 = np.zeros(d_hidden)
        self.W2 = (rng.standard_normal((d_hidden, d_out)) * math.sqrt(1.0 / d_hidden)).astype(np.float64)
        self.b2 = np.zeros(d_out)
        self.params = ["W1", "b1", "W2", "b2"]
        self.m = {p: np.zeros_like(getattr(self, p)) for p in self.params}
        self.v = {p: np.zeros_like(getattr(self, p)) for p in self.params}
        self.t = 0

    def forward(self, X, train=False, dropout=0.0, rng=None):
        z1 = X @ self.W1 + self.b1
        h = np.maximum(z1, 0)
        mask = None
        if train and dropout > 0:
            mask = (rng.random(h.shape) > dropout) / (1 - dropout)
            h = h * mask
        logits = h @ self.W2 + self.b2
        return logits, (X, z1, h, mask)

    @staticmethod
    def softmax(logits):
        z = logits - logits.max(axis=1, keepdims=True)
        e = np.exp(z)
        return e / e.sum(axis=1, keepdims=True)

    def step(self, X, y, w, lr, l2, dropout, rng):
        logits, (X_, z1, h, mask) = self.forward(X, True, dropout, rng)
        p = self.softmax(logits)
        n = len(y)
        sw = w[y]
        loss = -np.sum(sw * np.log(p[np.arange(n), y] + 1e-12)) / sw.sum()
        d_logits = p.copy()
        d_logits[np.arange(n), y] -= 1
        d_logits *= (sw / sw.sum())[:, None]
        grads = {
            "W2": h.T @ d_logits + l2 * self.W2,
            "b2": d_logits.sum(axis=0),
        }
        dh = d_logits @ self.W2.T
        if mask is not None:
            dh = dh * mask
        dz1 = dh * (z1 > 0)
        grads["W1"] = X_.T @ dz1 + l2 * self.W1
        grads["b1"] = dz1.sum(axis=0)
        # Adam
        self.t += 1
        b1, b2, eps = 0.9, 0.999, 1e-8
        for p_ in self.params:
            self.m[p_] = b1 * self.m[p_] + (1 - b1) * grads[p_]
            self.v[p_] = b2 * self.v[p_] + (1 - b2) * grads[p_] ** 2
            mh = self.m[p_] / (1 - b1**self.t)
            vh = self.v[p_] / (1 - b2**self.t)
            setattr(self, p_, getattr(self, p_) - lr * mh / (np.sqrt(vh) + eps))
        return loss

    def predict(self, X):
        return self.softmax(self.forward(X)[0])


def train_model(Xtr, ytr, Xva, yva, hidden, epochs=150, lr=2e-3, l2=1e-4, dropout=0.2, patience=15):
    rng = np.random.default_rng(SEED)
    counts = np.bincount(ytr, minlength=3)
    w = len(ytr) / (3 * np.maximum(counts, 1))
    model = MLP(Xtr.shape[1], hidden, 3, rng)
    best = (float("inf"), None, 0)
    curve = []
    for ep in range(epochs):
        order = rng.permutation(len(ytr))
        losses = []
        for i in range(0, len(order), 128):
            b = order[i : i + 128]
            losses.append(model.step(Xtr[b], ytr[b], w, lr, l2, dropout, rng))
        pva = model.predict(Xva)
        val_loss = float(-np.mean(w[yva] * np.log(pva[np.arange(len(yva)), yva] + 1e-12)) / np.mean(w[yva]))
        val_acc = float(np.mean(pva.argmax(1) == yva))
        curve.append({"epoch": ep + 1, "trainLoss": round(float(np.mean(losses)), 4), "valLoss": round(val_loss, 4), "valAccuracy": round(val_acc, 4)})
        if val_loss < best[0] - 1e-4:
            best = (val_loss, {p: getattr(model, p).copy() for p in model.params}, ep + 1)
        elif ep + 1 - best[2] >= patience:
            break
    for p, v in best[1].items():
        setattr(model, p, v)
    return model, curve, best[2]


# ----------------------------------------------------------------------------------------------
# Metrics
# ----------------------------------------------------------------------------------------------
def classification_metrics(y, pred):
    cm = np.zeros((3, 3), dtype=int)
    for a, b in zip(y, pred):
        cm[a, b] += 1
    f1s = []
    for c in range(3):
        tp = cm[c, c]
        prec = tp / max(1, cm[:, c].sum())
        rec = tp / max(1, cm[c, :].sum())
        f1s.append(0 if prec + rec == 0 else 2 * prec * rec / (prec + rec))
    return {"accuracy": round(float(np.mean(np.array(y) == np.array(pred))), 4), "macroF1": round(float(np.mean(f1s)), 4), "perClassF1": [round(float(f), 4) for f in f1s], "confusion": cm.tolist()}


def ndcg_at(gains_sorted, ideal_sorted, k):
    def dcg(g):
        return sum((2**x - 1) / math.log2(i + 2) for i, x in enumerate(g[:k]))

    ideal = dcg(ideal_sorted)
    return dcg(gains_sorted) / ideal if ideal > 0 else None


def ranking_metrics(groups, scores, labels):
    """Per-JD ranking of resumes; gains Good=2, Potential=1, No=0."""
    by = defaultdict(list)
    for g, s, l in zip(groups, scores, labels):
        by[g].append((s, l))
    nd, p5, mrr = [], [], []
    for items in by.values():
        if len(items) < 3 or not any(l == 2 for _, l in items):
            continue
        ranked = [l for _, l in sorted(items, key=lambda x: -x[0])]
        v = ndcg_at(ranked, sorted(ranked, reverse=True), 10)
        if v is not None:
            nd.append(v)
        p5.append(sum(1 for l in ranked[:5] if l == 2) / min(5, len(ranked)))
        first = next((i for i, l in enumerate(ranked) if l == 2), None)
        mrr.append(1 / (first + 1) if first is not None else 0)
    return {"ndcg10": round(float(np.mean(nd)), 4), "precision5": round(float(np.mean(p5)), 4), "mrr": round(float(np.mean(mrr)), 4), "queries": len(nd)}


# ----------------------------------------------------------------------------------------------
def quantize_rows(M: np.ndarray):
    scale = np.maximum(np.abs(M).max(axis=1), 1e-8) / 127.0
    q = np.round(M / scale[:, None]).astype(np.int8)
    return q, scale


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(FIXTURES, exist_ok=True)
    train, test = load("train"), load("test")
    print(f"loaded train={len(train)} test={len(test)}")

    train_jds = {jd for _, jd, _ in train}
    test_jds = {jd for _, jd, _ in test}
    train_res = {r for r, _, _ in train}
    test_res = {r for r, _, _ in test}
    leakage = {"testJobsSeenInTrain": len(test_jds & train_jds), "testJobs": len(test_jds), "testResumesSeenInTrain": len(test_res & train_res), "testResumes": len(test_res)}
    print("overlap:", leakage)

    # ---- 1. vocabulary + IDF over chunked training corpus (train split only) -------------
    docs = sorted(train_jds | train_res)
    chunks = []
    for d in docs:
        toks = tokenize(d)
        for i in range(0, max(1, len(toks)), CHUNK_TOKENS):
            seg = toks[i : i + CHUNK_TOKENS]
            if len(seg) >= 20:
                chunks.append(terms(seg))
    df = Counter()
    for c in chunks:
        df.update(set(c))
    max_df = MAX_DF_RATIO * len(chunks)
    cand = [(t, n) for t, n in df.items() if MIN_DF <= n <= max_df]
    cand.sort(key=lambda x: (-x[1], x[0]))
    vocab = sorted(t for t, _ in cand[:VOCAB_SIZE])
    index = {t: i for i, t in enumerate(vocab)}
    N = len(chunks)
    idf = np.array([math.log((1 + N) / (1 + df[t])) + 1 for t in vocab], dtype=np.float32)
    print(f"chunks={N} vocab={len(vocab)}")

    # ---- 2. TF-IDF chunk matrix + randomized SVD ------------------------------------------
    data, indices, indptr = [], [], [0]
    for c in chunks:
        cnt = Counter(t for t in c if t in index)
        row = {index[t]: (1 + math.log(n)) * idf[index[t]] for t, n in cnt.items()}
        if not row:
            continue
        norm = math.sqrt(sum(v * v for v in row.values())) or 1.0
        for i in sorted(row):
            indices.append(i)
            data.append(row[i] / norm)
        indptr.append(len(indices))
    X = CSR(np.array(data), np.array(indices), np.array(indptr), len(vocab))
    S, term_vectors = randomized_svd(X, DIMS)
    term_vectors = term_vectors.astype(np.float32)
    explained = float((S**2).sum())
    print(f"svd done: top singular values {np.round(S[:5], 2).tolist()} ({time.time() - t0:.1f}s)")

    q, scale = quantize_rows(term_vectors)
    tv = (q.astype(np.float32) * scale[:, None]).astype(np.float32)  # train on dequantized = parity with TS
    vz = Vectorizer(vocab, idf)

    # ---- 3. pair features --------------------------------------------------------------------
    cache: dict = {}

    def featurize(rows):
        E, Sx = [], []
        for res, jd, _ in rows:
            e, s = pair_features(jd, res, vz, tv, cache, DATASET_PRESENT_YEAR)
            E.append(e)
            Sx.append(s)
        return np.array(E), np.array(Sx)

    Etr, Str = featurize(train)
    Ete, Ste = featurize(test)
    ytr = np.array([l for _, _, l in train])
    yte = np.array([l for _, _, l in test])
    print(f"features built ({time.time() - t0:.1f}s)")

    mu, sd = Str.mean(axis=0), Str.std(axis=0) + 1e-6
    Xtr = np.concatenate([Etr * 4.0, (Str - mu) / sd], axis=1)
    Xte = np.concatenate([Ete * 4.0, (Ste - mu) / sd], axis=1)

    # grouped validation split by job description (no JD leaks between train/val)
    rng = np.random.default_rng(SEED)
    jd_list = sorted(train_jds)
    rng.shuffle(jd_list)
    val_jds = set(jd_list[: int(0.15 * len(jd_list))])
    is_val = np.array([jd in val_jds for _, jd, _ in train])

    n_emb = Etr.shape[1]
    # Model selection uses ONLY the grouped validation split (test is touched once, at the end).
    grid = []
    for hidden in (8, 16, 32):
        for l2 in (1e-4, 1e-3, 1e-2):
            for use_emb in (False, True):
                cols = slice(0, None) if use_emb else slice(n_emb, None)
                m, cv, be = train_model(Xtr[~is_val][:, cols], ytr[~is_val], Xtr[is_val][:, cols], ytr[is_val], hidden=hidden, l2=l2, dropout=0.3)
                pv = m.predict(Xtr[is_val][:, cols])
                vg = [jd for (_, jd, _), f in zip(train, is_val) if f]
                rm = ranking_metrics(vg, pv[:, 2] + 0.5 * pv[:, 1], ytr[is_val])
                cmv = classification_metrics(ytr[is_val], pv.argmax(1))
                grid.append({"hidden": hidden, "l2": l2, "interactions": use_emb, "valNdcg10": rm["ndcg10"], "valMacroF1": cmv["macroF1"], "valLoss": cv[be - 1]["valLoss"]})
                print(grid[-1])
    best_cfg = max(grid, key=lambda g: (g["valNdcg10"] + g["valMacroF1"]))
    print("selected", best_cfg)
    use_cols = slice(0, None) if best_cfg["interactions"] else slice(n_emb, None)
    model, curve, best_epoch = train_model(Xtr[~is_val][:, use_cols], ytr[~is_val], Xtr[is_val][:, use_cols], ytr[is_val], hidden=best_cfg["hidden"], l2=best_cfg["l2"], dropout=0.3)
    # Baseline: near-linear model on scalar features only
    lin, _, _ = train_model(Xtr[~is_val][:, n_emb:], ytr[~is_val], Xtr[is_val][:, n_emb:], ytr[is_val], hidden=2, l2=1e-3)
    Xtr, Xte = Xtr[:, use_cols], Xte[:, use_cols]

    pte = model.predict(Xte)
    plin = lin.predict(Xte[:, -len(SCALAR_FEATURES):])
    rel = pte[:, 2] + 0.5 * pte[:, 1]
    groups = [jd for _, jd, _ in test]

    results = {
        "mlp": {**classification_metrics(yte, pte.argmax(1)), **ranking_metrics(groups, rel, yte)},
        "scalarOnly": {**classification_metrics(yte, plin.argmax(1)), **ranking_metrics(groups, plin[:, 2] + 0.5 * plin[:, 1], yte)},
        "tfidfCosine": ranking_metrics(groups, Ste[:, 0], yte),
        "lsaCosine": ranking_metrics(groups, Ste[:, 1], yte),
        "skillCoverage": ranking_metrics(groups, Ste[:, 2], yte),
        "majorityClass": {"accuracy": round(float(np.mean(yte == 0)), 4)},
    }
    print(json.dumps(results, indent=1))

    # ---- 4. export ------------------------------------------------------------------------
    lsa = {
        "version": "lsa-v1",
        "dims": DIMS,
        "chunkTokens": CHUNK_TOKENS,
        "trainedOn": {"dataset": "cnamuangtoun/resume-job-description-fit", "split": "train", "documents": len(docs), "chunks": N},
        "singularValues": [round(float(s), 4) for s in S],
        "vocab": vocab,
        "idf": [round(float(x), 5) for x in idf],
        "scale": [float(f"{x:.6g}") for x in scale],
        "vectors": base64.b64encode(q.tobytes()).decode("ascii"),
    }
    json.dump(lsa, open(os.path.join(OUT, "lsa.json"), "w"), separators=(",", ":"))

    def r(a):
        return np.round(a, 6).tolist()

    reranker = {
        "version": "fit-mlp-v1",
        "labels": LABELS,
        "embeddingScale": 4.0,
        "scalarFeatures": SCALAR_FEATURES,
        "scalarMean": r(mu),
        "scalarStd": r(sd),
        "hidden": best_cfg["hidden"],
        "interactionDims": INTERACTION_DIMS if best_cfg["interactions"] else 0,
        "passageTokens": PASSAGE_TOKENS,
        "keyTerms": KEY_TERMS,
        "modelSelection": grid,
        "W1": r(model.W1),
        "b1": r(model.b1),
        "W2": r(model.W2),
        "b2": r(model.b2),
        "presentYearForTraining": DATASET_PRESENT_YEAR,
        "training": {
            "dataset": "cnamuangtoun/resume-job-description-fit",
            "trainPairs": int((~is_val).sum()),
            "validationPairs": int(is_val.sum()),
            "testPairs": len(test),
            "validation": "grouped by job description (15% of train JDs held out)",
            "bestEpoch": best_epoch,
            "optimizer": f"Adam lr=2e-3, batch 128, L2 {best_cfg['l2']}, dropout 0.3, class-balanced CE",
            "curve": curve,
            "overlap": leakage,
            "trainedAt": time.strftime("%Y-%m-%d"),
            "seconds": round(time.time() - t0, 1),
        },
        "testResults": results,
    }
    json.dump(reranker, open(os.path.join(OUT, "reranker.json"), "w"), separators=(",", ":"))

    # parity fixtures: TS implementation must reproduce these features/probabilities
    fx = []
    for i in [0, 5, 17, 42, 101]:
        res, jd, lab = test[i]
        e, s = pair_features(jd, res, vz, tv, cache, DATASET_PRESENT_YEAR)
        x = np.concatenate([e * 4.0, (s - mu) / sd])[None, :][:, use_cols]
        fx.append({"role": jd, "candidate": res, "scalars": r(s), "probs": r(model.predict(x)[0]), "skills": sorted(extract_skills(tokenize(jd)))})
    json.dump(fx, open(os.path.join(FIXTURES, "ml-parity.json"), "w"))
    print(f"exported models to {OUT} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()

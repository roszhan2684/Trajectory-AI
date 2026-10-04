# ADR-0005 — Condensed-list evaluation and an explicit labeling policy

**Status:** accepted

**Context.** Labels exist for ~21 candidates per role; scoring unjudged candidates as non-relevant penalized correct retrieval of unlabeled-but-relevant people, and an oracle that ignored explicit incompatibilities penalized correct hard-constraint filtering.

**Decision.** Use condensed lists (Sakai, 2007): metrics over judged candidates in system order. Label explicit incompatibilities (won't work the required mode/location, needs sponsorship the role can't offer, salary > 1.15 × max) as non-relevant, as a recruiter would.

**Consequences.** Metrics measure ordering quality on judged items and reward constraint handling; absolute values are not comparable to complete-judgment benchmarks.

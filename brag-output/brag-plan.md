# Brag Plan: Trajectory

## What is this app?

An evidence-backed talent-matching SaaS: it turns a messy hiring brief into structured requirements, ranks candidates with hybrid retrieval + deterministic scoring + a fit model trained from scratch, shows _why_ every match scored what it did (and why it isn't 100), and re-ranks from one sentence of recruiter feedback — with a human approving every consequential step.

## The angle

Recruiting software hands you a number and asks you to trust it. Trajectory is the opposite: **it shows its work.** The film is a quiet, confident product walk-through where every claim on screen is backed by the real UI and real numbers from the demo dataset (Ava 90.4 → after feedback Noor rises to #1). Premium, restrained, Linear-launch energy — no hype words.

## Hook (first 2-3 seconds)

A single giant, anonymous score — **"87%"** — sits alone on black, the way every ATS presents candidates. A quiet beat, then a thin line of text underneath: _"…based on what?"_ The number dims and fractures into the evidence-backed score breakdown. Voice: "Every hiring tool hands you a number. Almost none of them show their work."

## Key moments (the middle)

- **The brief becomes structure.** A messy one-line brief types into the role composer; requirement chips fly into **Must have / Strong signal / Nice to have** columns, one ambiguity lands in **Needs clarification** ("Compensation range?").
- **Evidence + Why not 100.** The ranked list (Ava Lindqvist 90.4, Noor Haddad 87.4, Grace Jensen 84.1). Ava's row opens: a resume line highlights in violet ("Shipped LLM features in production…" → _LLM applications: supported_), then the **Why not 100?** bars draw, top one labeled _Production search — missing evidence_.
- **One sentence re-ranks the role.** Feedback types: "Too enterprise. Prioritize people who shipped independently in teams under 30." Three reviewable delta chips appear (enterprise −0.08, independent +0.18, small team +0.12), the human clicks Apply, rows physically re-order: **Noor ↑ to #1 (85.9)**, Rafael Larsen ↑4, scores tick to their new values.

## Outro / punchline

Trajectory wordmark, tagline in serif italic: _"Find the person who fits where you're going."_ A small honest line beneath: "Evidence-backed · Human-approved · No AI APIs." Voice: "Trajectory. Hire for where they're going."

## User flow worth showing

1. Paste a brief → structured, editable requirements (Role intake).
2. Ranked matches → open the top match → evidence + Why-not-100 (Match detail).
3. Type feedback → review deltas → apply → before/after re-rank (Refinement drawer + match board).

## Tone

- Preset: polished
- Creative direction: quiet premium product film for an explainable ranking engine
- Interpretation: slow, confident reveals, generous holds, one idea per scene; motion is precise (springy row re-ordering, drawn bars) rather than flashy. Five scenes instead of the preset's 3–4 because the real flow has four distinct beats; each still gets ~4–5s.

## Format: landscape — 1920x1080

## Duration: 24s

## Visual identity (from the project)

- Background: #08090b (marketing site), panels #0f1013 / #111316, hairline borders rgba(255,255,255,0.08–0.10)
- Accent: #8b8cf6 (violet), positive #4ade80 / emerald-300, negative #fb923c
- Text: #ffffff primary, rgba(255,255,255,0.55) secondary
- Display font: Geist Sans (600, tight tracking); accent words in Instrument Serif italic
- Body font: Geist Sans; numbers tabular; code/metadata Geist Mono
- Strongest visual element: the landing hero's live ranking-replay card (rows re-ordering with ticking scores) and the violet evidence highlight

## Share copy (draft)

Recruiting tools give you a score. Trajectory shows its work — evidence for every claim, "why not 100?", and rankings that learn from one sentence of feedback. Built from scratch, no AI APIs.

## Audio direction

- Role: warm, low music bed under a calm voiceover; voice leads.
- Music: happy-beats-business-moves-vol-10 (≈110 BPM, 60s) — light and modern; ducked well under narration.
- Music treatment: fade in over the first 0.8s at low volume, sit at ~-18 dB under VO, small lift for the outro, 1.2s fade-out.
- Music cue guidance: preset read (vol-10, 109.96 BPM). Strong cues usable: 15.82s (re-rank reorder), 20.19s (outro wordmark), 22.92s (tagline settle). Beat grid ~0.55s; requirement chips in Scene 2 arrive every other beat (~1.1s) is too slow — chips may arrive on single beats (they're labels, held afterwards as a set).
- Audio-reactive treatment: none / extremely subtle (outro glow may breathe with RMS).
- SFX posture: sparse, motion-matched, professional — soft keyboard ticks for typed text, a soft UI click on "Apply", gentle whooshes on row re-order, one soft impact on the wordmark.
- Audio-coupled moments: typed brief, typed feedback, chip arrivals, Apply click, row re-order, wordmark.
- Restraint rule: SFX must never compete with the voice; no risers, no cash-register or casino sounds.

## Voiceover script (Kokoro, calm, mid-tempo)

- S1: "Every hiring tool hands you a number. Almost none of them show their work."
- S2: "Trajectory turns a messy brief into requirements you can actually edit."
- S3: "Every match cites its evidence — and tells you exactly why it isn't a hundred."
- S4: "Say what's wrong in plain English. Review the change. Watch the ranking move."
- S5: "Trajectory. Hire for where they're going."

## Storyboard

### Scene 1 — The number — 4.0s

Black canvas. A huge "87%" fades up center, Geist 600, slightly cold. Beneath it, small grey text types: "…based on what?" At ~2.8s the number dims and the frame begins dissolving toward the product UI.
Sequential/interaction: yes — the question types out after the number settles (hold ≥1.2s).
Audio intent: hushed, curious; music barely present.
Audio-coupled idea: 3–4 soft key ticks on the typed question.
Music: fade in, very low.
Transition mood: soft → Scene 2

### Scene 2 — Brief → structure — 5.0s

Recreate the Role composer card (dark panel). The brief types quickly: "Founding full-stack engineer in SF. Strong TypeScript/React, has shipped LLM features, tiny team, onsite. Bonus: search/ranking." Then the parsed review appears below as three columns: Must have (TypeScript, React, Next.js, PostgreSQL), Strong signal (LLM applications, End-to-end ownership), Nice to have (Production search, Durable workflows) — chips pop in one by one; one amber chip lands in "Needs clarification: Compensation range?". Header label: "Parsed in 4 ms · no LLM".
Sequential/interaction: yes — typed brief, then chips arrive one at a time; full set holds ≥1.5s.
Audio intent: productive, light.
Audio-coupled idea: typing ticks; soft pop per chip.
Transition mood: clean slide → Scene 3

### Scene 3 — Evidence & Why not 100 — 5.5s

Recreate the match list: rows Ava Lindqvist 90.4, Noor Haddad 87.4, Grace Jensen 84.1 with score rings and green "evidence-backed" signal lines. Ava's row expands into a detail card: a resume excerpt with the line "Shipped LLM features in production: RAG over customer docs…" highlighted in violet, badge "LLM applications · supported". Then "Why not 100?" bars draw: Production search −1.5 (missing evidence, slate), Semantic relevance −1.1, Fit model −0.8. Small caption: "missing ≠ negative".
Sequential/interaction: yes — highlight sweeps, then 3 bars draw one by one (hold the set ≥1.5s).
Audio intent: confident, revealing.
Audio-coupled idea: subtle tick per bar.
Transition mood: soft crossfade → Scene 4

### Scene 4 — One sentence re-ranks — 5.5s

The ranking card (like the landing hero replay). Feedback types into the refine field: "Too enterprise. Prioritize people who shipped independently in teams under 30." Three delta chips appear: enterprise-only −0.08 (orange), independently shipped +0.18 (green), small-team +0.12 (green). A cursor clicks "Apply & re-rank". Rows physically re-order: Noor Haddad rises to #1 (score ticks 87.4 → 85.9), Ava #2 (90.4 → 84.2), Rafael Larsen jumps from #7 to #3 (80.8 → 83.5) with "↑4" in green; Sofia drops with an orange "↓4".
Sequential/interaction: yes — typed feedback, chip arrivals, simulated click, animated re-order with ticking numbers.
Audio intent: the payoff; gentle lift on the music cue ~15.8s.
Audio-coupled idea: typing ticks, click on Apply, soft whoosh on reorder.
Transition mood: soft crossfade → Scene 5

### Scene 5 — Outro — 4.0s

Trajectory logomark + wordmark center, then tagline in Instrument Serif italic: "Find the person who fits where you're going." Beneath, small grey: "Evidence-backed · Human-approved · No AI APIs". Faint violet arc lines drawn behind (the landing hero's trajectory arcs).
Sequential/interaction: wordmark → tagline → footer line (tagline holds ≥2s).
Audio intent: resolved, warm; music lifts slightly then fades.
Audio-coupled idea: one soft impact on the wordmark.
Transition mood: fade to black.

**Music mood for this video:** warm, light, modern
**Audio summary:** a calm voice leads over a soft, low bed; sparse UI-accurate sounds mark typing, chips, the Apply click and the re-rank, ending on one soft hit and a fade.

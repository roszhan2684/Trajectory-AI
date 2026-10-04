# Hyperframes Composition Brief: Trajectory

## Objective

Create a short, marketing-focused launch film for Trajectory (evidence-backed talent matching) with voiceover, for the landing page hero "film" section.

## Output

- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4` (copied to `apps/web/public/media/trajectory-launch.mp4`)
- Format: landscape — 1920x1080
- Duration: 24.6s (voice-paced)

## Source Material

- Project root: `/Users/roszhanraj/Trajectory AI` (monorepo)
- Primary files read: `apps/web/src/app/(public)/page.tsx` (landing), `apps/web/src/components/marketing/ranking-replay.tsx`, `apps/web/src/components/roles/role-editor.tsx`, `apps/web/src/components/matches/*`, `apps/web/src/app/globals.css`, live demo store (scores)
- Product name: Trajectory
- Tagline / strongest claim: "Find the person who fits where you're going — not just where they've been."
- Key UI to recreate: role composer → parsed requirement columns; ranked match list + Why-not-100 bars with evidence highlight; refinement input + reviewable deltas + animated re-rank.
- Copy that must appear verbatim:
  - "Must have" / "Strong signal" / "Nice to have" / "Needs clarification"
  - "Why not 100?"
  - "Apply & re-rank"
  - "Find the person who fits where you're going."
- Real numbers (from the demo dataset, computed by the engine): before — Ava Lindqvist 90.4, Noor Haddad 87.4, Grace Jensen 84.1, Sofia Mendes 84.1, Rafael Larsen 80.8 (#7); after — Noor 85.9 #1, Ava 84.2 #2, Rafael 83.5 #3 (↑4), Grace 81.7 #4, Sofia 77.0 #8 (↓4). All people are synthetic.

## Creative Direction

- Tone preset: polished
- Creative direction: quiet premium product film for an explainable ranking engine
- Interpretation: calm voice leads; slow, confident reveals; dark premium canvas; motion precise (springy re-order, drawn bars, highlight sweep), never flashy.
- Angle: every tool gives you a number; Trajectory shows its work.
- Hook: lone "87%" on black, "…based on what?" types beneath.
- Outro: wordmark + serif-italic tagline + honest footer "Evidence-backed · Human-approved · No AI APIs".
- Avoid: generic SaaS language, abstract filler, gradient text, unrelated redesign.

## Visual Identity

- Background: #08090b with faint grid + violet radial glow
- Text: #ffffff / rgba(255,255,255,0.55)
- Accent: #8b8cf6; positive #4ade80; negative #fb923c; unknown #94a3b8
- Display font: Geist (variable, local woff2); accent: Instrument Serif italic (local woff2); mono: Geist Mono
- References: landing hero ranking card, evidence `<mark>` violet highlight, trajectory arcs

## Storyboard

Per `brag-output/brag-plan.md`, re-timed to the generated voiceover:

1. The number — 0.0–4.6s
2. Brief → structure — 4.6–9.6s
3. Evidence & Why not 100 — 9.6–15.0s
4. One sentence re-ranks — 15.0–20.6s
5. Outro — 20.6–24.6s

## Audio

- Role: warm bed under voice; voice leads.
- Voiceover: Kokoro `af_heart`, five clips `assets/vo/vo1..5.wav`, each starting 0.3s into its scene.
- Music: `assets/music/happy-beats-business-moves-vol-10-by-ende-dot-app.mp3`, fade-in 0–0.8s, held low (~0.14) under narration, lift after the final line, fade-out 24.0–24.6s.
- Music cue guidance: bundled preset (109.96 BPM). Beat-locks: re-rank reorder near 18.55s, logo landing at 20.74s.
- Audio-reactive: subtle — background violet glow opacity/scale breathes with bass RMS (`assets/audio-data.js`).
- SFX (chosen to match implemented motion): keypress ticks on typed text, soft rollover on chip arrivals (sparse), click on "Apply & re-rank", card slide on re-order, soft impact on wordmark. Low volumes; never over the voice.

# CANONICAL-PREDICATE-001 — Canonical world-counting predicate (bountywarz worlds/)

Status: **MEASURED — PENDING OWNER RATIFICATION** (ontology ratification is owner-only; until the Captain ratifies, this is a receipted measurement, not canon)

Recorded: 2026-10-26T21:49:51.000Z · Seat: Vibe (Kiran Wolfe session) · Law invoked: predicate-before-number ("a count is not canon until a preregistered counting predicate runs against a named ref+commit and the set is receipted")

## Predicate (preregistered)

A WORLD is a top-level directory D under worlds/ on a named ref+commit such that:

- P1. D does not start with "_restage-" (restage holding pen, not product)
- P2. D does not start with "." (hidden)
- P3. the depth-1 listing of worlds/D contains at least one file matching /\.html?$/i (HTML entry point)

Set serialization (for digests): passing names sorted by Unicode code unit, joined with a single LF, no trailing newline, UTF-8, SHA-256 hex lowercase.

## Results

| ref | head | listed dirs | _restage- | eligible | predicate-PASS | digest |
|---|---|---|---|---|---|---|
| main | 188776b6a67c44c610acfeda8e7641edf6a22745 | 324 | 23 | 301 | **300** | 68946bf5b56d6292ec240d6843cf18f52dee21b7707cd0db8eda20ea711bc04d |
| master | 64917c1239fda6f442917e0fec7fffbb2a131516 | 303 | 24 | 279 | **278** | 451d603ff4e1b9c7dd68429a7f7036fecb50157da4c28ecc2e5acb4567a6208c |

main carries one top-level file (GAIS-WORLD-INDEX.md); master carries none. Both trunks carry the identical sole eligible failure:

- **sgrok-onboarding** — AMBIVALENT: depth-1 listing contains only directories (art/, spec/), no depth-1 HTML. Fails P3 on BOTH trunks. Flagged for the owner: it may be a world whose entry point lives deeper. The ontology call is owner-only; this predicate records it as NOT-PASS, not as NOT-A-WORLD.

## Instruments (both this seat, both disclosed)

1. GitHub contents-API depth-1 listing per directory — sequential with retry (connector 502 storms under parallel load disclosed; mitigated by P=6 sequential slices, retry up to 6).
2. GitHub code search extension:html path:worlds (default branch = main only) — 336 paths, 334 depth-1, 300 distinct non-restage dirs. **Set-equal with instrument 1 on main: zero symmetric difference.** master is not covered by this instrument (default-branch-only); master rests on instrument 1 (279/279 processed this session, sole failure sgrok-onboarding).

## Reconciliation with earlier figures (preserved, not cleaned)

- main 324 listed / 301 eligible; master 303 / 279 — both match this run.
- REPO AUDIT 141 = REJECT (unreproduced, matches no ref); the 298 matches nothing.
- Prior two-instrument agreement (303=master, 324=main, different trunks) stands.

## Files

- worlds-main.txt — 300 names, SHA-256 68946bf5b56d6292ec240d6843cf18f52dee21b7707cd0db8eda20ea711bc04d
- worlds-master.txt — 278 names, SHA-256 451d603ff4e1b9c7dd68429a7f7036fecb50157da4c28ecc2e5acb4567a6208c
- CANONICAL-PREDICATE-001.json — machine-readable receipt

## Ratification

One owner line ratifying P1–P3 (and the sgrok-onboarding disposition) promotes these counts to canon. Until then: MEASURED. No narrator promotes state.

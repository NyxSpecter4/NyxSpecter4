# kinetigor.world-count.v1 — launch-set world-counting predicate (RUN + RECEIPTED)

Status: **MEASURED — PENDING OWNER RATIFICATION** (the predicate AND its entry-point set are owner-only decisions; until the Captain ratifies, this is a receipted measurement, not canon.)

Recorded: 2026-10-26T22:12:01.037Z · Seat: Vibe. Companion to CANONICAL-PREDICATE-001 (the HTML-any predicate, same repo/commits: main = 300, master = 278, receipt commit 4d25ad10).

## Predicate (as proposed in the Oct 26 relay; executed exactly as written)

A world is a top-level directory immediately under worlds/ at a named commit, whose name does not begin with `_restage-` (dot-prefixed also excluded), containing at least one regular file from the launch set:

- index.html · play.html · game.html · app.html

Depth: immediate children only. Symlinks/submodules: not in scope. Deduplication key: exact top-level directory path.

## Result

- Repository: NyxSpecter4/bountywarz · commit: 188776b6a67c44c610acfeda8e7641edf6a22745 (main, pinned)
- Eligible directories: 301 (of 324 listed; 23 restage excluded)
- **Launch-set predicate-PASS: 299**
- Tree digest (sorted names, LF-joined, UTF-8, SHA-256): 71991e675a76c473fa50505ea60eba8d65bbf9c0d3585f5df36077e0697c43c1
- Enumerated set: worlds-launchset-main.txt

## The owner decision this receipt serves

Under the HTML-any predicate (CANONICAL-PREDICATE-001), main = **300**. Under this launch-set predicate, main = **299**. The difference — **1** directories that are HTML-bearing but carry no ratified launch name — is enumerated in worlds-html-not-launch-main.txt. These are the two live options for the canonical ontology; the numbers now exist for both, at the same pinned commit, with both sets receipted.

## Relation to the Oct 26 relay claims

- "The predicate cannot be run yet — tree enumeration truncates": **seat-local instrument limit, not an estate fact.** This seat enumerated worlds/ honestly via the contents-API listing + code-search instruments (the same dual-instrument method that receipted CANONICAL-PREDICATE-001 earlier today) with zero truncation, against the same pinned commit.
- master remains unswept under THIS predicate (code search is default-branch-only; the per-dir instrument can sweep it on order — it completed the HTML-any sweep earlier today: master = 278).

## Falsifier (verbatim from the proposal)

Any qualifying path omitted, excluded path included, duplicate path counted, or result generated from another ref.

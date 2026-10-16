# ATHELGARD PROOF #001 — Gate A Clean-Machine Run Record (2026-10-16)

Run environment: fresh container, no repo access, no tokens, no estate state.
Node v22.20.0, Linux. Files fetched zero-auth via raw.githubusercontent from the
PUBLIC mirror (NyxSpecter4/NyxSpecter4@ae2873e) — see Deviation D2.

## Results — CLI executed unchanged

| Step | Result |
|------|--------|
| `node athelgard-evaluator.mjs selftest` | **12/12 PASS**, rubric hash reproduced `a677d9ad…ed01` |
| evaluate pass.json `--expect-rubric-hash … --receipt` | verdict PASS 100/100, `receipt_id` `5c2e179e…919f` — byte-identical to the published sample receipt (cross-environment determinism confirmed) |
| `verify rubric.json fixtures/pass.json sample-receipt.json` | `valid: true`, all 5 checks true, exit 0 |
| tampered fixture | rejected: evidence hash mismatch, exit 1 |
| malformed fixture | rejected: evidence hash mismatch, exit 1 |
| wrong-challenge fixture | rejected: challenge mismatch, exit 1 |
| fail fixture | verdict FAIL 20/100, exit 1 |
| unknown-protocol (selftest) | rejected: unknown protocol version |

## Deviations found (preserved, not erased)

- **D1 — README overcount:** README promised "selftest 13/13 PASS"; the CLI
  selftest contains 12 checks. The 13th (verdict carries rubric hash/evaluator
  version/5 field results) existed only in the pre-publication sandbox harness.
  Fixed in README v2 (this commit); no evaluator change.
- **D2 — Delivery blocker (the big one):** the canonical fixture was published
  only to `NyxSpecter4/bountywarz`, which is PRIVATE. Both clone and raw URLs
  404 for a stranger. The "secret-free stranger path" was not stranger-reachable.
  Fixed by mirroring byte-identical files to the public profile repo
  `NyxSpecter4/NyxSpecter4` (commit ae2873e), zero-auth raw fetch.
- **D3 — TEST-RESULTS.md scope note:** its 13/13 was a sandbox-harness result;
  now labeled explicitly so the CLI count (12/12) can't be confused with it.

## Gate A verdict

PASS — with one delivery-layer repair (public mirror) and two documentation
corrections. Evaluator logic itself: unchanged, deterministic, fail-closed.

Gate B (real external participant through the real path) remains open.

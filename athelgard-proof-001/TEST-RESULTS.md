# ATHELGARD PROOF #001 — Evaluator v0.1 Test Results

Run date: 2026-10-15. Method: identical core logic executed in a sandboxed
TypeScript harness (the same functions the Node CLI wraps). Self-test
executable by any stranger via `node athelgard-evaluator.mjs selftest`.

Rubric sha-256: `a677d9ad0016d9b02101b23335317bf38bda0d43f43e49b73c1939b8e103ed01`

**13/13 PASS**

| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | fixture-pass: verdict PASS, score 100/100 | PASS | 100 |
| 2 | fixture-fail: verdict FAIL, deficient score | PASS | 20/100 |
| 3 | fixture-malformed: fail-closed rejection | PASS | evidence hash mismatch on incomplete evidence |
| 4 | fixture-tampered: evidence-hash mismatch detected | PASS | declared 0b3849… vs computed 9f8e35… |
| 5 | fixture-wrong-challenge: challenge mismatch rejection | PASS | |
| 6 | fixture-unknown-protocol: protocol rejection | PASS | athelgard-envelope/9 |
| 7 | rubric-hash precommitment enforced | PASS | --expect-rubric-hash mismatch rejected |
| 8 | receipt id = sha256 of canonical verdict payload | PASS | 5c2e179e… |
| 9 | verify: clean receipt validates, all checks true | PASS | receipt_id/score/verdict/evidence/rubric all reproduce |
| 10 | verify: forged receipt rejected | PASS | forged score+verdict do not reproduce |
| 11 | determinism: identical inputs → identical verdict | PASS | |
| 12 | sha256 implementation matches FIPS vectors | PASS | "", "abc", quick-fox vectors |
| 13 | verdict carries rubric hash, evaluator version, 5 field results | PASS | |

Fail-closed paths covered: missing required fields, evidence-hash mismatch,
rubric-hash mismatch, unknown protocol version, challenge mismatch.

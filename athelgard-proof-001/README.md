# ATHELGARD PROOF #001 — Evaluator v0.1

Deterministic, secret-free evaluation of an exported evidence envelope against a
pre-committed rubric. Closes Stage 7 (independent evaluation) of the Proof #001
scoreboard at the **execution- and decision-independence** level — *not*
institutional/third-party independence. Claims only deterministic evaluation
against the published rubric; claims **no** semantic correctness.

## Rubric precommitment

`rubric.json` sha-256 (sorted-key canonical JSON):

```
a677d9ad0016d9b02101b23335317bf38bda0d43f43e49b73c1939b8e103ed01
```

Verify it yourself:
```sh
node athelgard-evaluator.mjs selftest   # prints the recomputed rubric hash
```

## Stranger run (no secrets, no game, no private state)

Requirements: Node.js >= 16. No npm install. No network. No tokens.

```sh
git clone https://github.com/NyxSpecter4/bountywarz   # or download this folder only
cd bountywarz/athelgard-proof-001

# 1. Run the adversarial self-test (fixtures: pass, fail, malformed, tampered, wrong-challenge, unknown-protocol)
node athelgard-evaluator.mjs selftest

# 2. Evaluate the passing fixture with the precommitted rubric hash enforced
node athelgard-evaluator.mjs rubric.json fixtures/pass.json \
  --expect-rubric-hash a677d9ad0016d9b02101b23335317bf38bda0d43f43e49b73c1939b8e103ed01 \
  --at 2026-10-15T20:00:00Z --receipt

# 3. Verify the published sample receipt against the evidence and rubric
node athelgard-evaluator.mjs verify rubric.json fixtures/pass.json sample-receipt.json

# 4. Watch the fail-closed behavior
node athelgard-evaluator.mjs rubric.json fixtures/tampered.json     # evidence-hash mismatch
node athelgard-evaluator.mjs rubric.json fixtures/malformed.json   # missing/hash rejection
node athelgard-evaluator.mjs rubric.json fixtures/wrong-challenge.json
node athelgard-evaluator.mjs rubric.json fixtures/fail.json         # verdict: FAIL (score 20/100)
```

Expected: selftest `13/13 PASS`; step 2 verdict `PASS 100/100` with
`receipt_id` `5c2e179ed0dc8049ea1b971880a926b8abd0073e9796d642d5d14f4df929191f`;
step 3 all checks `true`; steps 4 all rejected or FAIL.

## Envelope contract (protocol `athelgard-envelope/1`)

Required: `protocol`, `challenge_id`, `actor_id`, `action`, `evidence`,
`captured_at`, `evidence_hash`. `evidence_hash` = sha-256 of the canonical
(sorted-key) JSON of the `evidence` object. Any missing field, hash mismatch,
challenge mismatch, or unknown protocol ⇒ fail-closed rejection.

## Scope and honesty notes

- The evaluator does NOT touch the world, agent, challenge code, or the DPO
  capture pipeline. It consumes exported envelopes only.
- A DPO chosen/rejected pair is NOT treated as a verdict. The verdict is only
  what this evaluator deterministically produces from evidence + rubric.
- Evidence capture, evaluation, verdict, and receipt remain separate artifacts.
- Determinism: identical (envelope, rubric, evaluated_at) ⇒ identical output.
  `evaluated_at` is an input, not a clock read, so runs are reproducible.

# ATHELGARD PROOF #001 — Evaluator v0.1

Deterministic, secret-free evaluation of an exported evidence envelope against a
pre-committed rubric. Closes Stage 7 (independent evaluation) of the Proof #001
scoreboard at the **execution- and decision-independence** level — *not*
institutional/third-party independence. Claims only deterministic evaluation
against the published rubric; claims **no** semantic correctness.

## Where to get it (stranger path — zero auth)

```sh
BASE=https://raw.githubusercontent.com/NyxSpecter4/NyxSpecter4/main/athelgard-proof-001
mkdir -p athelgard-proof-001/fixtures && cd athelgard-proof-001
for f in athelgard-evaluator.mjs rubric.json README.md sample-receipt.json fixtures/pass.json fixtures/fail.json fixtures/malformed.json fixtures/tampered.json fixtures/wrong-challenge.json; do
  curl -fsSL -o "$f" "$BASE/$f"
done
```

The canonical copy lives in the (private) bountywarz repo; this public mirror in
`NyxSpecter4/NyxSpecter4` is byte-identical and requires no authentication.

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

Requirements: Node.js >= 16. No npm install. No tokens.

```sh
# 1. Run the adversarial self-test (12 checks: pass, fail, malformed, tampered, wrong-challenge, unknown-protocol, precommitment, receipt, forged-receipt, determinism, FIPS vectors)
node athelgard-evaluator.mjs selftest

# 2. Evaluate the passing fixture with the precommitted rubric hash enforced
node athelgard-evaluator.mjs rubric.json fixtures/pass.json \
  --expect-rubric-hash a677d9ad0016d9b02101b23335317bf38bda0d43f43e49b73c1939b8e103ed01 \
  --at 2026-10-15T20:00:00Z --receipt

# 3. Verify the published sample receipt against the evidence and rubric
node athelgard-evaluator.mjs verify rubric.json fixtures/pass.json sample-receipt.json

# 4. Watch the fail-closed behavior (each exits 1)
node athelgard-evaluator.mjs rubric.json fixtures/tampered.json     # evidence-hash mismatch
node athelgard-evaluator.mjs rubric.json fixtures/malformed.json   # evidence-hash rejection
node athelgard-evaluator.mjs rubric.json fixtures/wrong-challenge.json
node athelgard-evaluator.mjs rubric.json fixtures/fail.json         # verdict: FAIL (score 20/100)
```

Expected: selftest `12/12 PASS`; step 2 verdict `PASS 100/100` with
`receipt_id` `5c2e179ed0dc8049ea1b971880a926b8abd0073e9796d642d5d14f4df929191f`;
step 3 all checks `true`; step 4 all rejected or FAIL, exit code 1.

Gate A status: the CLI has been executed unchanged on a clean machine
(fresh container, Node v22.20.0, zero-auth fetch) — see GATE-A-RUN.md for the
run record, including three preserved delivery-layer deviations.

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

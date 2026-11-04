# The Princetown Packet — Verifier's Run

A playable Kinetigor course element for the **Competitive Cyber Rally**
(MOORPOST organizes · the Rally competes · the Princetown Packet is
Course 001). Five investigation stations on the moor; every judgment is a
deterministic receipt; every receipt is chained; the chain is the only
thing that gets believed.

**This is a verifier-first game.** The UI can never grant victory. Every
verdict is recomputed by a deterministic judge (`core/challenges.js`);
every receipt is formed and chained by the frozen trust contract
(`core/trust.js`, spec in `CONTRACT.md`); anyone can re-walk your run
with the independent validator without the game.

---

## Launch (no build, no dependencies)

Requires Node >= 16 for the CLI tools. The game itself is static files.

**Play:**

```bash
# from this directory — either just open it:
open www/index.html          # macOS   (or double-click it in any file manager)

# or serve it (any static server works):
npx serve www
```

**Verify (the stranger path):**

```bash
node cli/selftest.js                          # all layers: 124 assertions
node cli/demo-run.js                          # deterministic full playthrough -> receipts/demo-run.json
node cli/verify.js receipts/demo-run.json     # independent chain validation (exit 0 = VALID)
node cli/verify.js receipts/demo-run.json --v1-audit   # + estate v1 judge audits each envelope
node cli/ui-smoke.js                          # headless execution of the UI logic path (dev instrument)
```

A clean-environment run of `selftest.js` + `demo-run.js` + `verify.js`
is the definition of "works from a fresh clone."

## How to play (first minute)

1. **START** — open `www/index.html`, take the warrant, enter a verifier name.
2. **OBJECTIVE** — each station states a claim and what evidence it takes.
   Inspect the artifact. The **LENS** buttons recompute digests and walk
   chains — using the same real validator the judge uses.
3. **SUBMIT** — paste evidence (usually a digest or record id) into the
   workbench. The judge recomputes everything itself.
4. **VERDICT + RECEIPT** — pass, fail, refusal or quarantine, each with a
   reason code — and a chained receipt you can open in full.
5. **CHAIN** — your run record grows. Export it at any time.
6. **INDEPENDENT VERIFICATION** — from this repo:
   `node cli/verify.js <your-exported-run>.json`

Stages: **ARRIVAL** (verify a commission by digest) → **POSTBRIDGE**
(find the record amended after sealing) → **CACHE** (walk a broken
recovered chain; file the quarantine order naming *where trust last
stood*) → **DELIVERY** (content is not provenance — only one packet's
provenance carries its content) → **APEX** (five records narrate their
own status; the five checks — IDENTITY, PROVENANCE, SEQUENCE,
UNIQUENESS, ATOMICITY — decide, not the narrators).

## Architecture (three boundaries, never collapsed)

```
 PLAYER → GAME (core/game.js) → JUDGE (core/challenges.js)
        → TRUST (core/trust.js) → INDEPENDENT VALIDATOR (core/validator.js, cli/verify.js)
```

- **GAME** — progression and evidence intake; never judges.
- **JUDGE** — deterministic `judge(challenge, evidence) → verdict, reason`; never trusts the UI.
- **TRUST** — canonicalization, SHA-256, receipt formation, chaining; one implementation.
- **VALIDATOR** — validates chains against `CONTRACT.md` alone; never asks the game who won.

Fixtures for stages 2–4 are generated deterministically by
`cli/make-fixtures.js` into `www/fixtures.js` (one source, browser +
Node). Receipts are `kinetigor.trust-receipt/v1` envelopes; the chain
layer is the `kinetigor.game-run/1` extension — full citation and rules
in `CONTRACT.md`.

## Honest status labels (anti-fake protocol)

- `core/` (trust, kernel, validator, challenges, game), `cli/` (selftest,
  demo-run, verify, make-fixtures, gen-vectors), `test/vectors.json`,
  `www/fixtures.js`, `vendor/validate_receipt.js` provenance —
  **VERIFIED** in Node 22 (selftest: 124/124 across unit / contract
  vectors / mutations / integration / game flow / fixture determinism;
  demo run chain VALID + COMPLETED; verifier exit 0; genesis hash
  cross-checked against GNU sha256sum).
- `www/ui.js` UI **logic path** — **VERIFIED** headless
  (`cli/ui-smoke.js`: home → honest FAIL → PASS → all five stations →
  lens tools → finish → export → exported chain validates).
- Browser **rendering** — **UNINSTRUMENTED**: no human has played it in
  a browser yet. The logic is tested; the pixels are not. Play it and
  file anything that looks wrong.
- Integration into the wider Rally/Control estate — **NOT CLAIMED**.
  This stands as a playable, verifiable slice on its own.

## Provenance (estate reuse, preserved)

- Receipt envelope v1 + judge: `NyxSpecter4/NyxSpecter4` `kin-trust-protocol/`
  (vendored byte-identical as `vendor/validate_receipt.js`, blob sha
  `c74a7cd7369bf4fed12e64080ab48edd52c97230`).
- Five-check kernel + verdict algebra: adapted from the Athelgard verify
  kernel v0.1 spec (MOORPOST Assurance Demo).
- Chain layer: defined here as `kinetigor.game-run/1` (v1 does not chain).

## Repository layout

```
CONTRACT.md            frozen verifier contract (read this first)
core/trust.js          canonicalization · SHA-256 · receipt formation · chaining
core/kernel.js         five-check record verifier (Athelgard algebra)
core/validator.js      independent chain validator + reason codes
core/challenges.js     the five stations (deterministic judges)
core/game.js           run state machine (never judges)
vendor/validate_receipt.js   frozen estate v1 judge (reference)
cli/selftest.js        124 assertions across six layers
cli/verify.js          independent verifier CLI (exit 0 valid / 1 invalid / 2 malformed)
cli/demo-run.js        deterministic playthrough -> receipts/demo-run.json
cli/make-fixtures.js   fixture generator with self-verification
cli/gen-vectors.js     regenerates test/vectors.json
cli/ui-smoke.js        headless UI logic test (development instrument)
test/vectors.json      constitutional test vectors
receipts/demo-run.json exported demo run (validates, completed)
www/                   the game (static: index.html, style.css, ui.js, fixtures.js)
```

# kin-trust-protocol — the Kinetigor Trust Protocol v1.0.0

**Canonical law (above the Andon board):**

> A state is earned only by a receipt satisfying that state's gate.
> Every receipt names the claim, evidence, falsifier, judge, and provenance.
> No narrator may promote state.

## The two axes

Every Kinetigor object exposes two independent values:

- **TRUST STATE (lifecycle):** CLAIMED → BUILT → MEASURED → VERIFIED → STAGED → DEPLOYED → LIVE-VERIFIED → OFFERED → SOLD. Nothing skips a rung.
- **COMMERCIAL DISPOSITION (orthogonal):** RETAIN · LICENSE · SELL_PRODUCT · SELL_SERVICE · SHOWCASE · NOT_FOR_SALE.

Neither implies the other: Nemeton can be VERIFIED + RETAIN; a renderer can be LIVE-VERIFIED + LICENSE; Roost & Ruin can become OFFERED + SELL_PRODUCT; the KIN plugin can be LIVE-VERIFIED + SHOWCASE. SELL FIRST ≠ SELL EVERYTHING.

**QUARANTINED is a disposition, not a rung.** Anything can fail anywhere; nothing loses previously earned proof because its next gate failed. A quarantine records `reason` and `last_valid_state`. Unblock requires a new receipt, never an argument.

## The receipt envelope (`kinetigor.trust-receipt/v1`)

One canonical receipt for every trust state; state-specific evidence rides inside it. Full schema: [`receipt.schema.json`](receipt.schema.json).

- `claim.statement` is **immutable** — if the proposition changes, that is a new receipt.
- `claim.falsifier` is **required** — a claim without a falsifier cannot progress.
- `transition` carries `from`/`to`/`status` (ACCEPTED · REFUSED · QUARANTINED) and, when quarantined, `quarantine.reason` + `quarantine.last_valid_state`.
- `commercial_disposition` may be attached to any receipt and is validated against the vocabulary, never implied.
- `references` links prior receipts (measurement, staged, deployment, offer, transaction receipt ids).

## Per-state required evidence

| State | Question | Gate mode | Gate requires | Refuses when |
|-------|----------|-----------|---------------|--------------|
| CLAIMED | What exactly are we saying? | **none** (registration only) | exact proposition + falsifier + claimant + timestamp | no falsifier; unfalsifiable claim |
| BUILT | Does the claimed artifact exist? | **any-of** | evidence type `artifact`: locator + digest or byte size | a description of a thing is not the thing |
| MEASURED | What did observation find? | **any-of** | `hash` / `test` / `observation` with a raw result | evidence is narration; measurement presented as a pass |
| VERIFIED | Does the measurement substantiate the claim? | **any-of** | `test` / `judge`: pre-registered rule, expected, observed, verdict | rule written after the result; unparseable evidence |
| STAGED | Is the verified change prepared for release? | **all-of (the only conjunctive gate)** | `commit` **and** `manifest` (release-candidate identity + file manifest + target list) | any file lacks a digest; drift undisclosed |
| DEPLOYED | Did those exact staged bytes reach the target? | **any-of** | `deployment`: **target-side** observation tying live bytes to the staged candidate | "deploy command succeeded" alone — the deployer narrates; the target must be observed |
| LIVE-VERIFIED | Does the deployed system independently satisfy its claim? | **any-of** | `observation` at a public/live locator, post-deploy, independent instrument | re-audit never ran; same-path self-check |
| OFFERED | Can a stranger obtain it on advertised terms? | **any-of** | `publication`: offer locator + terms + claim parity | a gorgeous repo is not an offer |
| SOLD | Did a real transaction occur? | **any-of** | `transaction`: platform/escrow record + delivery status | narrated sale; buyer PII is not required to prove a transaction |

**Gate mode semantics (explicit since the second-witness reproduction):** `any-of` = at least one listed evidence type must appear; `all-of` = every listed type must appear; `none` = registration only, promotes nothing. Only STAGED is conjunctive. The original table left mode implicit; a stranger implementing the judge from this spec inferred all-of and wrongly refused four receipts — a spec a stranger can only approximate is not a spec. The judge source has carried `mode` since commit `99540db1`; the documentation now matches it.

## The judge

`validate_receipt.js` — zero-dependency, fail-closed, pure (validates evidence, never alters it).

```bash
node validate_receipt.js receipts/*.json
```

Exit codes: `0` all promotions accepted · `1` at least one refused (a valid QUARANTINED record also exits 1 — the refusal is the record) · `2` malformed (never treated as accept).

**What the judge checks:** structure, falsifier, rung adjacency, per-state evidence gates, verdict/status consistency, quarantine dispositions, disposition vocabulary — and it computes its own verdict, refusing any receipt whose declared verdict is not supported (no self-certification).

**What the judge deliberately cannot check:** whether an evidence locator's content semantically satisfies the claim. That truth lives at the locator, checkable by any stranger. The judge guarantees no promotion without the required *kind* of evidence; the receipt guarantees the evidence is dereferenceable by anyone. The judge's own limits are part of the protocol — an honest gate says what it cannot see.

## PROOF-RUN-001 — pre-registered acceptance rules

Written **before** execution. The proof artifact is the protocol itself: take it from CLAIMED to LIVE-VERIFIED with an executed judge at every rung.

- **P1 VALIDITY:** the judge, executed against target-fetched bytes, accepts R0 (claim), E01 (HF remediation STAGED), E02 (kit v2 BUILT), and **refuses the promotion in E03** (negative control: "HF remediation is DEPLOYED" — commit evidence only) with disposition QUARANTINED.
- **P2 BYTES:** every file's git-blob digest measured post-push at the GitHub API equals the locally pushed digest.
- **P3 CHAIN:** receipts R1–R6 form a strictly adjacent CLAIMED → LIVE-VERIFIED chain, each judged PASS from target-fetched bytes.
- **P4 INDEPENDENCE:** the LIVE-VERIFIED observation dereferences a public anonymous locator (raw.githubusercontent.com) through an instrument different from the push path — the path a stranger would use.
- **Failure handling:** any rule failure → the run is recorded FAILED, no promotion beyond the last passing state, and PROOF-RUN-001.md records the failure verbatim. The proof is the refusal discipline, not the green.

**Regress note:** the record of the final observation necessarily lives outside the observed set (an observer cannot contain itself). The chain terminates at the last receipt; the terminal observation is recorded in the estate log (Knowledge + this repo's PROOF-RUN-001.md).

## The falsification test (encoded, not narrated)

If an agent says *"HF remediation is complete,"* the protocol asks for a STAGED → DEPLOYED receipt with target-side evidence. The three repository commits cannot satisfy it. So the judge returns **REFUSED: insufficient evidence for DEPLOYED** — see `receipts/E03-negative-hf-deployed.json`, which exists precisely to be refused. If an agent says *"the v2 redaction kit exists in source control,"* commit `947682d3` directly supports it: **ACCEPTED** — see `receipts/E02-kit-v2-built.json`. That asymmetry, executed by a machine instead of decided by rhetoric, is the product.

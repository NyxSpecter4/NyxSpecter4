# CONTRACT — kinetigor.trust-receipt/v1 (+ kinetigor.game-run/1 chain extension)

**Status: FROZEN.** This document specifies the verifier contract the game
and the independent validator both implement. It is the authority: where
code and this document disagree, that is a defect to file, not a ruling to
reinterpret. Changes require a new namespace version, never a silent edit.

Implementation of record: `www/core/trust.js` (trust boundary, the ONE
implementation — no duplicates anywhere in the estate; `www/` is
deliberately self-contained so the PWA offline scope carries every asset).
Independent validator: `www/core/validator.js` (does not import the game).
Estate v1 judge (frozen reference): `www/vendor/validate_receipt.js`.
Estate relay kernel (challenge machinery, §10): `www/vendor/moorpost-kernel.js`.
Constitutional test vectors: `test/vectors.json` (see §8).

---

## 1. Provenance of v1 (citation, not invention)

The receipt **envelope** is the canonical Kinetigor Trust Receipt **v1**,
defined in the estate at:

- Repository: `NyxSpecter4/NyxSpecter4`, branch `main`
- Directory: `kin-trust-protocol/`
- Schema: `receipt.schema.json`, `$id: "kinetigor.trust-receipt/v1"`
- Reference judge: `kin-trust-protocol/validate_receipt.js`
  (git blob sha `c74a7cd7369bf4fed12e64080ab48edd52c97230`;
  vendored byte-identical as `www/vendor/validate_receipt.js` — verified)
- Defining commits: `99540db1` → `522a2d30` → `a63afd4d`

v1 defines the envelope fields and the state-promotion gate
(`MEASURED → VERIFIED` with status `ACCEPTED | REFUSED | QUARANTINED`).
**v1 does not define** canonicalization, hashing, or receipt chaining.

### Ruling: EXTENSION, not conflict

This game issues **genuine v1 envelopes** — the `schema` field is
unchanged (`kinetigor.trust-receipt/v1`), and every receipt passes the
frozen estate judge (`vendor/validate_receipt.js`). The schema's
`additionalProperties: true` admits the `game` block. The chain layer
(canonicalization, SHA-256, `prev_receipt`, `seq`, `entry_hash`) is
declared as an **explicit extension** under the namespace:

    kinetigor.game-run/1

The run-file envelope (`schema: "kinetigor.game-run/1"`) wraps receipts
for export and independent verification. No competing "v1" was invented.

---

## 2. Canonicalization

`canon(value)` produces canonical bytes as a UTF-8 string:

1. `null` → `null`
2. booleans → `true` | `false`
3. numbers → `JSON.stringify(n)`; non-finite numbers are a hard error
4. strings → `JSON.stringify(s)` (JSON escaping, UTF-8 encoding downstream)
5. arrays → `[` canon(v0) `,` canon(v1) … `]` (no whitespace, element order preserved)
6. objects → `{` `"key"` `:` canon(value) … `}` with **keys sorted by
   UTF-16 code unit** (Array.prototype.sort default), no whitespace
7. `undefined`, functions, symbols → hard error (not canonicalizable)
8. Lone surrogates → U+FFFD during UTF-8 encoding

Two conforming implementations given the same logical value MUST produce
identical canonical bytes.

## 3. Hashing

- Algorithm: **SHA-256** (FIPS 180-4). Implementation is pure JS in
  `www/core/trust.js`; FIPS test vectors are asserted in `test/vectors.json`.
- String input is encoded as **UTF-8 bytes** before hashing.
- Textual digest encoding: lowercase hex.

### Receipt entry hash (the chain link)

    entry_hash = sha256_hex( ASCII(prev_entry_hash) || UTF8(canon(payload)) )

where:

- `payload` = the receipt object **minus `receipt_id`** and **minus
  `game.chain.entry_hash`** (both are derived, so they cannot cover themselves)
- `prev_entry_hash` = the `entry_hash` of the predecessor receipt; for the
  first receipt (`seq 0`) it is the ASCII bytes of the literal `"GENESIS"`

### Receipt identity

    receipt_id = "rcpt-" + entry_hash[0..15]   (first 16 hex chars)

The receipt is *formed* as: build payload → compute `entry_hash` → attach
`receipt_id` and `game.chain.entry_hash`. This makes both values
deterministic functions of content + position.

## 4. Chain semantics

- A run's receipts form a **linear chain**: array order is chain order.
- `seq` is dense from 0: receipt *i* has `game.chain.seq == i`.
- `game.chain.prev_receipt` names the predecessor's `receipt_id`;
  the first receipt's `prev_receipt` is the literal `"GENESIS"`.
- A chain is **broken** at receipt *i* if any of:
  - recomputed `entry_hash` ≠ stored `entry_hash` (`INVALID_HASH`)
  - `receipt_id` ≠ `"rcpt-" + entry_hash.slice(0,16)` (`INVALID_HASH`)
  - `prev_receipt` ≠ previous receipt's id / `GENESIS` (`BROKEN_PREDECESSOR`)
  - the hash input used the wrong predecessor hash (`INVALID_HASH`)
  - `seq` is not dense from 0 (`SEQ_GAP`); array order vs `seq` disagree
    (`REORDERED_CHAIN`)
- Once broken, the chain **ceases to prove** claims from that receipt
  forward; later receipts may still hash consistently, but they chain off
  unproven state (cascade, not proof).
- Validation depends only on the frozen contract and the supplied bytes —
  never on UI or runtime state.
- **Completion** is itself verifiable: a run is complete iff it contains
  a `PASS` receipt for challenge `apex-04` (the contract's completion
  marker) and the chain walks clean.

## 5. Verdict algebra and v1 mapping

Kernel verdicts (Athelgard algebra, severity `QUARANTINE > REFUSE > FAIL > PASS`):

| judge verdict | v1 `transition.status` | v1 `evaluation.verdict` | v1 `transition.quarantine` |
|---|---|---|---|
| `PASS`     | `ACCEPTED`   | `PASS`         | absent |
| `FAIL`     | `REFUSED`    | `FAIL`         | absent |
| `REFUSE`   | `REFUSED`    | `INDETERMINATE`| absent |
| `QUARANTINE` | `QUARANTINED` | `INDETERMINATE` | `{reason, last_valid_state}` (mandatory) |

An `ACCEPTED` transition with a quarantine block, or a `QUARANTINED`
transition without one, is `INCONSISTENT_VERDICT`. `claim.previous_state`
is always `MEASURED`; `claim.requested_state` is always `VERIFIED`; a
judged PASS always means `MEASURED → VERIFIED` promoted — the judge's
truth, not the UI's.

## 6. Reason codes (stable, machine-readable)

Validator: `UNSUPPORTED_SCHEMA`, `MALFORMED_RECEIPT`, `INVALID_HASH`,
`BROKEN_PREDECESSOR`, `SEQ_GAP`, `REORDERED_CHAIN`, `DUPLICATE_RECEIPT`,
`RUN_MISMATCH`, `INCONSISTENT_VERDICT`, `TRUNCATED_CHAIN`
(`TRUNCATED_CHAIN` fires only when the run file names an
`expected_final_receipt_id` that is absent).

Judge-level codes are challenge-specific and are listed with each challenge
in `www/core/challenges.js`:

- Arrival (`S0_*`), Postbridge (`PB_*`), Cache (`CACHE_*`, incl.
  `FORGERY_*` from the bench's pure operations)
- Delivery relay (`DLV_*`): `DLV_NO_AUTHORITY`, `DLV_WRONG_PATH`,
  `DLV_WRONG_REFUSAL`, `DLV_RELAY_ACCEPTED` (both paths narrated as
  fully accepted), plus `INSUFFICIENT_EVIDENCE`
- Apex board (`APEX_*`): `APEX_MALFORMED`, `APEX_WRONG_LANES`,
  `APEX_WRONG_EVIDENCE`, `APEX_WRONG_QUARANTINE`, `APEX_GO`
- Cross-station: `REPLAY_DETECTED` (§7), `INSUFFICIENT_EVIDENCE`

Codes are part of the frozen challenge versions (arrival-00/postbridge-01/
cache-02/delivery-03/apex-04 v1.1.0) and MUST NOT be renumbered or renamed.

## 7. Replay

Two distinct, objective conditions — no heuristics:

1. **Judge level (`REPLAY_DETECTED`):** identical canonical evidence
   (`canon(evidence)` byte-equal) submitted to the same challenge within
   the same run. This is an integrity condition → `QUARANTINE`.
2. **Chain level (`DUPLICATE_RECEIPT`):** a `receipt_id` or `entry_hash`
   occurring twice in one chain.

## 8. Test vectors

`test/vectors.json` is constitutional: FIPS SHA-256 vectors,
canonicalization cases (including key-order independence and UTF-8), and a
frozen 3-receipt mini-chain with exact canonical payloads, `entry_hash`
and `receipt_id` values, plus expected validation results. The genesis
hash was cross-checked against GNU `sha256sum` (independent tool,
byte-exact). Any implementation change that alters these vectors breaks
the contract.

## 9. Documented limits (honesty section)

- **Tamper-evident, not authenticated.** There are no signatures. Anyone
  can forge a *consistent* chain suffix; what they cannot do is alter a
  committed receipt without breaking the walk. The chain proves
  integrity, not authorship.
- The validator checks **conformance to this contract**, not game truth:
  it never asserts the player "really won", only that the chain is
  internally consistent and carries the completion marker.
- The estate v1 judge's domain is the envelope: it accepts every game
  PASS receipt and refuses FAIL/REFUSE/QUARANTINE envelopes (they are
  correctly `REFUSED`/`QUARANTINED` at the state-promotion level); it
  cannot see challenge truth. Cross-compatibility is asserted in tests.
- A truncated chain is undetectable from the chain alone; it becomes
  detectable only via `expected_final_receipt_id` in the exported run.

## 10. Ruling: MOORPOST packet machinery is challenge machinery, NOT a receipt format

The Delivery station re-uses the **MOORPOST canonical relay kernel**
(`NyxSpecter4/bountywarz` `www/moorpost-kernel.js`, git blob sha
`5f22f4e13e94a82b94c6ce38f474c29ae20dcb23`, vendored byte-identical as
`www/vendor/moorpost-kernel.js`; `selfCheck()` green). Ruling, to prevent
format drift:

- **One receipt contract only.** Receipts remain
  `kinetigor.trust-receipt/v1` envelopes chained under
  `kinetigor.game-run/1` (§1). MOORPOST relay **packets** are challenge
  artifacts — evidence the player examines, like waybills and logs —
  never a second receipt format, and never emitted as receipts.
- **Packet integrity hashing is the estate's frozen choice and is not
  changed here.** The kernel seals packets with FNV-1a 32-bit
  (`integrity_hash`), with frozen refusal codes
  `REFUSED_IDENTITY | PROVENANCE | SEQUENCE | REPLAY | RACE | STALE |
  NO_FALSIFIER | ACCEPTED`. That is a hop-local tamper seal inside the
  relay machine, deliberately distinct from the chain's SHA-256: the
  packet seal proves a hop's state was not amended after stamping;
  the chain's SHA-256 proves the run's receipts were not amended after
  judgment. Two machines, two jobs, one trust story — no cross-rewiring.
- The game judges Delivery by re-walking both courier logs with the
  vendored kernel (`walkRelayPath`), so a packet narrative that disagrees
  with the kernel's refusal is a lie the kernel exposes — the station's
  whole mechanic. The kernel's verdicts on packets never appear in
  receipts except as the judge's evidence, quoted and reason-coded under
  the receipt contract above.


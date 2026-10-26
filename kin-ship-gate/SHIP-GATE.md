# kin-ship-gate — the OFFERED interlock (SHIP-GATE-001)

Status: **WIRED-IN-PROTOCOL — FIRST VERDICTS EXECUTED BY THE JUDGE.** Routing the dock's actual OFFERED action through this gate is the remaining human step (staged ≠ deployed applies to ourselves).

## The law

No product of this estate may be listed OFFERED, or marked SOLD, unless the corresponding trust receipt has been judged ACCEPTED by THE judge — kin-trust-protocol/validate_receipt.js, invoked unchanged through kin-ship-gate/ship_gate.js. There is no route around. Fail-closed: malformed input is a refusal, never a pass; no narrator promotes state.

## The ladder (judge-enforced; nothing skips a rung — including us)

CLAIMED → BUILT → MEASURED → VERIFIED → STAGED → DEPLOYED → LIVE-VERIFIED → OFFERED → SOLD

- BUILT demands artifact evidence measured at the target — commits prove repository state only.
- OFFERED demands stranger-obtainable publication evidence with terms and claim parity.
- SOLD demands a transaction record.

## First wired pathway: kin-security-scan ($7)

The estate product closest to shipment; blocked on one missing artifact, not on engineering. First executed verdicts (judge output verbatim in verdicts/first-run.json):

- **SHIP-GATE-R0** — registration CLAIMED: **ACCEPTED** by the judge.
- **SHIP-GATE-E01** — promotion CLAIMED→BUILT: **REFUSED + QUARANTINED** at the BUILT gate. kin-security-scan.zip never arrived (0 bytes at the seat); last_valid_state CLAIMED; unblock condition: artifact observed non-zero at the target, then re-receipt.

The dock's RED is now a machine verdict, not a narrator's note.

## Usage

node kin-ship-gate/ship_gate.js kin-ship-gate/receipts/SHIP-GATE-*.json

Exit codes mirror the judge: 0 = every promotion ACCEPTED; 1 = at least one REFUSED/QUARANTINED (the refusal IS the record); 2 = malformed receipt.

## Honest limits

- The gate is wired in protocol and its verdicts are executed and recorded against the judge at commit 4d25ad10b2f37a73c3d76f1806c19a80400918f9. The dock's actual listing flow does not yet invoke it automatically — one human step: route the dock's OFFERED action through ship_gate.js.
- The judge guarantees the required KIND of evidence, not the semantic truth at the locator — that truth stays checkable by any stranger at the locator itself.

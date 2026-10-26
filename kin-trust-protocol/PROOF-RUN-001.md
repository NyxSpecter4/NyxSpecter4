# PROOF-RUN-001 — executed record

Proof artifact: the Kinetigor Trust Protocol itself (kin-trust-protocol v1.0.0).
Objective, pre-registered in the README of commit 99540db11e21dffc3416ca022d100aae3e9b2310 before execution: take one real artifact from CLAIMED to LIVE-VERIFIED with an executed fail-closed judge at every rung, no narrator promotions, and one negative control that must be refused.

## Pre-registered acceptance rules (written before execution)

- P1 VALIDITY: judge executed on target-fetched bytes accepts R0, E01, E02 and refuses E03 (QUARANTINED).
- P2 BYTES: every file's target-served git-blob digest equals the pushed digest.
- P3 CHAIN: R1-R6 form a strictly adjacent CLAIMED-to-LIVE-VERIFIED chain, each judged PASS from target-fetched bytes.
- P4 INDEPENDENCE: the LIVE-VERIFIED observation dereferences a public anonymous locator through an instrument different from the push path.
- Failure handling: any rule failure records the run FAILED with the failure verbatim; the refusal discipline is the proof, not the green.

## Round 1 — staging (commit 99540db11e21dffc3416ca022d100aae3e9b2310)

7 files pushed to NyxSpecter4/NyxSpecter4 main at 2026-10-26T20:22Z: README.md (6,696 B), receipt.schema.json (4,600 B), validate_receipt.js (10,090 B), receipts R0/E01/E02/E03 (1,465 / 2,544 / 1,595 / 2,067 B).

## Rule P2 — bytes: PASS

All 7 target-served files re-fetched via the contents API; 7/7 git-blob sha1 matches, 7/7 byte-size matches: 35fe46f7eac8e1a3523f2aa54c59e0b3343986e4, 0a53f5794feae59340c126058402abdbb076a66e, c74a7cd7369bf4fed12e64080ab48edd52c97230, 54283eb31836363d2b83eb14c5e2cb218a69afd0, afd8370be0fb95922bfcb988840f32549b08da57, 125b14eb496eba879a91397d9d55ef7e1495b636, 943ba337290566c59e50029b7d4061ebb1ad484e.

## Rule P1 — judge on target bytes: PASS

The judge source was fetched from the target and executed over the four target-fetched receipts:

- R0-claim: ACCEPTED
- E01-hf-remediation-staged: ACCEPTED
- E02-kit-v2-built: ACCEPTED
- E03-negative-hf-deployed: REFUSED, disposition QUARANTINED — reason: gate DEPLOYED requires evidence of type deployment (TARGET-SIDE observation tying live bytes to the staged candidate — a deploy command is not evidence) — present types: commit

## Deployment observation (R5) — including the uncomfortable detail

The anonymous raw.githubusercontent.com fetch of validate_receipt.js measured 10,095 bytes against the staged 10,090. Fail-closed discipline required the delta be explained, not waved through: byte-level diff localized it to exactly five inserted LF characters at positions 2000, 4001, 6002, 8003, 10004 — the fetching instrument's regular 2,000-character hard wrapping. Removing only those five insertions reconstructs exact byte equality with the staged digest c74a7cd7369bf4fed12e64080ab48edd52c97230; no other divergence exists anywhere in the file. receipts/R0-claim.json (1,465 B, under the wrap threshold) parsed deep-equal to the staged object on the same anonymous path.

Independent CDN witnesses (cdn.jsdelivr.net, raw.githack.com) were attempted for the deployment observation and refused by the fetching instrument with a 142-byte message: this page could not be read: the site blocked automated access or returned no response. Recorded verbatim. That is an instrument limitation, not a target defect; it is disclosed rather than worked around.

## Independent observation (R6, rule P4): PASS

- raw.githubusercontent.com served receipts/E02-kit-v2-built.json anonymously at 1,595 B, byte-identical to staged digest 125b14eb496eba879a91397d9d55ef7e1495b636.
- The github.com blob page for the README renders the canonical law and the PROOF-RUN-001 pre-registered rules to any anonymous visitor (a serving pipeline different from the API push path).

## Rule P3 — chain: PASS

R1 CLAIMED-to-BUILT, R2 BUILT-to-MEASURED, R3 MEASURED-to-VERIFIED, R4 VERIFIED-to-STAGED, R5 STAGED-to-DEPLOYED, R6 DEPLOYED-to-LIVE-VERIFIED — strictly adjacent, no rung skipped, each judged PASS by the target-fetched judge (R1-R6 judged pre-push from the same target-fetched judge source; the post-push closing loop re-judges them from the target and its result is appended below).

## The falsification test, executed

Claim under test: the HF remediation is complete (i.e. the live HF estate is remediated). The protocol demands a STAGED-to-DEPLOYED transition receipt with target-side evidence. The evidence available is repository commits only. The judge returned: REFUSED, QUARANTINED, last_valid_state STAGED. The negative control exists to be refused, and it was refused. Meanwhile the true claims (remediation is staged; the redaction kit exists in source control) were accepted. The asymmetry is executed by a machine, not decided by rhetoric.

## Regress terminus

The record of the final observation necessarily lives outside the observed set: an observer cannot contain itself. The chain therefore terminates at R6 (LIVE-VERIFIED); the terminal observation is this document, committed after the observations it records. Post-push closing-loop result: to be appended in the closing commit of this run.

## Board impact (no narrator promotions)

- kin-trust-protocol v1.0.0: LIVE-VERIFIED (this run), commercial disposition SHOWCASE (protocol itself).
- HF estate remediation: STAGED. The live HF estate is NOT promoted by this run; E03 quarantine stands until an owner deploy plus target-side re-observation.
- kin-v7-flag-redaction kit v2: BUILT. Not executed; no MEASURED claim.
- Shipping Dock: RED, unchanged; kin-security-scan.zip has still not crossed the evidence horizon.
- Trunk recovery, Athelgard/Droid lane: unchanged by this run.

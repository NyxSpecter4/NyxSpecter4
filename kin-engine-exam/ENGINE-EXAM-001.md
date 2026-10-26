
# ENGINE-EXAM-001 — The Preregistered Case Matrix

**Status: PREREGISTERED — NOT RUN.** Filed 2026-10-26 from the owner-seat design. This document freezes the fixtures, the exact expected verdicts, the refusal vocabulary, and the promotion gates **before any execution**. Per the estate's proof law: success criteria defined before observation; no case may be reinterpreted after the fact; failures preserved, not cleaned.

**The one claim under test:**
> One unchanged trust kernel can adjudicate materially different domains through adapters and policies alone.

**The falsifier (we are trying to kill the engine hypothesis):**
> Any test requiring modification of kernel semantics, special-casing a domain inside the kernel, losing refusal behavior, or generating a receipt the common verifier cannot validate, refutes the engine claim.

**Why 40 cases, not "24/24":** the 24 primary cases are kept deliberately separate from the 12 ordered leakage pairs and the 4 unknown-policy controls. Otherwise a clean-looking 24/24 could conceal the most important engine question: whether alien domain semantics can leak across the shared boundary.

---

## 0 · Grounding — instruments VERIFIED this session (not inherited)

| Instrument | Measured state (2026-10-26, this seat) |
|---|---|
| `moorpost-game/moorpost-kernel.js` + `lib/moorpost-kernel.cjs` + `falcon-flight/moorpost-kernel.cjs` | VERIFIED, full source read (6,884 B / 6,874 chars — units law, third holding) : 5 frozen invariants, frozen refusal codes, `selfCheck()` |
| `scripts/prove-engine.cjs` | VERIFIED (7,718 B / 7,688 chars — units law): G1–G5 convergence gates, frozen kernel SHA `bedf4dc5…df36` = sha256 of `www/moorpost-kernel.js` **@ main**, 7 cases → 1 factory runtime, verdict CANONICAL / NOT-CANONICAL |
| `docs/vcaa/AUDITORS-DESK-EXPERIMENT.md` | VERIFIED (4,687 B): graduation gate **INSTRUMENTED, 48h window NOT STARTED**, baseline `4e533fce7d`, 48 assertions incl. 12 required negatives + interop test |
| `tools/her-adk-soak-receipt.cjs` | VERIFIED (5,158 B): the closed loop — the experiment's own PASS mints as an `auditors-desk-receipt.v1` through the same `verify()` boundary; unsigned seat → `VERIFIED_UNPROVENANCED`, named, never faked |
| `apilib/receipt-verify.js` | VERIFIED (9,627 B): unified offline `verify()`, recognizes the Auditor's Desk shape (Domain #2 interop instrumented) |
| `kin-trust-protocol/` (profile repo) | VERIFIED (prior session): `kinetigor.trust-receipt/v1`, fail-closed judge, PROOF-RUN-001, independently reproduced 10/10 |

**What this means honestly:** in-family convergence (7 Moorpost cases → 1 runtime) and Domain #1→#2 interoperability are already INSTRUMENTED. This exam does not inherit their PASSes — it extends the same convergence pattern across four genuinely different domains, under its own frozen gates.

**Grounding correction (owner relay, 2026-10-26 — accepted, then re-verified from this seat the same pass):** GitHub currently exposes the canonical `kinetigor.trust-receipt/v1` schema, the validator, the lifecycle receipts, the HF-staging receipt, and the explicit negative HF-deployment receipt — and **zero estate-scoped hits for `ENGINE-EXAM-001` or `REFUSED_WRONG_DOMAIN`** (code search, repo-scoped and org-scoped, re-run this pass: 0/0). *Scope law (adopted with this correction): a search claim names its scope and its case policy, exactly as a size claim names its unit — an unscoped global search for `REFUSED_WRONG_DOMAIN` returns 2 unrelated noise hits (a PTP benchmark in a third-party project, case-insensitive match), which is why the claim is stated estate-scoped, not universal.* This exam and its new refusal vocabulary exist **only in this document** until committed on the Captain's order. The matrix is **PREREGISTERED DESIGN** — nothing here may be represented as implemented or executed.

---

## 1 · Frozen refusal vocabulary (binding on the kernel implementation)

The kernel under test must freeze this vocabulary before round 1. Codes marked **inherited** already exist, frozen, in `moorpost-kernel.js` (VERIFIED byte-read) or `receipt-verify.js`; codes marked **new** are preregistered here for the MVP kernel.

| Code | Boundary | Source |
|---|---|---|
| `ACCEPTED` | judge() | inherited — frozen in `moorpost-kernel.js` |
| `REFUSED_NO_FALSIFIER` | judge() | inherited — frozen (`hypothesis_without_falsifier`) |
| `REFUSED_PROVENANCE` | judge()/issue() | inherited — broken seal / digest mismatch |
| `REFUSED_IDENTITY` | judge() | inherited — wrong owner/subject |
| `REFUSED_REPLAY` | judge() | inherited — uniqueness (`already_entered` / `replay`) |
| `REFUSED_STALE` | judge() | inherited — expired |
| `REFUSED_EVIDENCE_GATES` | judge() | **new** — policy gates unmet (wrong/insufficient evidence) |
| `REFUSED_INSUFFICIENT_AUTHORITY` | judge() | **new** — actor outside authorized scope |
| `REFUSED_WRONG_DOMAIN` | judge() | **new** — policy applied to alien domain claim |
| `REFUSED_UNKNOWN_POLICY` | judge() | **new** — unknown policy_id/version, or missing gate mode columns |
| `REFUSED_TAMPERED` | verify() | **new** — mutated receipt fails digest recompute |
| `REFUSED_INCONSISTENT` / `REFUSED_MALFORMED` | verify() | inherited — `receipt-verify.js` vocabulary |
| `QUARANTINED` (+ reason + last_valid_state) | judge() | inherited — trust protocol disposition |

Verify-boundary outputs: `VERIFIED` / `VERIFIED_UNPROVENANCED` (inherited, `receipt-verify.js`).

---

## 2 · The four domains

| Domain | Claim under test | Adapter supplies | Policy (preregistered) |
|---|---|---|---|
| **A — Moorpost** | "A control was legitimately solved." | control evidence + station semantics | `moorpost-control-policy` v1.0.0 — gates (all-of): falsifier present, evidence digest matches registered control, station sequence holds |
| **B — Auditor's Desk** | "This audit verdict has earned acceptance." | claim shape, artifact + findings digests, falsifier, authority | `auditor-policy-v1` — gates (all-of): source lock, artifact lock, evidence lock, execution lock, authority lock; signature status named (law 6) |
| **C — Agent Assurance** | "Agent completed task X within authority per acceptance policy." | task record, test-run observation, delegated scope | `agent-completion-policy` v1.0.0 — gates (all-of): observation integrity, evidence alignment with the exact claim, action inside delegated scope |
| **D — Release Verification** | "Artifact X is DEPLOYED." | commit refs, target-side observation records | `deployment-policy-v1` — gates (all-of): target-side observation satisfying the preregistered deployment predicate; commit evidence proves repository state only (E03 inheritance) |

Every policy carries an explicit `mode` column per gate (`all-of` / `any-of` / `none`). A policy without modes is `REFUSED_UNKNOWN_POLICY` — the 923e8de6 spec-defect class is a refusal, not an inference.

**Case-type numbering (fixed across domains):** 1 = VALID · 2 = WRONG EVIDENCE · 3 = MISSING FALSIFIER · 4 = WRONG AUTHORITY · 5 = TAMPERED RECEIPT · 6 = REPLAY.

**Naming reconciliation (owner relay, 2026-10-26):** the relay's paraphrase listed "Dataset Verification — valid release" and ordered Agent Assurance last; the frozen order above (A Moorpost · B Auditor's Desk · C Agent Assurance · D Release Verification) is binding, and the relay's case lists map 1:1 onto it (its "false completion" = C2's assertion-vs-observation conflict; "self-certification" = D4; "handoff-replay" = C6 replay). If the Captain intends a genuinely distinct dataset-release domain in place of D, that is a one-line amendment on his word — until then the matrix is frozen as written.

---

## 3 · Domain A — Moorpost (cases EE2-A1 … EE2-A6)

| Case | Fixture | Expected | Assertions |
|---|---|---|---|
| **A1 VALID** | Issued packet: control `CTL-7` claim, falsifier, evidence = solver transcript digest + station stamp, authority = courier at station, correct sequence | `ACCEPTED` → receipt; verify() → `VERIFIED` (unsigned seat: `VERIFIED_UNPROVENANCED`, named) | receipt envelope `kinetigor.trust-receipt/v1`; evidence_digest recomputes; falsifier present; previous_receipt resolves |
| **A2 WRONG EVIDENCE** | Evidence digest points to a different control's transcript | `REFUSED_EVIDENCE_GATES` | no receipt minted; no state change; reason recorded |
| **A3 MISSING FALSIFIER** | Falsifier field empty | `REFUSED_NO_FALSIFIER` | frozen inherited code, exact token match |
| **A4 WRONG AUTHORITY** | Actor = passenger (policy requires courier scope) | `REFUSED_INSUFFICIENT_AUTHORITY` | named scope mismatch in reason |
| **A5 TAMPERED RECEIPT** | A1's receipt with claim text mutated after mint | verify() → `REFUSED_TAMPERED` | mutated receipt never re-enters ledger; original receipt still verifies |
| **A6 REPLAY** | A1's exact proposal resubmitted | `REFUSED_REPLAY` | uniqueness invariant; identical input ≠ second acceptance |

## 4 · Domain B — Auditor's Desk (cases EE2-B1 … EE2-B6)

| Case | Fixture | Expected | Assertions |
|---|---|---|---|
| **B1 VALID** | Audit receipt over artifact + source_sha, artifact digest, findings digest, verdict PASS, falsifier, authority = auditor seat | `ACCEPTED` → receipt; verify() → `VERIFIED_UNPROVENANCED` on unsigned seat (preregistered honest downgrade; `VERIFIED` only with the Captain's key) | source lock (pinned source_sha); artifact lock; a refusal is never minted as a receipt |
| **B2 WRONG EVIDENCE** | findings_sha256 does not match the referenced findings; receipt copied to a different artifact | `REFUSED_EVIDENCE_GATES` | artifact lock fails closed — copied receipts refuse |
| **B3 MISSING FALSIFIER** | Missing/short falsifier | `REFUSED_NO_FALSIFIER` | grader rule inherited from the estate's fail-closed laws |
| **B4 WRONG AUTHORITY** | Authority actor = the soak monitor (observes) attempting to judge/mint (auditor's job) | `REFUSED_INSUFFICIENT_AUTHORITY` | the monitor-observes/auditor-judges separation enforced |
| **B5 TAMPERED RECEIPT** | B1's receipt with `artifact_sha256` mutated | verify() → `REFUSED_TAMPERED` | digest recompute fails; provenance never faked as LOCKED |
| **B6 REPLAY** | Same finding re-issued (same receipt/event identity) | `REFUSED_REPLAY` | chain lock: append-only; nothing mints twice |

## 5 · Domain C — Agent Assurance (cases EE2-C1 … EE2-C6)

| Case | Fixture | Expected | Assertions |
|---|---|---|---|
| **C1 VALID** | Agent claims completion of task X; evidence = test-run transcript digest (suite green), authority inside delegated scope, falsifier = "a failing test refutes completion" | `ACCEPTED` → receipt | evidence_digest matches the recorded observation; scope holds |
| **C2 WRONG EVIDENCE — the deliberate conflict** | Agent asserts PASS; the evidence digest resolves to a transcript containing failures — the agent's statement and the observation disagree | `REFUSED_EVIDENCE_GATES` | **the key case:** the agent's assertion is not evidence; unsupported completion never becomes accepted — the exam fails if this acceptance ever occurs |
| **C3 MISSING FALSIFIER** | Completion claim without falsifier | `REFUSED_NO_FALSIFIER` | exact frozen token |
| **C4 WRONG AUTHORITY** | Agent acted outside delegated boundary (e.g., modified the grader itself — a self-certification attempt) | `REFUSED_INSUFFICIENT_AUTHORITY` | candidate may never judge its own promotion; any grader-touching action is refused, not warned |
| **C5 TAMPERED RECEIPT** | C1's receipt with evidence digest mutated | verify() → `REFUSED_TAMPERED` | stranger-side tamper detection, same as A5/B5/D5 — identical boundary behavior across domains |
| **C6 REPLAY** | C1 resubmitted | `REFUSED_REPLAY` | uniqueness across domains, same code |

## 6 · Domain D — Release Verification (cases EE2-D1 … EE2-D6)

| Case | Fixture | Expected | Assertions |
|---|---|---|---|
| **D1 VALID** | Evidence = target-side observation record satisfying `deployment-policy-v1` (production target serving artifact digest X, timestamped), authority = deployer seat, falsifier = "serving a different digest refutes deployment" | `ACCEPTED` → receipt | **D1's evidence must be a real observation of a real target, or this domain's result is labeled FIXTURE-ONLY and does not count toward Gate 3** |
| **D2 WRONG EVIDENCE — commit-only** | Evidence = commit SHA only ("the code is merged") | `REFUSED_EVIDENCE_GATES` | the E03 inheritance: a commit proves repository state, never deployment; claim's `last_valid_state` remains STAGED |
| **D3 MISSING FALSIFIER** | Deployment claim without falsifier | `REFUSED_NO_FALSIFIER` | exact frozen token |
| **D4 WRONG AUTHORITY** | The artifact's author certifies its own deployment (crib law: the subject never authors the exam) | `REFUSED_INSUFFICIENT_AUTHORITY` | self-certification refused at the authority gate |
| **D5 TAMPERED RECEIPT** | D1's receipt with the target observation digest mutated | verify() → `REFUSED_TAMPERED` | tamper detection identical across all four domains |
| **D6 REPLAY** | D1 resubmitted | `REFUSED_REPLAY` | same code as A6/B6/C6 — domain-independent uniqueness |

---

## 7 · The 12 ordered leakage cases (EE2-L)

Policy of domain X is presented with the claim/evidence of domain Y (X ≠ Y). All 12 ordered pairs:

| Case | Policy | Claim | Expected |
|---|---|---|---|
| EE2-L-A→B | moorpost-control-policy | Auditor's Desk claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-A→C | moorpost-control-policy | Agent completion claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-A→D | moorpost-control-policy | Deployment claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-B→A | auditor-policy-v1 | Moorpost control claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-B→C | auditor-policy-v1 | Agent completion claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-B→D | auditor-policy-v1 | Deployment claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-C→A | agent-completion-policy | Moorpost control claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-C→B | agent-completion-policy | Auditor's Desk claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-C→D | agent-completion-policy | Deployment claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-D→A | deployment-policy-v1 | Moorpost control claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-D→B | deployment-policy-v1 | Auditor's Desk claim | `REFUSED_WRONG_DOMAIN` |
| EE2-L-D→C | deployment-policy-v1 | Agent completion claim | `REFUSED_WRONG_DOMAIN` |

**Any acceptance in this block is an automatic exam failure regardless of the other 28 cases.** A policy that judges outside its domain has leaked; the engine claim is refuted.

## 8 · The 4 unknown-policy controls (EE2-U)

| Case | Fixture | Expected |
|---|---|---|
| EE2-U-A | Domain A's otherwise-valid claim + unregistered policy_id | `REFUSED_UNKNOWN_POLICY` |
| EE2-U-B | Domain B's otherwise-valid claim + registered policy_id, unregistered version | `REFUSED_UNKNOWN_POLICY` |
| EE2-U-C | Domain C's otherwise-valid claim + policy document missing gate mode columns | `REFUSED_UNKNOWN_POLICY` (the 923e8de6 class) |
| EE2-U-D | Domain D's otherwise-valid claim + unregistered policy_id | `REFUSED_UNKNOWN_POLICY` |

Unknown policy never falls back to a default judgment — fail-closed means the kernel would rather refuse everything than guess a policy.

---

## 9 · The six gates (all must hold — any failure = exam failure)

| Gate | Requirement | Measured as | Inheritance |
|---|---|---|---|
| **G1 · Kernel immutability** | 0 kernel modifications across all four domains | Frozen SHA **with its ref** recorded before round 1, re-verified before and after every round | `prove-engine.cjs` G1 pattern. **Ref law (landed before the preregistration commit — a frozen SHA without its ref is a swappable kernel):** the existing constant `bedf4dc5…df36` = sha256 of `www/moorpost-kernel.js` **@ main** (6,884 B; **master carries a DIFFERENT file** — 4,975 B, sha256 `3c293392…` — so a G1 run against a master checkout fails spuriously, and "repairing" it by re-freezing to master silently swaps the kernel under green gates; the 303-vs-324 class, caught before it cost a day). The MVP kernel gets its own frozen SHA **with ref** at freeze time |
| **G2 · Policy isolation** | Domain semantics live only in adapters/policies | `0` occurrences of `domain === "moorpost"` / `"agent-assurance"` / etc. inside the core; **Domain Leakage Ratio = domain-specific branches inside kernel ÷ total consequential kernel branches = 0** | `prove-engine.cjs` G2 structural convergence |
| **G3 · False acceptance** | Unsupported consequential promotions | **0** across all 40 cases (incl. C2, D2, all leakage, all policy controls); D1 must be real target-side evidence or FIXTURE-ONLY | PROOF-RUN-001 negative-control law |
| **G4 · Receipt interoperability** | Every emitted receipt enters the same verifier boundary | 100% of minted receipts → one `verify()`; verify() accepts domain verdicts of PASS and FAIL identically (validity ≠ truth) | `receipt-verify.js`; AUDITORS-DESK-EXPERIMENT decisive interop test |
| **G5 · Tamper detection** | Every mutated integrity-critical receipt refused | A5, B5, C5, D5 → `REFUSED_TAMPERED`, 4/4 | artifact lock; `her-adk-soak` falsifier design |
| **G6 · Independent reproduction** | A second implementation receives only: public specification, policies, fixtures, receipts — no original implementation | Same verdicts on all 40 cases; divergences reconciled per the reconciliation law, table preserved verbatim | second-witness law (the judge reproduction) |

**Semantic leakage is the metric that separates the outcomes:** four applications sharing a library vs. a genuine engine. The engine must know **how evidence earns state**. It must not know what a CTF control, an audit finding, a deployment, or an agent task **means** — the policies know those things.

---

## 10 · Execution protocol (PROOF-RUN-001 methodology, inherited)

1. **Freeze:** kernel source + policy packs + fixtures committed; kernel SHA **and its ref** recorded (G1 ref law); self-test vectors run (sha256 FIPS + legacy FNV-1a adapter self-test); the refusal vocabulary of §1 matches the kernel source byte-for-byte.
2. **Round per domain:** A → receipt; B → receipt; C → receipt; D → receipt. G1 re-verified between every round. Each round emits its own run receipt.
3. **Leakage block:** 12 ordered pairs → expect 12 × `REFUSED_WRONG_DOMAIN`.
4. **Policy controls:** 4 × `REFUSED_UNKNOWN_POLICY`.
5. **Tamper pass:** A5/B5/C5/D5.
6. **Closing loop:** re-fetch all receipts from the target, re-run the complete chain, record terminal observation. **The exam's own verdict is minted as a receipt through the same boundary it tested** (the `her-adk-soak` closed-loop design); unsigned seat → `VERIFIED_UNPROVENANCED`, named, never faked.
7. **Second witness (G6):** spec + policies + fixtures + receipts only.

## 11 · Promotion rule (preregistered, binding)

**If — and only if — all six gates hold:**

```
same kernel · same envelope · same verifier boundary
0 kernel modifications · 0 false acceptance · 0 semantic leakage
4/4 tamper refusals · 12/12 leakage refusals · 4/4 policy refusals
independent reproduction from spec alone
```

then and only then: **Moorpost Trust Kernel → Kinetigor Trust Engine.**

**Pass criterion, one line (owner relay, 2026-10-26, adopted verbatim):**
> 24/24 expected primary verdicts + 12/12 alien-policy refusals + 4/4 unknown-policy refusals + zero false acceptances + zero domain branches in the kernel + unchanged kernel bytes + independent reproduction.

**The sharp statement (owner relay, adopted):** the engine exam is not testing whether the kernel knows four domains. **It is testing whether the kernel can remain ignorant of all four domains.** The adapters understand the compartments; the kernel understands only the law. That is exactly the submarine lesson — bulkheads hold because the hull does not know what is in each compartment.

That satisfies M7 in a stronger form than "two products import the same module": it demonstrates a **domain-independent invariant**. The estate's M7 vocabulary applies after a second consumer and reuse receipts; the word "engine" is not spoken before this exam passes.

**If any gate fails:** the artifact remains a **COMPONENT**. The failure is preserved in the exam record verbatim — divergence table, witness bugs, and all — per the preservation rule. No narrator promotes state; the receipt must survive the agent that produced it.

## 12 · Honest board (unchanged cells, unchanged labels)

| Cell | State |
|---|---|
| This matrix | PREREGISTERED — NOT RUN (binding before execution) · **DESIGN FROZEN — owner-relay endorsed the matrix, the one-line pass criterion, and the Trust Engine promotion threshold 2026-10-26** · not on GitHub (0 code-search hits, re-verified same pass) |
| MK-MVP-001 (the kernel it will test) | SPECIFIED — NOT IMPLEMENTED |
| prove-engine G1–G5 (in-family convergence) | VERIFIED as instruments; their PASSes are not this exam's |
| Auditor's Desk 48h graduation window | INSTRUMENTED — NOT STARTED |
| HF remediation | STAGED — this exam promotes nothing |
| T3–T5 (learning/transfer) | NOT RUN — this exam tests architecture, not intelligence |
| Commercial (OFFERED→SOLD) | NOT EARNED — this exam tests the machine, not the market |
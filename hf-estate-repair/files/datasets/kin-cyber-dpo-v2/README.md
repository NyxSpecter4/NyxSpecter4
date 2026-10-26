---
license: mit
task_categories:
- text-generation
- reinforcement-learning
language:
- en
tags:
- cybersecurity
- dpo
- rlhf
- security-auditing
- cve
- mitre-attack
- cti-bench
size_categories:
- 1K<n<10K
configs:
- config_name: dpo
  data_files:
  - split: train
    path: dpo.jsonl
  default: true
- config_name: quarantine
  data_files:
  - split: train
    path: quarantine.jsonl
- config_name: sft
  data_files:
  - split: train
    path: sft.jsonl
---

# KIN Cybersecurity DPO v2 Preference Dataset

Empirically mined and zero-leak sanitized preference dataset for training cybersecurity and agentic code repair models.

## Dataset Summary
* Total DPO Pairs: 1,171 (Updated 2026-10-14)
  - Folded corpus before the on-domain gate: 2,512 pairs — 1,637 canonical + 875 staged PR-review translation pairs across 184 CWE families
  - Every shipped row passes the on-domain cyber-signals gate and carries a machine-checkable provenance receipt
  - 1,341 gated-out rows ship alongside in `quarantine.jsonl` — published, not deleted
  - This line is auto-reconciled by the fold/stamp pipeline; `stamp-receipt.json` in this repo is the machine truth
* **Format:** Direct Preference Optimization (DPO) schema: `{ prompt, chosen, rejected, metadata }` — `metadata.receipt` on every row
* **Zero PII / Secret Sanitization:** Machine-audited against API tokens, private keys, session tokens, and internal paths.

## Receipts, Verification & Quarantine

KIN Cyber DPO uses a receipt-bearing publication pipeline designed to make provenance, filtering, and release integrity independently checkable. Receipt status is distinct from semantic verification, and verification stages are reported explicitly rather than inferred. As far as our documented sweep found (2026-10-14: 17 security-DPO datasets inspected on the live Hub; none ships per-row receipts; two gated repos uninspectable; per-repo evidence in the build repo's HF-ESTATE-MAP), no other security-DPO corpus ships a machine-checkable receipt for every row and publishes its quarantined rows instead of deleting them. That finding is evidence-cited, not a ranking claim.

Every kept row carries `metadata.receipt`: `row_sha256` (stable identity over prompt/chosen/rejected), `stage`, `gate`, matched `signals`, `stamped_at`, `stamper`. Honesty notes:

* stage `provenance` is a **process receipt, not a content verification** — no manufactured trust
* stage `verified` appears only on rows that already carried `verified_by` before stamping
* `quarantine.jsonl` carries every gated-out row with its reason (`insufficient-cyber-signals` or `internal-content`) and timestamp — quarantine is data, not garbage, and every row is recoverable
* `stamp-receipt.json` carries the fold/stamp receipt: input/kept/purged counts, purge reasons, output sha256s, and a conservation flag
* `release-gates.py` (mirrored in this repo) re-executes Gates 1–6 anonymously — artifact integrity (byte identity), receipt integrity (every row's receipt hash recomputed from scratch — linkage, not content correctness), conservation (input = kept + quarantined; sft row count must equal the kept count), card↔artifact parity (the card's claimed counts must equal the machine-derived counts; the card carries no superseded totals; the public file tree carries no legacy dataset files), the semantic-verification census (semantic verification is counted, never inferred), and viewer↔release parity (the Dataset Viewer's `dpo` config must report exactly the shipped row count; any pending, stale, or failed viewer state yields UNPROVEN, never PASS) — and emits `gates-receipt.json` with a single verdict: PASS | FAIL | UNPROVEN. The latest executed verdict is committed alongside this card.

## Release Lineage

Commit messages dated before 2026-10-14 describe superseded pre-receipt-era
snapshots (Sep 1 - Sep 13, 2026) that no longer exist in this release. The
machine truth for the current release is `stamp-receipt.json` (fold/stamp
receipt) and `gates-receipt.json` (anonymous release-gates verdict) — not
commit titles, and not a viewer that may still be re-indexing after a push.
The dataset viewer's default config is `dpo` (the receipt-bearing
`dpo.jsonl`); `quarantine` and `sft` are separate configs. Legacy Sep-era
data files were removed from the release branch on 2026-10-14; commit
history preserves them for audit.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| prompt | string | The input scenario (code diff, CVE description, agent trace) |
| chosen | string | Five-field brief — claim, blast radius, why, how to verify, confidence |
| rejected | string | Vague filing without a replayable verification |
| metadata | json | `receipt` (row_sha256, stage, gate, signals, stamped_at); `cwe`, `severity`, `input_type` where known |

## Files in this repo

| File | Description |
|------|-------------|
| `dpo.jsonl` | Stamped, on-domain canonical — receipt on every row |
| `quarantine.jsonl` | Gated-out rows with reasons (recoverable) |
| `stamp-receipt.json` | Machine-checkable fold/stamp receipt |
| `gates-receipt.json` | Latest anonymous release-gates verdict (PASS/FAIL/UNPROVEN) |
| `release-closure-receipt.json` | Release closure receipt — artifact hashes, public endpoint checks, executed gate verdicts |
| `release-gates.py` | Gate 1–6 executor — artifact integrity, receipt integrity, conservation, card↔artifact parity, semantic-verification census, viewer↔release parity — reproduce the verdict yourself, no token |
| `sft.jsonl` | SFT format (pre-gate by design; the trainer applies the filter) |

## Companion Models
* **Canonical Model:** [nyxspecter4/kin-cybersecurity-3b](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b) (3B, merged weights)
* **GGUF (local):** [nyxspecter4/kin-cybersecurity-3b-gguf](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b-gguf) (Q4_K_M / Q5_K_M / Q8_0)
* **Legacy (deprecated):** [nyxspecter4/kinetigor-dpo-cybersec](https://huggingface.co/nyxspecter4/kinetigor-dpo-cybersec) (0.5B)
* **Live Demo:** [nyxspecter4/kin-cybersec](https://huggingface.co/spaces/nyxspecter4/kin-cybersec)

## Corpus Growth & Fold Pipeline (Oct 14, 2026)

The canonical pairs above are the folded snapshot (baseline v4 + hermetic v5).
Growth since then is staged in the private build repo
([NyxSpecter4/bountywarz](https://github.com/NyxSpecter4/bountywarz), branch
main, `hf-training/`): **875 unique staged pairs across 184 CWE families**
(PR review translation, agent traces, bounty reports), deduped against the
canonical corpus and each other — retrain threshold met at roughly 8.75x.
Every fold runs the receipt-stamp gate before upload: the folded 2,512 pairs
become the shipped on-domain canonical plus the published quarantine
(`stamp-receipt.json` carries the exact counts), and the fold fires the
KIN v2 retrain.

## Capturing New Pairs (kin-fabric-envelope/1)

New pairs are captured at the surface where the security work happens —
games, the Athelgard desk, bounty pipelines — in the
**kin-fabric-envelope/1** schema:

- prompt: { task, input_type, artifact }
- chosen: the five-field brief — claim, blast_radius, why, how_to_verify,
  confidence (a pair without a replayable check is rejected at validation)
- rejected (optional): the vague or jargon-shaped filing it is contrasted with
- metadata: { cwe, severity, model_slug, notes }

The `kin-fabric` module (same repo, `packages/kin-fabric/`) validates and
queues envelopes offline-first; `hf-spine-merge.py` dedups and stages them;
committing a staged batch fires the fold that updates this dataset.

## Where This Dataset Runs

KIN, trained on this corpus, is the mentor brain behind the Kinetigor 3D
cybersecurity games and the Athelgard desk. Every surface calls it through
the KIN Inference Fabric — local Ollama first, then the HF router, then the
[bountywarz-gateway](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway)
Space — and every verified brief a surface produces flows back here.

**Storefront:** the corpus, the model it trains, and the demo are one loop —
[the model](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b),
[the GGUF](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b-gguf), and
[the live demo Space](https://huggingface.co/spaces/nyxspecter4/kin-cybersec)
where a five-field translation can be tried in the browser. The games'
apprentice panels (London, San Francisco, Persian Gulf ranges) call the same
model and capture their verified briefs back into this schema.

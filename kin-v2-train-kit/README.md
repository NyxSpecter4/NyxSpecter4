# KIN v2 Training Kit (public, zero-auth)

Everything needed to train **KIN v2** (Qwen2.5-3B cybersecurity DPO successor) on a free Google Colab T4 — no GitHub token, no HF token until the optional final upload.

## Contents

- `data/dpo-v2-train.jsonl.gz.b64` — prebuilt v2 training corpus: **2,512 DPO pairs** = 1,637 canonical (HF `nyxspecter4/kin-cyber-dpo-v2` `dpo.jsonl`) + 875 staged unique pairs folded from the 19 `dpo-v3-pr-review-pairs-*.jsonl` batches. gzip+base64, 1,028,076 bytes. Fold-verified twice (independent replica of the fold/dedup logic: zero duplicates, zero invalid rows, zero bad JSON).
- `stamped/` — the executed on-domain stamp of that corpus (Oct 14, 2026): **1,171 receipt-bearing DPO pairs** + **1,341 quarantined rows** (reasons on every row, never deleted) + the machine-checkable `stamp-receipt.json`. Zero-auth. See `stamped/README.md`.
- `scripts/` — the four pipeline scripts, mirrored verbatim from the build repo:
  - `fold-dpo-batches.py` — canonical fold/dedup logic (not needed for the prebuilt corpus; included for provenance and re-verification)
  - `prepare_kin_data.py` — DPO → SFT conversion (expects **1,171 SFT rows** from the union corpus)
  - `train_kin_v2.py` — local unsloth training: Qwen2.5-3B, LoRA r16 α32 all-linear, 4-bit, 3 epochs, seq 4096, T4 fp16 fallback built in
  - `eval_kin.py` — 6-envelope 60-point harness: v1 vs v2 vs base
- `kin-v2-train-free-colab.ipynb` — the zero-auth Colab notebook.

## Run (2 steps)

1. Open `kin-v2-train-free-colab.ipynb` in Google Colab. Runtime → Change runtime type → **T4 GPU**.
2. **Run all.** The notebook decodes the corpus, asserts 2,512 pairs → 1,171 SFT rows, trains, saves to Google Drive, then runs the eval harness. No credentials at any point before the optional upload cell.

## Publish gate

v2 must **beat base `Qwen/Qwen2.5-3B-Instruct`** on the eval harness before any HF publish. v1 scored 40/60 vs base 47/60 (executed Oct 12, 2026). Do not publish below base.

## Notes

- No secrets in this kit. The only token ever needed is an optional HF write token for uploading the finished model to `nyxspecter4/kin-cybersecurity-3b-v2`.
- Corpus severity labels use inconsistent casing (`Critical`/`critical` …) — hygiene note only, does not affect training.

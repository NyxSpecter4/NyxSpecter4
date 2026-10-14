# Stamped receipt-bearing corpus (executed stamp — Oct 14, 2026)

The executed output of the fold + on-domain stamp pipeline (`stamp-receipts.py`, blob `daa1b185`), published zero-auth. This is the exact corpus that lands on HF `nyxspecter4/kin-cyber-dpo-v2` on the next green fold — published here so training and verification never wait on it.

## Contents

- `dpo-v2-stamped.jsonl.gz.b64` — **1,171 on-domain DPO pairs**, every row carrying `metadata.receipt = { row_sha256, stage, gate, signals, stamped_at, stamper }` (gzip+base64, 527,252 bytes)
- `dpo-v2-quarantine.jsonl.gz.b64` — **1,341 gated-out rows** with `purge_reason` + `quarantined_at` each (1,310 insufficient-cyber-signals + 31 internal-content) — published, not deleted; every row recoverable (gzip+base64, 591,847 bytes)
- `stamp-receipt.json` — the machine-checkable receipt: input 2,512 → kept 1,171 / purged 1,341 · conservation true · output sha256 `cc076f18…` · quarantine sha256 `455694c4…` · stages {provenance 1,170, verified 1}

## Honesty notes

- stage `provenance` is a **process receipt, not a content verification**. stage `verified` appears only on the single row that already carried `verified_by` before stamping. No manufactured trust.
- The gate is `cyber-signals-v1` (the same cyber-signal filter the SFT pipeline uses). It quarantines some on-domain keyword-poor rows — they are recoverable from the quarantine file, never deleted.

## Decode & verify (no credentials)

```bash
base64 -d dpo-v2-stamped.jsonl.gz.b64 | gunzip > dpo.jsonl
wc -l dpo.jsonl        # 1171
python3 - <<'EOF'
import json, hashlib
rows = [json.loads(l) for l in open('dpo.jsonl')]
assert len(rows) == 1171
assert all('receipt' in r.get('metadata', {}) for r in rows)
data = open('dpo.jsonl','rb').read()
print('sha256', hashlib.sha256(data).hexdigest())
# compare against output_sha256 in stamp-receipt.json (stamped_at varies per run; counts are the invariant)
EOF
```

## Provenance chain

1. Fold: 2,512 pairs = 1,637 canonical (HF `nyxspecter4/kin-cyber-dpo-v2` `dpo.jsonl`) + 875 staged unique pairs — prebuilt in `../data/dpo-v2-train.jsonl.gz.b64`, fold-verified twice.
2. Stamp: the real `stamp-receipts.py` executed Oct 14, 2026 (UTC) — numbers above are executed, not projected.
3. The staged HF dataset card (build repo `kin-deploy/dataset-card/README.md`) already carries these counts; the live HF card auto-reconciles on the next green fold.

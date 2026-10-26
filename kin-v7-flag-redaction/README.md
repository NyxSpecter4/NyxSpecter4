# kin-v7-flag-redaction — v2 (supersedes v1)

Family-wide redaction kit for
[`nyxspecter4/kinetigor-dpo-cybersec-v7-dataset`](https://huggingface.co/datasets/nyxspecter4/kinetigor-dpo-cybersec-v7-dataset)
(the doctrine/staging dataset). **v2, 2026-10-26 — supersedes the v1 kit.**

## Why v2

The v1 kit's scan matched only `CTF{...}`-shaped strings, found "exactly
ONE" literal, and patched it. The corrected scan (adversarial audit,
2026-10-26) shows the corpus carries a whole family of literal values:

| Pattern | v1 belief | Measured (2026-10-26) |
|---------|-----------|------------------------|
| `Null0rigin{...}` / `NullOriginCTF{...}` flag literals | 1 | ~10 distinct values (≥10 occurrences in `dpo-combined.json`, ≥9 in `dpo-expanded.json`) |
| Supabase `challengeId` UUIDs | 0 | 2 |
| Instagram GraphQL `query_hash` | 0 | 1 |
| `train/dpo.json` | — | clean (0 hits) |

v1 was never executed against the live files; the public corpus still
carries every literal above until this kit runs.

## What it redacts

| Literal (measured) | Replacement |
|--------------------|-------------|
| `Null0rigin{...}` / `NullOriginCTF{...}` values | `Null0rigin{redacted}` |
| The two Supabase `challengeId` UUIDs | `challenge-redacted` |
| The Instagram GraphQL `query_hash` | `redacted-query-hash` |

**Deliberately NOT redacted** (owner scope decision): platform names, event
domains, the organizer's public repo handle, the Instagram post id, and
placeholder `FLAG{...}` / `CTF{...}` prose with no real secret material.
If the owner wants any of these gone too, extend `UUIDS` / `IG_HASH` /
`FLAG_RE` and add matching `MIN_HITS` entries — the kit stays fail-closed.

## Fail-closed contract

Before redaction, every file must match ground truth measured 2026-10-26,
or the kit exits 1 and touches nothing:

- exact byte size (`dpo-combined.json` 1,576,251 · `dpo-expanded.json` 20,166 · `dpo.json` 3,439)
- valid JSON, exact row count (1,672 / 35 / 14)
- minimum per-pattern hit counts (flags ≥10 / ≥9 / 0; UUIDs ≥2 / ≥2 / 0; hash ≥1 / ≥1 / 0)

After redaction: zero remaining matches, JSON still parses, row counts
unchanged, byte delta equals the computed replacement delta.

## Usage

```bash
pip install huggingface_hub          # only needed for --push
python3 redact_v7_flag.py --fetch --out-dir ./redacted   # download + verify + write .redacted
python3 redact_v7_flag.py --push                          # upload (HF_TOKEN or prompt)
```

`--fetch` uses public resolve URLs (no token). Default is a dry run: it
writes `<file>.redacted` copies and uploads nothing. `--push` uploads the
`.redacted` files over the originals via `huggingface_hub`.

## Owner notes

- **License stays undecided until v2 has run green.** Publishing a license
  for a corpus that still carries live literals would be a mistake; decide
  after the redacted files are live.
- **Git history still carries the flags.** This kit patches file contents
  only; the dataset repo's commit history retains pre-redaction blobs. If
  history scrubbing is required, that is a separate owner decision
  (fresh-repo re-upload or HF support).
- The dataset card's honesty notes (superseded-by-v2, license pinned)
  ship separately through the estate deploy scripts.

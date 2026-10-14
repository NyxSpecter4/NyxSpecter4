#!/usr/bin/env python3
"""
fold-dpo-batches.py — Monday HF day fold step.

Folds the dated DPO batch files (dpo-v3-pr-review-pairs*.jsonl, on branch `main`)
into the canonical HF dataset nyxspecter4/kin-cyber-dpo-v2:

  1. Downloads (or reads) canonical dpo.jsonl + sft.jsonl + README.md.
  2. Prompt-hash dedup per monday-mining-dedup.py logic:
     sha256[:16] over canonicalized prompt JSON, plus raw-string match.
  3. Appends unique pairs to dpo.jsonl  (schema {prompt, chosen, rejected, metadata?} — preserved as-is).
  4. Appends {prompt, response: chosen} rows to sft.jsonl  (canonical live schema — preserved).
  5. Updates the README "Total DPO Pairs" line.
  6. Prints a full receipt. Idempotent: a re-run folds 0 pairs.

This script never invents content and never drops existing rows — append-only.

2026-10-10 FIX (critical): dated v3 batch pairs carry STRUCTURED prompts
{task, input_type, artifact} (per DPO-V3-EXPANSION-PLAN.md), but the canonical
dataset's prompt column is a plain string (verified live: dtype string; and
prepare_kin_data.py does prompt + " " + chosen). The old valid_pair() required
isinstance(prompt, str), so EVERY v3 pair was rejected as invalid — the fold
would have appended 0 pairs and reported success (silent no-op). Now:
  - valid_pair() accepts string prompts AND structured {task, artifact} prompts.
  - Structured prompts are serialized to task + blank line + artifact on
    append, so dpo.jsonl and sft.jsonl keep the canonical string schema.
  - input_type is preserved in the row's metadata (added, never overwritten).
  - Dedup still runs on the ORIGINAL prompt value (object or string).

Usage:
  python3 fold-dpo-batches.py --batches DIR --canonical DIR [--dry-run]
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date

DATE_TODAY = date.today().isoformat()

TASK_ARTIFACT_SEP = "\n\n"


def prompt_hashes(prompt):
    """Both dedup keys: canonicalized-JSON hash (mining standard) + raw string."""
    raw = prompt if isinstance(prompt, str) else json.dumps(prompt, ensure_ascii=False)
    canon = json.dumps(prompt, sort_keys=True, ensure_ascii=False)
    h = hashlib.sha256(canon.encode("utf-8")).hexdigest()[:16]
    return h, raw


def serialize_prompt(prompt):
    """Map a batch prompt to the canonical string-prompt schema.

    String prompts pass through (must be non-empty). Structured v3 prompts
    {task, input_type, artifact} serialize to task + TASK_ARTIFACT_SEP +
    artifact — the user message the translator model should see. Anything
    else -> None (invalid).
    """
    if isinstance(prompt, str):
        return prompt if prompt.strip() else None
    if isinstance(prompt, dict):
        task = prompt.get("task")
        artifact = prompt.get("artifact")
        if (isinstance(task, str) and task.strip()
                and isinstance(artifact, str) and artifact.strip()):
            return task.strip() + TASK_ARTIFACT_SEP + artifact
    return None


def load_jsonl(path):
    rows = []
    bad = 0
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                bad += 1
    return rows, bad


def valid_pair(row):
    return (
        isinstance(row, dict)
        and serialize_prompt(row.get("prompt")) is not None
        and isinstance(row.get("chosen"), str) and row["chosen"].strip()
        and isinstance(row.get("rejected"), str) and row["rejected"].strip()
    )


def canonical_row(row):
    """Batch row -> canonical dpo.jsonl row (string prompt, metadata enriched)."""
    out = dict(row)
    src_prompt = out.get("prompt")
    out["prompt"] = serialize_prompt(src_prompt)
    if isinstance(src_prompt, dict):
        meta = out.get("metadata")
        meta = dict(meta) if isinstance(meta, dict) else {}
        input_type = src_prompt.get("input_type")
        if isinstance(input_type, str) and input_type:
            meta["input_type"] = input_type
        out["metadata"] = meta
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batches", required=True, help="dir containing dpo-v3-pr-review-pairs*.jsonl")
    ap.add_argument("--canonical", required=True, help="dir containing canonical dpo.jsonl/sft.jsonl/README.md")
    ap.add_argument("--out", default=None, help="dir to write merged files (default: canonical dir)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out_dir = args.out or args.canonical
    dpo_path = os.path.join(args.canonical, "dpo.jsonl")
    sft_path = os.path.join(args.canonical, "sft.jsonl")
    readme_path = os.path.join(args.canonical, "README.md")

    canon_rows, canon_bad = load_jsonl(dpo_path)
    canon_keys = set()
    for r in canon_rows:
        h, raw = prompt_hashes(r.get("prompt", ""))
        canon_keys.add(h)
        canon_keys.add(raw)

    print(f"[fold] canonical dpo.jsonl: {len(canon_rows)} rows ({canon_bad} unparseable skipped)")

    # sft rows keyed by prompt for append-dedup too
    sft_rows, sft_bad = load_jsonl(sft_path) if os.path.exists(sft_path) else ([], 0)
    sft_keys = set()
    for r in sft_rows:
        if isinstance(r, dict) and isinstance(r.get("prompt"), str):
            h, raw = prompt_hashes(r["prompt"])
            sft_keys.add(h)
            sft_keys.add(raw)
    print(f"[fold] canonical sft.jsonl: {len(sft_rows)} rows ({sft_bad} unparseable skipped)")

    batch_files = sorted(
        f for f in os.listdir(args.batches)
        if f.startswith("dpo-v3-pr-review-pairs") and f.endswith(".jsonl")
    )
    print(f"[fold] batch files found: {batch_files}")

    uniques = []
    seen_in_batches = set()
    receipt = []
    for bf in batch_files:
        rows, bad = load_jsonl(os.path.join(args.batches, bf))
        u, dups, invalid = 0, 0, 0
        for r in rows:
            if not valid_pair(r):
                invalid += 1
                continue
            h, raw = prompt_hashes(r["prompt"])
            if h in canon_keys or raw in canon_keys or h in seen_in_batches or raw in seen_in_batches:
                dups += 1
                continue
            seen_in_batches.add(h)
            seen_in_batches.add(raw)
            uniques.append(r)
            u += 1
        receipt.append((bf, len(rows), u, dups, invalid, bad))
        print(f"[fold] {bf}: {len(rows)} rows -> {u} unique / {dups} dup / {invalid} invalid")

    print(f"[fold] TOTAL UNIQUE NEW PAIRS: {len(uniques)}")
    for bf, n, u, d, iv, b in receipt:
        print(f"[fold]   {bf}: rows={n} unique={u} dup={d} invalid={iv} bad_json={b}")
    print("[fold] structured v3 prompts are serialized to task + blank line + artifact on append; input_type is preserved in metadata")

    if args.dry_run:
        print("[fold] DRY RUN — no files written.")
        print(f"[fold] Projected new total: {len(canon_rows) + len(uniques)} pairs.")
        return 0 if uniques or not receipt else 1

    if uniques:
        with open(dpo_path, "a", encoding="utf-8") as f:
            for r in uniques:
                f.write(json.dumps(canonical_row(r), ensure_ascii=False) + "\n")
        print(f"[fold] appended {len(uniques)} pairs to dpo.jsonl (canonical string-prompt schema)")

        if os.path.exists(sft_path):
            appended_sft = 0
            with open(sft_path, "a", encoding="utf-8") as f:
                for r in uniques:
                    h, raw = prompt_hashes(r["prompt"])
                    if h in sft_keys or raw in sft_keys:
                        continue
                    f.write(json.dumps(
                        {"prompt": serialize_prompt(r["prompt"]), "response": r["chosen"]},
                        ensure_ascii=False
                    ) + "\n")
                    appended_sft += 1
            print(f"[fold] appended {appended_sft} rows to sft.jsonl (canonical prompt/response schema preserved)")
    else:
        print("[fold] nothing to fold — dpo.jsonl/sft.jsonl untouched (idempotent re-run)")

    # README count line — update only if the pattern exists; never fail on it
    new_total = len(canon_rows) + len(uniques)
    if os.path.exists(readme_path):
        readme = open(readme_path, "r", encoding="utf-8").read()
        pattern = r"(Total DPO Pairs:\s*)([\d,]+)(\s*\(Updated\s*[\d-]+\))"
        if re.search(pattern, readme):
            readme = re.sub(
                pattern,
                lambda m: m.group(1) + f"{new_total:,}" + m.group(3).replace(
                    re.search(r"Updated\s*([\d-]+)", m.group(3)).group(1), DATE_TODAY
                ),
                readme,
                count=1,
            )
            open(readme_path, "w", encoding="utf-8").write(readme)
            print(f"[fold] README updated: Total DPO Pairs -> {new_total:,} ({DATE_TODAY})")
        else:
            print("[fold] WARNING: README 'Total DPO Pairs' pattern not found — README left untouched")

    print(f"[fold] RECEIPT — new canonical total: {new_total:,} pairs | sft rows: {len(sft_rows) + (len(uniques) if uniques else 0)}")
    threshold_met = len(uniques) >= 100
    print(f"[fold] retrain threshold (100 new pairs since last retrain): {'MET — trigger KIN v2 retrain' if threshold_met else 'not met'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

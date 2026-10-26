#!/usr/bin/env python3
"""Redact literal flag values + event identifiers from the v7 doctrine dataset. v2.

Repo: nyxspecter4/kinetigor-dpo-cybersec-v7-dataset (public).

v2 (2026-10-26) SUPERSEDES v1. The v1 kit redacted exactly one literal
("NullOriginCTF{florian_pepellin}") because its scan only matched CTF{...}
shaped strings and missed the Null0rigin{...} family. The corrected scan
(adversarial audit, 2026-10-26) measured ~10 distinct literal flag values
across the corpus, plus two Supabase challengeId UUIDs and one Instagram
GraphQL query_hash. v2 redacts the whole family and is fail-closed on
ground truth measured before any write.

Redaction map (owner-ratified 2026-10-26):
  1. Null0rigin{...} / NullOriginCTF{...} literals -> Null0rigin{redacted}
  2. Supabase challengeId UUIDs (2)                -> challenge-redacted
  3. Instagram GraphQL query_hash (1)              -> redacted-query-hash

Deliberately NOT redacted (owner scope decision, see README.md):
platform names, event domains, the organizer's public repo handle, the
Instagram post id, and placeholder FLAG{...} / CTF{...} prose that carries
no real secret material.

Fail-closed contract: exact byte sizes, JSON parse, exact row counts and
minimum per-pattern hit counts are asserted on every file BEFORE redaction;
zero remaining matches, unchanged row counts and byte-delta consistency are
asserted AFTER. Exit code 1 on any failure; nothing is written or uploaded
unless every check passes.

Usage:
  python3 redact_v7_flag.py --fetch --out-dir ./redacted   # download + verify + write .redacted
  python3 redact_v7_flag.py --push                          # upload the redacted files (HF_TOKEN or prompt)
"""

import argparse
import json
import os
import re
import sys
import urllib.request

REPO = "nyxspecter4/kinetigor-dpo-cybersec-v7-dataset"
REPO_URL = "https://huggingface.co/datasets/" + REPO + "/resolve/main/"

# Ground truth measured 2026-10-26 (adversarial audit, live downloads).
FILES = {
    "train/dpo-combined.json": {"bytes": 1576251, "rows": 1672},
    "train/dpo-expanded.json": {"bytes": 20166, "rows": 35},
    "train/dpo.json": {"bytes": 3439, "rows": 14},
}

FLAG_RE = re.compile(r"Null(?:0rigin|OriginCTF)\{[^{}]{1,200}\}")
FLAG_SUB = "Null0rigin{redacted}"
UUIDS = [
    "5c069ff7-ccc0-41b5-b790-a75d24b6dd3e",
    "f45dd57e-a9cc-4cea-ad66-8d4906009d95",
]
UUID_SUB = "challenge-redacted"
IG_HASH = "97b41c52301f77ce508f55e66d17620e"
HASH_SUB = "redacted-query-hash"

# Minimum expected hits per file BEFORE redaction (fail-closed if fewer).
# dpo.json measured clean: 0 hits expected (defensive redaction still runs).
MIN_HITS = {
    "train/dpo-combined.json": {"flags": 10, "uuids": 2, "hash": 1},
    "train/dpo-expanded.json": {"flags": 9, "uuids": 2, "hash": 1},
    "train/dpo.json": {"flags": 0, "uuids": 0, "hash": 0},
}


def die(msg):
    print("FAIL: " + msg)
    sys.exit(1)


def fetch(path, out_dir):
    url = REPO_URL + path
    dest = os.path.join(out_dir, path.replace("/", "__"))
    print("  download " + url)
    with urllib.request.urlopen(url) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def redact(text, path):
    """Verify ground truth, then redact. Returns (patched_text, report)."""
    spec = FILES[path]
    want_bytes = spec["bytes"]
    want_rows = spec["rows"]
    n_bytes = len(text.encode("utf-8"))
    if n_bytes != want_bytes:
        die(path + ": byte size " + str(n_bytes) + " != expected " + str(want_bytes))
    try:
        rows = json.loads(text)
    except ValueError as e:
        die(path + ": does not parse as JSON: " + str(e))
    if not isinstance(rows, list) or len(rows) != want_rows:
        found = len(rows) if isinstance(rows, list) else "not-a-list"
        die(path + ": row count " + str(found) + " != expected " + str(want_rows))

    flag_hits = list(FLAG_RE.finditer(text))
    uuid_hits = {u: text.count(u) for u in UUIDS}
    hash_hits = text.count(IG_HASH)

    mins = MIN_HITS[path]
    if len(flag_hits) < mins["flags"]:
        die(path + ": expected at least " + str(mins["flags"]) + " flag literals, found " + str(len(flag_hits)))
    if sum(uuid_hits.values()) < mins["uuids"]:
        die(path + ": expected at least " + str(mins["uuids"]) + " challenge UUIDs, found " + str(sum(uuid_hits.values())))
    if hash_hits < mins["hash"]:
        die(path + ": expected at least " + str(mins["hash"]) + " IG query hash, found " + str(hash_hits))

    expected_delta = sum(len(m.group(0)) - len(FLAG_SUB) for m in flag_hits)
    patched = FLAG_RE.sub(FLAG_SUB, text)
    for u in UUIDS:
        expected_delta += uuid_hits[u] * (len(u) - len(UUID_SUB))
        patched = patched.replace(u, UUID_SUB)
    expected_delta += hash_hits * (len(IG_HASH) - len(HASH_SUB))
    patched = patched.replace(IG_HASH, HASH_SUB)

    # Post-redaction invariants.
    if FLAG_RE.search(patched):
        die(path + ": flag literal still present after redaction")
    for u in UUIDS:
        if u in patched:
            die(path + ": challenge UUID still present after redaction")
    if IG_HASH in patched:
        die(path + ": IG query hash still present after redaction")
    actual_delta = len(text.encode("utf-8")) - len(patched.encode("utf-8"))
    if actual_delta != expected_delta:
        die(path + ": byte delta " + str(actual_delta) + " != computed " + str(expected_delta))
    try:
        after_rows = json.loads(patched)
    except ValueError as e:
        die(path + ": redacted text does not parse as JSON: " + str(e))
    if len(after_rows) != want_rows:
        die(path + ": row count changed after redaction: " + str(len(after_rows)) + " != " + str(want_rows))

    report = {
        "file": path,
        "flags_redacted": len(flag_hits),
        "uuids_redacted": sum(uuid_hits.values()),
        "hash_redacted": hash_hits,
        "bytes_before": want_bytes,
        "bytes_after": len(patched.encode("utf-8")),
    }
    return patched, report


def main():
    ap = argparse.ArgumentParser(description="v2 family-wide redaction kit for the v7 doctrine dataset (fail-closed).")
    ap.add_argument("--fetch", action="store_true", help="download the dataset files from the Hub")
    ap.add_argument("--push", action="store_true", help="upload the redacted files back to the dataset")
    ap.add_argument("--out-dir", default="./redacted", help="where downloads and .redacted files land (default ./redacted)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    local = {}
    for path in FILES:
        dest = os.path.join(args.out_dir, path.replace("/", "__"))
        if args.fetch or not os.path.exists(dest):
            local[path] = fetch(path, args.out_dir)
        else:
            local[path] = dest

    reports = []
    for path in FILES:
        print("\n[verify+redact] " + path)
        with open(local[path], encoding="utf-8") as f:
            text = f.read()
        patched, report = redact(text, path)
        reports.append(report)
        out_path = local[path] + ".redacted"
        with open(out_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(patched)
        print("  OK   wrote " + out_path + "  " + json.dumps(report))

    print("\nSummary:")
    for r in reports:
        print("  " + r["file"] + ": " + str(r["flags_redacted"]) + " flags, "
              + str(r["uuids_redacted"]) + " UUIDs, " + str(r["hash_redacted"]) + " hash redacted; "
              + str(r["bytes_before"]) + " -> " + str(r["bytes_after"]) + " bytes")

    if args.push:
        try:
            from huggingface_hub import HfApi
        except ImportError:
            die("huggingface_hub not installed: pip install huggingface_hub")
        token = os.environ.get("HF_TOKEN") or os.environ.get("HF_WRITE_TOKEN")
        if not token:
            import getpass
            token = getpass.getpass("HF write token (input hidden): ").strip()
        if not token:
            die("no token provided")
        api = HfApi(token=token)
        who = api.whoami()
        print("Token OK. Logged in as: " + str(who.get("name", "unknown")))
        for path in FILES:
            src = local[path] + ".redacted"
            res = api.upload_file(path_or_fileobj=src, path_in_repo=path, repo_id=REPO, repo_type="dataset")
            print("  PUSHED " + path + " -> " + str(res))
    else:
        print("\nDry run complete (no upload). Re-run with --push to upload the .redacted files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Redact the single literal CTF flag from the v7 doctrine dataset.

Repo: nyxspecter4/kinetigor-dpo-cybersec-v7-dataset (public).

Context (full-corpus scan, 2026-10-26): the dataset card warns it contains
"real challenge flags and program slugs from closed events". The scan found
exactly ONE literal flag value in the whole corpus, and the "program slugs"
are platform names (huntr, Monk, HackerOne, Bugcrowd, TryHackMe, HackTheBox)
in doctrine prose — not client identifiers, not real submission IDs, no
third-party confidential data. Every other flag-like string is placeholder
prose (FLAG{...} / CTF{...}).

This script is FAIL-CLOSED: it refuses to write anything unless every
precondition holds. Default mode is a local dry run.

Usage:
  # 1) fetch + verify + write patched copies locally (no HF writes)
  python3 redact_v7_flag.py --fetch --out-dir ./redacted

  # 2) after eyeballing the two .redacted files, push to HF (needs write token)
  python3 redact_v7_flag.py --fetch --push   # token via HF_TOKEN or getpass

The two files are otherwise byte-identical to what ships on the Hub; only the
flag string changes. Post-conditions are re-verified before any upload.
"""

import argparse
import json
import os
import sys
import urllib.request

REPO_ID = "nyxspecter4/kinetigor-dpo-cybersec-v7-dataset"
BASE_URL = "https://huggingface.co/datasets/%s/resolve/main/" % REPO_ID

# Ground truth from the 2026-10-26 scan. If any assert fires, the remote file
# changed — re-scan, do not force.
FILES = {
    "train/dpo-combined.json": {"size": 1576251, "rows": 1672},
    "train/dpo-expanded.json": {"size": 20166, "rows": 35},
}
FLAG = "CTF{florian_pepellin}"
REPLACEMENT = "CTF{redacted}"


def die(msg):
    print("FAIL: " + msg)
    sys.exit(1)


def fetch(name):
    url = BASE_URL + name
    req = urllib.request.Request(url, headers={"User-Agent": "kin-v7-redaction-kit"})
    with urllib.request.urlopen(req) as r:
        return r.read()


def load_local(name):
    with open(name, "rb") as f:
        return f.read()


def patch(name, raw):
    spec = FILES[name]
    if len(raw) != spec["size"]:
        die("%s: expected %d bytes, got %d — remote file changed since the "
            "scan. Re-scan before patching." % (name, spec["size"], len(raw)))
    text = raw.decode("utf-8")
    n = text.count(FLAG)
    if n != 1:
        die("%s: expected exactly 1 occurrence of the flag, found %d "
            "(0 => already redacted; >1 => update the scan ground truth)"
            % (name, n))
    try:
        rows = json.loads(text)
    except Exception as e:
        die("%s: JSON parse error before patch: %s" % (name, e))
    if not isinstance(rows, list) or len(rows) != spec["rows"]:
        die("%s: expected a JSON array of %d rows, got %s"
            % (name, spec["rows"], type(rows).__name__ if not isinstance(rows, list) else len(rows)))

    patched = text.replace(FLAG, REPLACEMENT)

    # Post-conditions: same rows, exact byte delta, no flag left.
    prows = json.loads(patched)  # raises on corruption
    if len(prows) != spec["rows"]:
        die("%s: patched row count changed (%d -> %d)" % (name, spec["rows"], len(prows)))
    expected_delta = len(FLAG.encode()) - len(REPLACEMENT.encode())
    actual_delta = len(raw) - len(patched.encode())
    if actual_delta != expected_delta:
        die("%s: byte delta %d != expected %d — refusing to write"
            % (name, actual_delta, expected_delta))
    if FLAG in patched:
        die("%s: flag still present after patch" % name)
    return patched.encode()


def push(name, local_path, token):
    try:
        from huggingface_hub import HfApi
    except ImportError:
        die("--push needs huggingface_hub (pip install huggingface_hub)")
    api = HfApi(token=token)
    api.upload_file(
        path_or_fileobj=local_path,
        path_in_repo=name,
        repo_id=REPO_ID,
        repo_type="dataset",
        commit_message="Redact the single literal closed-event flag "
                       "(CTF{...} -> CTF{redacted}); corpus byte-identical otherwise "
                       "(rows + sizes verified by kin-v7-flag-redaction kit)",
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fetch", action="store_true",
                    help="download the two files from the Hub (public, no token needed)")
    ap.add_argument("--push", action="store_true",
                    help="upload the patched files (requires HF write token)")
    ap.add_argument("--out-dir", default="redacted",
                    help="where to write the patched copies (default: ./redacted)")
    ap.add_argument("--input-dir", default=None,
                    help="use pre-downloaded files from this dir instead of --fetch")
    args = ap.parse_args()

    if args.push and not args.fetch and not args.input_dir:
        die("--push needs a source: use --fetch or --input-dir")

    os.makedirs(args.out_dir, exist_ok=True)
    patched_paths = {}
    for name in FILES:
        if args.input_dir:
            raw = load_local(os.path.join(args.input_dir, os.path.basename(name)))
        elif args.fetch:
            raw = fetch(name)
        else:
            die("nothing to do: pass --fetch (or --input-dir)")
        patched = patch(name, raw)
        out = os.path.join(args.out_dir, os.path.basename(name) + ".redacted")
        with open(out, "wb") as f:
            f.write(patched)
        patched_paths[name] = out
        print("OK  %s  %d -> %d bytes, %d rows, flag replaced"
              % (name, len(raw), len(patched), FILES[name]["rows"]))

    if not args.push:
        print("\nDry run complete. Patched copies are in %s — inspect them, "
              "then re-run with --push to upload." % args.out_dir)
        return

    token = os.environ.get("HF_TOKEN") or os.environ.get("HF_WRITE_TOKEN")
    if not token:
        import getpass
        token = getpass.getpass("HF write token: ")
    for name, path in patched_paths.items():
        push(name, path, token)
        print("PUSHED  %s" % name)
    print("\nDone. Remaining owner step: add `license: mit` to the dataset "
          "card frontmatter (or decide otherwise). Note: the old flag value "
          "remains in the repo's git history — see kit README.")


if __name__ == "__main__":
    main()

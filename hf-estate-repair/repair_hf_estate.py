#!/usr/bin/env python3
"""
HF ESTATE REPAIR — one-command pusher for the Oct 26 adversarial-audit fixes.

Fixes shipped by this kit (all staged from live, verified artifacts):
  P0  bountywarz-gateway Space  — repaired README (sdk: docker front-matter),
      one-file Dockerfile (no private-repo clone), server.cjs v1.1.0.
  P1  kin-cybersec demo Space   — the staged 15,410 B scenario-aware demo
      (verification-translator persona, five-field briefs, replayable-check
      gate, three altitudes, seal) + its README + requirements.
  P2  kin-cybersecurity-3b      — card hygiene (leaked deploy-trigger comment
      stripped), gguf_manifest (unbacked zero_leak_verified claim removed,
      rename history explained instead of hidden), GGUF_PROGRESS.md dead
      repo id fixed.
  P2  kin-cybersecurity-3b-gguf — quickstart filename fixed to the real
      repo file (kin-sft-lora-Q4_K_M.gguf), pair counts corrected.
  P3  kin-cyber-dpo-v2           — release-closure-receipt.json documented
      in the card's files table.

Discipline: DRY-RUN BY DEFAULT. Nothing is written unless --push is passed.
Fail-closed preflight: every file must exist, be non-empty, and parse if
JSON. Token via HF_TOKEN env or interactive prompt (never stored).
"""
import argparse
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent / "files"

# (repo_type, repo_id, [files]) — files live under files/<repo_type>s/<repo_name>/
TARGETS = [
    ("space", "nyxspecter4/bountywarz-gateway", ["README.md", "Dockerfile", "server.cjs"]),
    ("space", "nyxspecter4/kin-cybersec", ["README.md", "app.py", "requirements.txt"]),
    ("model", "nyxspecter4/kin-cybersecurity-3b", ["README.md", "gguf_manifest.json", "GGUF_PROGRESS.md"]),
    ("model", "nyxspecter4/kin-cybersecurity-3b-gguf", ["README.md"]),
    ("dataset", "nyxspecter4/kin-cyber-dpo-v2", ["README.md"]),
]


def preflight() -> int:
    """Verify every staged file exists and is sane. Returns total bytes."""
    total = 0
    problems = []
    for repo_type, repo_id, names in TARGETS:
        repo_dir = BASE / (repo_type + "s") / repo_id.split("/")[-1]
        for name in names:
            p = repo_dir / name
            if not p.is_file():
                problems.append(f"MISSING: {p}")
                continue
            data = p.read_bytes()
            if len(data) == 0:
                problems.append(f"EMPTY: {p}")
                continue
            if name.endswith(".json"):
                try:
                    json.loads(data.decode("utf-8"))
                except Exception as e:
                    problems.append(f"BAD JSON: {p}: {e}")
                    continue
            total += len(data)
            print(f"  ok  {repo_id}/{name}  {len(data)} bytes")
    if problems:
        print("\n".join("  FAIL " + x for x in problems))
        sys.exit("PREFLIGHT FAILED — nothing pushed.")
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="Push the staged HF estate repairs.")
    ap.add_argument("--push", action="store_true", help="actually upload (default: dry-run)")
    args = ap.parse_args()

    print("== HF ESTATE REPAIR PREFLIGHT ==")
    total = preflight()
    print(f"== {total} bytes staged across {sum(len(t[2]) for t in TARGETS)} files ==")

    if not args.push:
        print("DRY RUN — no writes. Pass --push with a write-scoped HF token to ship.")
        return

    try:
        from huggingface_hub import HfApi
    except ImportError:
        sys.exit("huggingface_hub not installed: pip install huggingface_hub")

    import os
    token = os.environ.get("HF_TOKEN")
    if not token:
        import getpass
        token = getpass.getpass("HF write token: ")

    api = HfApi(token=token)
    try:
        who = api.whoami()
        name = who.get("name", "?")
        auth = who.get("auth", {})
        print(f"authenticated as: {name}")
    except Exception as e:
        sys.exit(f"whoami failed: {e}")

    for repo_type, repo_id, names in TARGETS:
        repo_dir = BASE / (repo_type + "s") / repo_id.split("/")[-1]
        for name in names:
            p = repo_dir / name
            res = api.upload_file(
                path_or_fileobj=str(p),
                path_in_repo=name,
                repo_id=repo_id,
                repo_type=repo_type,
                commit_message=f"repair: {name} (Oct 26 adversarial-audit fix)",
            )
            print(f"  pushed {repo_id}/{name} -> {res}")

    print("DONE. Post-push checks:")
    print("  * gateway Space: runtime should leave CONFIG_ERROR after build")
    print("  * demo Space: app.py should show the five-field translator demo")
    print("  * model card: no deploy-trigger comment; manifest honesty_note present")
    print("  * gguf card: quickstart filename = kin-sft-lora-Q4_K_M.gguf")


if __name__ == "__main__":
    main()

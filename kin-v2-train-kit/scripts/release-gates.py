#!/usr/bin/env python3
"""
release-gates.py — Athelgard release gates for the KIN HF estate.

Implements the claim-discipline standard: every release artifact is treated as
UNPROVEN until independently reproduced. This script performs that reproduction
ANONYMOUSLY (no token, no auth) against the live Hugging Face repo, exactly the
way a stranger would, and emits a machine-checkable verdict:

  Gate 1  ARTIFACT INTEGRITY    artifact -> sha256 -> receipt -> anonymous
         download -> sha256 again -> compare. PASS = byte identity demonstrated.
  Gate 2  DATASET CONSERVATION  input == kept + quarantine; every kept row has
         a receipt; every quarantined row has a rejection reason.
  Gate 3  VERIFICATION SEMANTICS  explicit census: provenance / verified /
         malformed / missing-receipt; the receipt's row_sha256 is RECOMPUTED
         per row from the exact stamp-receipts.py formula (the cryptographic
         link is checked, not trusted); stage 'verified' is only legal where
         verified_by actually exists; the gate verdict is re-evaluated per row.

  Gate 4  MODEL EVALUATION — out of scope here (needs GPU). Any inherited
         benchmark number is reported by this tool as CLAIMED, never VERIFIED.

Verdicts: PASS | FAIL | UNPROVEN  (maps to the platform STATUS-CLAIM PROTOCOL:
VERIFIED / MISSING / CLAIMED). No vibes, no rank extrapolations, no marketing
renaming of provenance as verified.

Usage:
  python3 release-gates.py --repo nyxspecter4/kin-cyber-dpo-v2 [--out gates-receipt.json]

Exit codes: 0 = all gates PASS, 1 = any FAIL, 2 = UNPROVEN (artifacts absent).
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

BASE = "https://huggingface.co"
# Gate constants — VERBATIM from kin-deploy/stamp-receipts.py (blob daa1b185)
GATE_VERSION = "cyber-signals-v1"
STAMPER = "stamp-receipts.py v1"
INTERNAL = ["athelgard","hunt-harbor","cryptnoir","bountywarz","protocolbreach","makothoth",
            "anchor_intro","panel_voice","anchor_synthesis","sign_off","fitness landscape"]
CYBER = ["CVE-","XSS","SQL injection","buffer overflow","RCE","MFA","EDR","SIEM","phishing",
         "ransomware","malware","exploit","vulnerability","OWASP","CWE","zero-day","MITRE",
         "ATT&CK","Sigma","YARA","DFIR","SOC","CrowdStrike","Splunk","log4shell","solarwinds",
         "colonial pipeline","mgm","Kubernetes","Docker","IAM","OAuth","SAML","zero trust"]


def matched_signals(text):
    tl = text.lower()
    return [k for k in CYBER if k.lower() in tl]


def row_sha256(row):
    """Exact stamp-receipts.py identity hash (canonicalized pair content)."""
    canon = json.dumps(
        {"prompt": row.get("prompt"), "chosen": row.get("chosen"), "rejected": row.get("rejected")},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()[:16]


def gate_verdict(row):
    """Exact stamp-receipts.py gate: None if kept, reason string if purged."""
    prompt = row.get("prompt") or ""
    chosen = row.get("chosen") or ""
    if not (isinstance(prompt, str) and isinstance(chosen, str)):
        return "malformed-row"
    combined = prompt + " " + chosen
    tl = combined.lower()
    if sum(1 for k in INTERNAL if k.lower() in tl) >= 2:
        return "internal-content"
    if len(matched_signals(combined)) < 2:
        return "insufficient-cyber-signals"
    return None


def fetch(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "release-gates/1 (anonymous)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_jsonl(path):
    rows, bad = [], 0
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="HF dataset repo id (owner/name)")
    ap.add_argument("--out", default="gates-receipt.json")
    ap.add_argument("--workdir", default=None)
    args = ap.parse_args()
    wd = args.workdir or "gates-work"
    os.makedirs(wd, exist_ok=True)

    run_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    artifacts = {}
    try:
        for fname in ("dpo.jsonl", "quarantine.jsonl", "stamp-receipt.json"):
            size = fetch(f"{BASE}/datasets/{args.repo}/resolve/main/{fname}", os.path.join(wd, fname))
            artifacts[fname] = {"bytes": size, "http": "OK"}
    except Exception as e:
        receipt = {"tool": "release-gates.py v1", "run_at": run_at, "repo": args.repo,
                   "mode": "anonymous", "verdict": "UNPROVEN",
                   "reason": f"artifact acquisition failed: {e}"}
        open(args.out, "w", encoding="utf-8").write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 2

    stamp = json.load(open(os.path.join(wd, "stamp-receipt.json"), encoding="utf-8"))

    # ---------------- Gate 1: artifact integrity ----------------
    g1 = {
        "dpo_sha256_expected": stamp.get("output_sha256"),
        "dpo_sha256_found": sha256_file(os.path.join(wd, "dpo.jsonl")),
        "quarantine_sha256_expected": stamp.get("quarantine_sha256"),
        "quarantine_sha256_found": sha256_file(os.path.join(wd, "quarantine.jsonl")),
    }
    g1["byte_identity"] = (g1["dpo_sha256_expected"] == g1["dpo_sha256_found"]
                           and g1["quarantine_sha256_expected"] == g1["quarantine_sha256_found"])
    gate1 = "PASS" if g1["byte_identity"] else "FAIL"

    # ---------------- Gate 2: dataset conservation ----------------
    kept_rows, kept_bad = load_jsonl(os.path.join(wd, "dpo.jsonl"))
    q_rows, q_bad = load_jsonl(os.path.join(wd, "quarantine.jsonl"))
    kept_no_receipt = sum(1 for r in kept_rows
                          if not isinstance(r.get("metadata"), dict)
                          or not isinstance(r["metadata"].get("receipt"), dict))
    q_no_reason = sum(1 for r in q_rows if "purge_reason" not in r)
    g2 = {
        "receipt_input_rows": stamp.get("input_rows"),
        "receipt_kept": stamp.get("kept"),
        "receipt_purged": stamp.get("purged"),
        "rows_kept_found": len(kept_rows),
        "rows_quarantine_found": len(q_rows),
        "conservation_input_eq_kept_plus_purged": stamp.get("conservation"),
        "conservation_recomputed": len(kept_rows) + len(q_rows) == stamp.get("input_rows"),
        "unparseable_lines": {"kept": kept_bad, "quarantine": q_bad},
        "kept_rows_missing_receipt": kept_no_receipt,
        "quarantine_rows_missing_reason": q_no_reason,
    }
    gate2 = "PASS" if (
        g2["conservation_input_eq_kept_plus_purged"] and g2["conservation_recomputed"]
        and stamp.get("kept") == len(kept_rows) and stamp.get("purged") == len(q_rows)
        and kept_no_receipt == 0 and q_no_reason == 0 and kept_bad == 0 and q_bad == 0
    ) else "FAIL"

    # ---------------- Gate 3: verification semantics ----------------
    stages, link_fail, verified_without_verified_by, stage_mismatch = {}, 0, 0, 0
    gate_mismatch, signals_mismatch, malformed = 0, 0, 0
    for r in kept_rows:
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        rec = meta.get("receipt") if isinstance(meta.get("receipt"), dict) else {}
        st = rec.get("stage", "none")
        stages[st] = stages.get(st, 0) + 1
        if not (isinstance(r.get("prompt"), str) and isinstance(r.get("chosen"), str)
                and isinstance(r.get("rejected"), str) and r["chosen"].strip() and r["rejected"].strip()):
            malformed += 1
            continue
        if rec.get("row_sha256") != row_sha256(r):
            link_fail += 1
        has_vb = bool(meta.get("verified_by"))
        if (st == "verified") != has_vb:
            stage_mismatch += 1
            if st == "verified":
                verified_without_verified_by += 1
        if rec.get("gate") != GATE_VERSION:
            gate_mismatch += 1
        if rec.get("signals") != matched_signals((r.get("prompt") or "") + " " + (r.get("chosen") or "")):
            signals_mismatch += 1
    # gate re-evaluation: every kept row must pass the gate, every quarantined row must fail it
    kept_should_be_gated = sum(1 for r in kept_rows if gate_verdict(r) is not None)
    q_reason_recheck = {}
    q_wrong_reason = 0
    for r in q_rows:
        reason = r.get("purge_reason")
        recomputed = gate_verdict(r)
        if reason != recomputed:
            q_wrong_reason += 1
        q_reason_recheck[reason] = q_reason_recheck.get(reason, 0) + 1
    reason_counts_match = all(stamp.get("purge_reasons", {}).get(k, 0) == v
                              for k, v in q_reason_recheck.items())
    g3 = {
        "stage_census": stages,
        "receipt_link_failures": link_fail,
        "stage_verified_without_verified_by": verified_without_verified_by,
        "stage_label_mismatches": stage_mismatch,
        "gate_version_mismatches": gate_mismatch,
        "signals_mismatches": signals_mismatch,
        "malformed_kept_rows": malformed,
        "kept_rows_failing_gate_recheck": kept_should_be_gated,
        "quarantine_reason_recomputed": q_reason_recheck,
        "quarantine_reason_mismatches": q_wrong_reason,
        "purge_reason_counts_match_receipt": reason_counts_match,
        "semantics_note": ("stage 'provenance' = process receipt, NOT content verification; "
                           "stage 'verified' requires verified_by on the row"),
    }
    gate3 = "PASS" if (link_fail == 0 and stage_mismatch == 0 and gate_mismatch == 0
                       and signals_mismatch == 0 and malformed == 0 and kept_should_be_gated == 0
                       and q_wrong_reason == 0 and reason_counts_match
                       and set(stages) <= {"provenance", "verified"}) else "FAIL"

    verdict = "PASS" if (gate1 == "PASS" and gate2 == "PASS" and gate3 == "PASS") else "FAIL"
    receipt = {
        "tool": "release-gates.py v1",
        "run_at": run_at,
        "repo": args.repo,
        "mode": "anonymous (no token)",
        "acquired": artifacts,
        "gate1_artifact_integrity": {"verdict": gate1, **g1},
        "gate2_dataset_conservation": {"verdict": gate2, **g2},
        "gate3_verification_semantics": {"verdict": gate3, **g3},
        "gate4_model_evaluation": {
            "status": "NOT_RUN (requires GPU harness)",
            "inherited_baseline_note": ("base Qwen/Qwen2.5-3B-Instruct 47/60 and KIN v1 40/60 "
                                        "(Oct 12 local run) are CLAIMED-inherited, NOT re-verified by this run; "
                                        "rerun before citing"),
        },
        "gate5_project_integration": {
            "status": "WIRED-PLAN",
            "note": ("gates feed the Athelgard release verdict: HF release -> anonymous acquisition "
                     "-> hash + contract verification -> evaluation world -> run -> score -> receipt -> "
                     "PASS | FAIL | UNPROVEN"),
        },
        "verdict": verdict,
    }
    open(args.out, "w", encoding="utf-8", newline="\n").write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())

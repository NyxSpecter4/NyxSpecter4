#!/usr/bin/env python3
"""
release-gates.py v2 — Athelgard release gates for the KIN HF estate.

Implements the claim-discipline standard: every release artifact is treated as
UNPROVEN until independently reproduced. This script performs that reproduction
ANONYMOUSLY (no token, no auth) against the live Hugging Face repo, exactly the
way a stranger would, and emits a machine-checkable verdict.

Gate architecture (v2 — receipt integrity is NOT semantic verification):

  Gate 1  ARTIFACT INTEGRITY      artifact -> sha256 -> stamp receipt ->
         anonymous download -> sha256 again -> compare. PASS = byte identity.
  Gate 2  RECEIPT INTEGRITY      every row's receipt hash is RECOMPUTED from
         the exact stamp-receipts.py formula (the cryptographic link is
         checked, not trusted); receipt fields, gate version, signals and
         stage labels are re-derived per row. This proves LINKAGE, not that
         the cybersecurity answers are correct.
  Gate 3  CONSERVATION           input == kept + quarantine; every kept row
         has a receipt; every quarantined row has a recomputed reason.
  Gate 4  CARD<->ARTIFACT PARITY (hard gate) the rendered card's claimed
         counts must equal the machine-derived counts; the card must pin the
         viewer's default config to the receipt-bearing dpo.jsonl; every data
         file present in the repo must be documented in the card's file
         table. A release whose files say one thing and whose public
         description says another CANNOT receive PASS.
  Gate 5  SEMANTIC VERIFICATION CENSUS  separate from receipt integrity:
         counts rows that carry actual semantic-verification evidence
         (verified_by on the row). The census is reported explicitly and is
         never inflated by provenance receipts.

  Gate 6  MODEL EVALUATION        out of scope here (needs GPU). Any inherited
         benchmark number is reported as CLAIMED, never VERIFIED.
  Gate 7  PROJECT INTEGRATION    wired plan (Athelgard release verdict chain).

Verdicts: PASS | FAIL | UNPROVEN  (maps to the platform STATUS-CLAIM PROTOCOL:
VERIFIED / CLAIMED / MISSING). No vibes, no rank extrapolations, no marketing
renaming of provenance as verified.

Usage:
  python3 release-gates.py --repo nyxspecter4/kin-cyber-dpo-v2 [--out gates-receipt.json]

Exit codes: 0 = all gates PASS, 1 = any FAIL, 2 = UNPROVEN (artifacts absent).
"""
import argparse
import hashlib
import json
import os
import re
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


def fetch_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "release-gates/2 (anonymous)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def fetch(url, dest):
    data = fetch_bytes(url)
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


def viewer_state(repo):
    """Live datasets-server state, recorded as evidence (re-index may lag)."""
    state = {}
    try:
        j = json.loads(fetch_bytes(
            f"https://datasets-server.huggingface.co/splits?dataset={repo}").decode())
        state["splits"] = [
            {"config": s.get("config"), "split": s.get("split")} for s in j.get("splits", [])
        ]
        state["pending"] = [p.get("config") for p in j.get("pending", [])]
    except Exception as e:
        state["splits_error"] = str(e)[:200]
    try:
        j = json.loads(fetch_bytes(
            f"https://datasets-server.huggingface.co/info?dataset={repo}").decode())
        state["configs"] = {
            cfg: {"features": list(v.get("features", {}).keys()),
                  "examples": {s: sv.get("num_examples")
                               for s, sv in v.get("splits", {}).items()}}
            for cfg, v in j.get("dataset_info", {}).items()
        }
    except Exception as e:
        state["info_error"] = str(e)[:200]
    return state


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
        for fname in ("dpo.jsonl", "quarantine.jsonl", "stamp-receipt.json", "README.md"):
            size = fetch(f"{BASE}/datasets/{args.repo}/resolve/main/{fname}", os.path.join(wd, fname))
            artifacts[fname] = {"bytes": size, "http": "OK"}
    except Exception as e:
        receipt = {"tool": "release-gates.py v2", "run_at": run_at, "repo": args.repo,
                   "mode": "anonymous", "verdict": "UNPROVEN",
                   "reason": f"artifact acquisition failed: {e}"}
        open(args.out, "w", encoding="utf-8").write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 2

    stamp = json.load(open(os.path.join(wd, "stamp-receipt.json"), encoding="utf-8"))
    card = open(os.path.join(wd, "README.md"), encoding="utf-8").read()

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

    # ---------------- Gate 2: receipt integrity ----------------
    # Proves the cryptographic LINK between each row and its receipt.
    # It does NOT prove the row's cybersecurity content is correct —
    # that is a separate concern (Gate 5 census + Gate 6 model eval).
    kept_rows, kept_bad = load_jsonl(os.path.join(wd, "dpo.jsonl"))
    q_rows, q_bad = load_jsonl(os.path.join(wd, "quarantine.jsonl"))
    link_fail, gate_mismatch, signals_mismatch, malformed = 0, 0, 0, 0
    missing_fields, stampers_bad = 0, 0
    for r in kept_rows:
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        rec = meta.get("receipt") if isinstance(meta.get("receipt"), dict) else {}
        if not rec:
            missing_fields += 1
            continue
        for k in ("row_sha256", "stage", "gate", "signals", "stamped_at", "stamper"):
            if not rec.get(k):
                missing_fields += 1
        if rec.get("stamper") != STAMPER:
            stampers_bad += 1
        if not (isinstance(r.get("prompt"), str) and isinstance(r.get("chosen"), str)
                and isinstance(r.get("rejected"), str) and r["chosen"].strip() and r["rejected"].strip()):
            malformed += 1
            continue
        if rec.get("row_sha256") != row_sha256(r):
            link_fail += 1
        if rec.get("gate") != GATE_VERSION:
            gate_mismatch += 1
        if rec.get("signals") != matched_signals((r.get("prompt") or "") + " " + (r.get("chosen") or "")):
            signals_mismatch += 1
    # gate re-evaluation: kept rows must pass the on-domain gate, quarantined rows must fail with the recorded reason
    kept_should_be_gated = sum(1 for r in kept_rows if gate_verdict(r) is not None)
    q_reason_recheck, q_wrong_reason = {}, 0
    for r in q_rows:
        reason = r.get("purge_reason")
        recomputed = gate_verdict(r)
        if reason != recomputed:
            q_wrong_reason += 1
        q_reason_recheck[reason] = q_reason_recheck.get(reason, 0) + 1
    reason_counts_match = all(stamp.get("purge_reasons", {}).get(k, 0) == v
                              for k, v in q_reason_recheck.items()) and \
        sum(stamp.get("purge_reasons", {}).values()) == len(q_rows)
    g2 = {
        "receipt_link_failures": link_fail,
        "receipt_missing_fields": missing_fields,
        "gate_version_mismatches": gate_mismatch,
        "signals_mismatches": signals_mismatch,
        "stamper_mismatches": stampers_bad,
        "malformed_kept_rows": malformed,
        "kept_rows_failing_gate_recheck": kept_should_be_gated,
        "quarantine_reason_recomputed": q_reason_recheck,
        "quarantine_reason_mismatches": q_wrong_reason,
        "purge_reason_counts_match_receipt": reason_counts_match,
        "integrity_note": ("row_sha256 recomputation proves the cryptographic link "
                           "between row content and receipt. It does NOT prove the "
                           "content is semantically correct."),
    }
    gate2 = "PASS" if (link_fail == 0 and missing_fields == 0 and gate_mismatch == 0
                       and signals_mismatch == 0 and stampers_bad == 0 and malformed == 0
                       and kept_should_be_gated == 0 and q_wrong_reason == 0
                       and reason_counts_match) else "FAIL"

    # ---------------- Gate 3: conservation ----------------
    kept_no_receipt = sum(1 for r in kept_rows
                          if not isinstance(r.get("metadata"), dict)
                          or not isinstance(r["metadata"].get("receipt"), dict))
    q_no_reason = sum(1 for r in q_rows if "purge_reason" not in r)
    g3 = {
        "receipt_input_rows": stamp.get("input_rows"),
        "receipt_kept": stamp.get("kept"),
        "receipt_purged": stamp.get("purged"),
        "rows_kept_found": len(kept_rows),
        "rows_quarantine_found": len(q_rows),
        "conservation_flag_in_receipt": stamp.get("conservation"),
        "conservation_recomputed": len(kept_rows) + len(q_rows) == stamp.get("input_rows"),
        "conservation_identity": f"{len(kept_rows)} + {len(q_rows)} == {stamp.get('input_rows')}",
        "unparseable_lines": {"kept": kept_bad, "quarantine": q_bad},
        "kept_rows_missing_receipt": kept_no_receipt,
        "quarantine_rows_missing_reason": q_no_reason,
    }
    gate3 = "PASS" if (
        g3["conservation_flag_in_receipt"] and g3["conservation_recomputed"]
        and stamp.get("kept") == len(kept_rows) and stamp.get("purged") == len(q_rows)
        and kept_no_receipt == 0 and q_no_reason == 0 and kept_bad == 0 and q_bad == 0
    ) else "FAIL"

    # ---------------- Gate 4: card<->artifact parity (hard gate) ----------------
    def num_from(pattern, text):
        m = re.search(pattern, text)
        return int(m.group(1).replace(",", "")) if m else None

    card_dpo = num_from(r"Total DPO Pairs:\s*([\d,]+)", card)
    card_qua = num_from(r"([\d,]+)\s+gated-out rows", card)
    card_folded = num_from(r"before the on-domain gate:\s*([\d,]+)\s+pairs", card)
    counts_parity = (card_dpo == len(kept_rows)
                     and card_qua == len(q_rows)
                     and card_folded == stamp.get("input_rows"))
    # the card must pin the viewer default config to the receipt-bearing dpo.jsonl
    configs_ok = False
    ym = re.search(r"^configs:.*?(?=^---|\Z)", card, re.M | re.S)
    if ym:
        block = ym.group(0)
        configs_ok = bool(re.search(r"path:\s*dpo\.jsonl", block)) and bool(
            re.search(r"default:\s*true", block))
    # every data file in the repo must be documented in the card
    tree_files = []
    try:
        tree = json.loads(fetch_bytes(
            f"{BASE}/api/datasets/{args.repo}/tree/main?recursive=true").decode())
        tree_files = [t["path"] for t in tree
                      if t.get("type") == "file" and t["path"].endswith(".jsonl")]
    except Exception as e:
        tree_files = [f"tree_error: {str(e)[:150]}"]
    undocumented = [p for p in tree_files if p not in card] if tree_files and not str(tree_files[0]).startswith("tree_error") else []
    view = viewer_state(args.repo)
    g4 = {
        "card_claimed_dpo_pairs": card_dpo,
        "machine_dpo_rows": len(kept_rows),
        "card_claimed_quarantine": card_qua,
        "machine_quarantine_rows": len(q_rows),
        "card_claimed_folded": card_folded,
        "receipt_input_rows": stamp.get("input_rows"),
        "counts_parity": counts_parity,
        "card_pins_viewer_default_to_dpo": configs_ok,
        "repo_data_files": tree_files,
        "data_files_undocumented_in_card": undocumented,
        "live_viewer_state": view,
        "parity_note": ("the card, the stamp receipt and the raw artifacts must agree; "
                        "viewer re-index may lag the card — raw files are truth"),
    }
    gate4 = "PASS" if (counts_parity and configs_ok and not undocumented) else "FAIL"

    # ---------------- Gate 5: semantic verification census ----------------
    # Receipt integrity (Gate 2) is linkage. This gate counts SEMANTIC
    # verification evidence only: a row counts as semantically verified
    # solely when it carries verified_by. Provenance receipts never count.
    sem_rows, sem_missing_by, stage_mismatch = 0, 0, 0
    provenance_only = 0
    for r in kept_rows:
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        rec = meta.get("receipt") if isinstance(meta.get("receipt"), dict) else {}
        st = rec.get("stage")
        has_vb = bool(meta.get("verified_by"))
        if st == "verified":
            if has_vb:
                sem_rows += 1
            else:
                sem_missing_by += 1
        elif st == "provenance":
            provenance_only += 1
            if has_vb:
                stage_mismatch += 1
        else:
            stage_mismatch += 1
    g5 = {
        "semantically_verified_rows": sem_rows,
        "provenance_receipt_only_rows": provenance_only,
        "verified_stage_rows_missing_verified_by": sem_missing_by,
        "illegal_stage_labels": stage_mismatch,
        "census_claim_status": (
            f"{sem_rows} row(s) carry semantic-verification evidence (verified_by); "
            f"{provenance_only} row(s) carry a provenance process receipt only. "
            "Semantic verification is counted, never inferred from receipt presence."),
    }
    gate5 = "PASS" if (sem_missing_by == 0 and stage_mismatch == 0) else "FAIL"

    verdict = "PASS" if all(g == "PASS" for g in (gate1, gate2, gate3, gate4, gate5)) else "FAIL"
    receipt = {
        "tool": "release-gates.py v2",
        "run_at": run_at,
        "repo": args.repo,
        "mode": "anonymous (no token)",
        "acquired": artifacts,
        "gate1_artifact_integrity": {"verdict": gate1, **g1},
        "gate2_receipt_integrity": {"verdict": gate2, **g2},
        "gate3_conservation": {"verdict": gate3, **g3},
        "gate4_card_artifact_parity": {"verdict": gate4, **g4},
        "gate5_semantic_verification_census": {"verdict": gate5, **g5},
        "gate6_model_evaluation": {
            "status": "NOT_RUN (requires GPU harness)",
            "inherited_baseline_note": ("base Qwen/Qwen2.5-3B-Instruct 47/60 and KIN v1 40/60 "
                                        "(Oct 12 local run) are CLAIMED-inherited, NOT re-verified by this run; "
                                        "rerun before citing"),
        },
        "gate7_project_integration": {
            "status": "WIRED-PLAN",
            "note": ("gates feed the Athelgard release verdict: HF release -> anonymous acquisition "
                     "-> artifact integrity -> receipt integrity -> conservation -> card<->artifact "
                     "parity -> semantic-verification census -> PASS | FAIL | UNPROVEN -> model eval "
                     "-> Athelgard"),
        },
        "verdict": verdict,
    }
    open(args.out, "w", encoding="utf-8", newline="\n").write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())

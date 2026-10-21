#!/usr/bin/env python3
"""
release-gates.py v3 — KIN HF estate release-closure gates.

Release closure only. No training, no benchmarking, no ranking claims.

ANONYMOUS executor: no token, no auth, exactly the way a stranger would.
Every release artifact is UNPROVEN until independently reproduced; this tool
performs the reproduction and emits a machine-checkable verdict.

  Gate 1  ARTIFACT INTEGRITY      artifact -> sha256 -> stamp receipt ->
         anonymous download -> sha256 again -> compare. PASS = byte identity.
  Gate 2  RECEIPT INTEGRITY      every row's receipt hash RECOMPUTED from the
         exact stamp-receipts.py formula (linkage, not content correctness);
         receipt fields, gate version, signals, stage labels re-derived per row.
  Gate 3  CONSERVATION           input == kept + quarantine; every kept row
         has a receipt; every quarantined row has a recomputed reason; sft
         row count must equal the kept count.
  Gate 4  CARD<->ARTIFACT PARITY  raw README claimed counts == machine-derived;
         the rendered public card shows the shipped count; the card carries no
         superseded totals; configs YAML pins dpo/quarantine/sft; the public
         file tree contains exactly the release data files (no legacy files).
  Gate 5  SEMANTIC VERIFICATION CENSUS  verified_by counted, never inferred
         from receipts; provenance receipts never count as verification.
  Gate 6  VIEWER<->RELEASE PARITY the Dataset Viewer must serve exactly the
         pinned configs with exactly the shipped row counts. Pending, stale,
         failed, or API-error viewer state => UNPROVEN, never PASS. Bounded
         polling; every checked endpoint and status is recorded.

  Gate 7  MODEL EVALUATION        NOT RUN (requires GPU). Inherited benchmark
         numbers are CLAIMED, never VERIFIED.
  Gate 8  ATHELGARD INTEGRATION  NOT READY (wired plan).

Verdicts: PASS | FAIL | UNPROVEN.
Exit codes: 0 = PASS, 1 = FAIL, 2 = UNPROVEN.
v3.1: a hard-gate FAIL (gates 1-5) outranks UNPROVEN and skips the viewer
      poll entirely (fail fast). The receipt carries an explicit
      hard_gate_failures list.

Usage:
  python3 release-gates.py --repo nyxspecter4/kin-cyber-dpo-v2 [--ref main]
                           [--out gates-receipt.json] [--viewer-timeout 900]
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

BASE = "https://huggingface.co"
DSV = "https://datasets-server.huggingface.co"
RELEASE_DATA_FILES = {"dpo.jsonl", "quarantine.jsonl", "sft.jsonl"}
LEGACY_FILES = {"train.jsonl", "dpo-clean.jsonl", "grpo_prompts.jsonl"}
SUPERSEDED_TOTALS = ["1,331", "1331 DPO", "1,471", "1,495", "1,635 DPO"]
GATE_VERSION = "cyber-signals-v1"
STAMPER = "stamp-receipts.py v1"
TOOL_VERSION = "release-gates.py v3.1"
INTERNAL = ["athelgard","hunt-harbor","cryptnoir","bountywarz","protocolbreach","makothoth",
            "anchor_intro","panel_voice","anchor_synthesis","sign_off","fitness landscape"]
CYBER = ["CVE-","XSS","SQL injection","buffer overflow","RCE","MFA","EDR","SIEM","phishing",
         "ransomware","malware","exploit","vulnerability","OWASP","CWE","zero-day","MITRE",
         "ATT&CK","Sigma","YARA","DFIR","SOC","CrowdStrike","Splunk","log4shell","solarwinds",
         "colonial pipeline","mgm","Kubernetes","Docker","IAM","OAuth","SAML","zero trust"]

ENDPOINTS = []  # every checked public endpoint + status, recorded in the receipt


def record(endpoint, status, detail=""):
    ENDPOINTS.append({"endpoint": endpoint, "status": status, "detail": str(detail)[:200],
                      "checked_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})


def fetch_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "release-gates/3 (anonymous)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def try_fetch(url, tag):
    try:
        data = fetch_bytes(url)
        record(url, "OK", f"{len(data)} bytes")
        return data
    except Exception as e:
        record(url, f"ERROR {getattr(e, 'code', type(e).__name__)}", str(e)[:120])
        return None


def matched_signals(text):
    tl = text.lower()
    return [k for k in CYBER if k.lower() in tl]


def row_sha256(row):
    canon = json.dumps(
        {"prompt": row.get("prompt"), "chosen": row.get("chosen"), "rejected": row.get("rejected")},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()[:16]


def gate_verdict(row):
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


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def load_jsonl_bytes(b):
    rows, bad = [], 0
    try:
        text = b.decode("utf-8")
    except UnicodeDecodeError:
        # v3.1 (Finding D fix): corrupt-byte artifacts fail CLOSED with a clean
        # receipt instead of crashing with a traceback. The sha mismatch is
        # already caught by Gate 1; this keeps the verdict path alive.
        return [], 1
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            bad += 1
    return rows, bad


def poll_viewer(repo, expected, timeout, interval):
    """Bounded poll of the public viewer API. Returns (state, verdict)."""
    deadline = time.time() + timeout
    last = None
    while True:
        splits = try_fetch(f"{DSV}/splits?dataset={repo}", "viewer-splits")
        info = try_fetch(f"{DSV}/info?dataset={repo}", "viewer-info")
        if splits is not None and info is not None:
            try:
                sj = json.loads(splits)
                ij = json.loads(info)
                pending = sj.get("pending", [])
                failed = sj.get("failed", [])
                configs = {c for c in ij.get("dataset_info", {})}
                examples = {cfg: {s: sv.get("num_examples")
                                  for s, sv in v.get("splits", {}).items()}
                            for cfg, v in ij.get("dataset_info", {}).items()}
                last = {"configs": sorted(configs), "examples": examples,
                        "pending": pending, "failed": failed}
                if not pending and not failed and configs == set(expected):
                    counts_ok = all(examples.get(c, {}).get("train") == expected[c]["train"] for c in expected)
                    if counts_ok:
                        return last, "PASS"
            except Exception as e:
                last = {"parse_error": str(e)[:150]}
        if time.time() >= deadline:
            return last, "UNPROVEN"
        time.sleep(interval)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--ref", default="main")
    ap.add_argument("--out", default="gates-receipt.json")
    ap.add_argument("--workdir", default=None)
    ap.add_argument("--viewer-timeout", type=int, default=900)
    ap.add_argument("--viewer-poll-interval", type=int, default=30)
    args = ap.parse_args()
    wd = args.workdir or "gates-work"
    os.makedirs(wd, exist_ok=True)
    run_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    artifacts = {}
    blob = {}
    for fname in ("dpo.jsonl", "quarantine.jsonl", "sft.jsonl", "stamp-receipt.json", "README.md"):
        data = try_fetch(f"{BASE}/datasets/{args.repo}/resolve/{args.ref}/{fname}", f"artifact:{fname}")
        if data is None:
            receipt = {"tool": TOOL_VERSION, "run_at": run_at, "repo": args.repo, "ref": args.ref,
                       "mode": "anonymous (no token)", "verdict": "UNPROVEN",
                       "reason": f"artifact acquisition failed: {fname}",
                       "checked_public_endpoints": ENDPOINTS}
            open(args.out, "w", encoding="utf-8").write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
            print(json.dumps(receipt, indent=2, sort_keys=True))
            return 2
        blob[fname] = data
        artifacts[fname] = {"bytes": len(data), "sha256": sha256_bytes(data), "http": "OK"}

    stamp = json.loads(blob["stamp-receipt.json"].decode("utf-8"))
    card = blob["README.md"].decode("utf-8")

    # ---------------- Gate 1: artifact integrity ----------------
    g1 = {
        "dpo_sha256_expected": stamp.get("output_sha256"),
        "dpo_sha256_found": artifacts["dpo.jsonl"]["sha256"],
        "quarantine_sha256_expected": stamp.get("quarantine_sha256"),
        "quarantine_sha256_found": artifacts["quarantine.jsonl"]["sha256"],
    }
    g1["byte_identity"] = (g1["dpo_sha256_expected"] == g1["dpo_sha256_found"]
                           and g1["quarantine_sha256_expected"] == g1["quarantine_sha256_found"])
    gate1 = "PASS" if g1["byte_identity"] else "FAIL"

    # ---------------- Gate 2: receipt integrity ----------------
    kept_rows, kept_bad = load_jsonl_bytes(blob["dpo.jsonl"])
    q_rows, q_bad = load_jsonl_bytes(blob["quarantine.jsonl"])
    sft_rows, sft_bad = load_jsonl_bytes(blob["sft.jsonl"])
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
    kept_should_be_gated = sum(1 for r in kept_rows if gate_verdict(r) is not None)
    q_reason_recheck, q_wrong_reason = {}, 0
    for r in q_rows:
        reason = r.get("purge_reason")
        if reason != gate_verdict(r):
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
        "kept": len(kept_rows), "quarantine": len(q_rows), "sft": len(sft_rows),
        "conservation_identity": f"{len(kept_rows)} + {len(q_rows)} == {stamp.get('input_rows')}",
        "conservation_recomputed": len(kept_rows) + len(q_rows) == stamp.get("input_rows"),
        "conservation_flag_in_receipt": stamp.get("conservation"),
        "sft_rows_equal_kept_rows": len(sft_rows) == len(kept_rows),
        "unparseable_lines": {"kept": kept_bad, "quarantine": q_bad, "sft": sft_bad},
        "kept_rows_missing_receipt": kept_no_receipt,
        "quarantine_rows_missing_reason": q_no_reason,
    }
    gate3 = "PASS" if (g3["conservation_flag_in_receipt"] and g3["conservation_recomputed"]
                       and stamp.get("kept") == len(kept_rows) and stamp.get("purged") == len(q_rows)
                       and g3["sft_rows_equal_kept_rows"]
                       and kept_no_receipt == 0 and q_no_reason == 0
                       and kept_bad == 0 and q_bad == 0 and sft_bad == 0) else "FAIL"

    # ---------------- Gate 4: card<->artifact parity ----------------
    def num_from(pattern, text):
        m = re.search(pattern, text)
        return int(m.group(1).replace(",", "")) if m else None

    card_dpo = num_from(r"Total DPO Pairs:\s*([\d,]+)", card)
    card_qua = num_from(r"([\d,]+)\s+gated-out rows", card)
    card_folded = num_from(r"before the on-domain gate:\s*([\d,]+)\s+pairs", card)
    counts_parity = (card_dpo == len(kept_rows) and card_qua == len(q_rows)
                     and card_folded == stamp.get("input_rows"))
    superseded_present = [s for s in SUPERSEDED_TOTALS if s in card]
    ym = re.search(r"^configs:.*?(?=^---|\Z)", card, re.M | re.S)
    configs_ok = bool(ym) and all(re.search(rf"path:\s*{re.escape(f)}", ym.group(0))
                                  for f in ("dpo.jsonl", "quarantine.jsonl", "sft.jsonl")) \
        and bool(re.search(r"default:\s*true", ym.group(0))) \
        and "dpo.jsonl" in re.search(r"- config_name: dpo.*?(?=- config_name:|\Z)", ym.group(0), re.S).group(0)
    # public file tree (main): exactly the release data files, no legacy
    tree = try_fetch(f"{BASE}/api/datasets/{args.repo}/tree/main?recursive=true", "tree")
    tree_jsonl, tree_state = [], "unavailable"
    if tree is not None:
        try:
            tree_jsonl = sorted(t["path"] for t in json.loads(tree)
                                if t.get("type") == "file" and t["path"].endswith(".jsonl"))
            tree_state = "ok"
        except Exception as e:
            tree_state = f"parse_error {str(e)[:80]}"
    tree_ok = tree_state == "ok" and set(tree_jsonl) == RELEASE_DATA_FILES
    legacy_in_tree = sorted(set(tree_jsonl) & LEGACY_FILES)
    # rendered public card
    page_url = f"{BASE}/datasets/{args.repo}" if args.ref == "main" else \
        f"{BASE}/datasets/{args.repo}/blob/{args.ref}/README.md"
    page = try_fetch(page_url, "rendered-card")
    rendered_ok, rendered_note = None, "not fetched"
    if page is not None:
        h = page.decode("utf-8", "replace")
        want = f"Total DPO Pairs: {len(kept_rows):,}"
        rendered_ok = (want in h) and not any(s in h for s in ("1,331", "1331 DPO"))
        rendered_note = f"rendered card contains '{want}': {want in h}"
    # for a tag run, also verify tag README == main README so the rendered main page represents this ref
    tag_matches_main = None
    if args.ref != "main":
        main_readme = try_fetch(f"{BASE}/datasets/{args.repo}/resolve/main/README.md", "main-readme-for-tag-compare")
        tag_matches_main = main_readme is not None and main_readme == blob["README.md"]
    g4 = {
        "card_claimed_dpo_pairs": card_dpo, "machine_dpo_rows": len(kept_rows),
        "card_claimed_quarantine": card_qua, "machine_quarantine_rows": len(q_rows),
        "card_claimed_folded": card_folded, "receipt_input_rows": stamp.get("input_rows"),
        "counts_parity": counts_parity,
        "superseded_totals_in_card": superseded_present,
        "configs_pinned": configs_ok,
        "public_tree_data_files": tree_jsonl, "tree_state": tree_state,
        "legacy_files_in_tree": legacy_in_tree,
        "tree_contains_exactly_release_files": tree_ok,
        "rendered_card_ok": rendered_ok, "rendered_card_endpoint": page_url,
        "rendered_card_note": rendered_note,
        "tag_readme_matches_main": tag_matches_main,
    }
    gate4 = "PASS" if (counts_parity and not superseded_present and configs_ok
                       and tree_ok and not legacy_in_tree
                       and rendered_ok is True) else "FAIL"
    if rendered_ok is None and gate4 == "FAIL":
        pass  # still FAIL: surfaces must agree before release passes

    # ---------------- Gate 5: semantic verification census ----------------
    sem_rows, sem_missing_by, stage_mismatch, provenance_only = 0, 0, 0, 0
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
        "provenance_only_rows": provenance_only,
        "verified_stage_rows_missing_verified_by": sem_missing_by,
        "illegal_stage_labels": stage_mismatch,
        "census_claim_status": (
            f"{len(kept_rows)} receipt-bearing rows; {sem_rows} semantically "
            f"verified and {provenance_only} provenance-only."),
    }
    gate5 = "PASS" if (sem_missing_by == 0 and stage_mismatch == 0) else "FAIL"

    # ---------------- Gate 6: viewer<->release parity ----------------
    expected_viewer = {"dpo": {"train": len(kept_rows)},
                       "quarantine": {"train": len(q_rows)},
                       "sft": {"train": len(sft_rows)}}
    # v3.1 (Finding B fix): fail fast. A hard-gate FAIL (gates 1-5) means fraud
    # or breakage is already detected; the bounded viewer poll is skipped so no
    # verdict waits out the full --viewer-timeout after a known failure.
    hard_gate_names = ["gate1_artifact_integrity", "gate2_receipt_integrity",
                       "gate3_conservation", "gate4_card_artifact_parity",
                       "gate5_semantic_verification_census"]
    hard_verdicts = dict(zip(hard_gate_names, [gate1, gate2, gate3, gate4, gate5]))
    hard_gate_failures = [n for n, g in hard_verdicts.items() if g == "FAIL"]
    g6 = {
        "viewer_configs_expected": {k: v["train"] for k, v in expected_viewer.items()},
        "rule": ("pending/stale/failed viewer or API errors => UNPROVEN, never PASS; "
                 "bounded polling; all endpoints recorded"),
    }
    if hard_gate_failures:
        g6["viewer_state_final"] = None
        g6["skipped_reason"] = ("hard-gate FAIL: " + ", ".join(hard_gate_failures)
                                + " — viewer poll bypassed (fail fast; v3.1 Finding B fix)")
        gate6 = "SKIPPED"
        hard_gates = [gate1, gate2, gate3, gate4, gate5]
    else:
        viewer_state, viewer_verdict = poll_viewer(args.repo, expected_viewer,
                                                   args.viewer_timeout, args.viewer_poll_interval)
        g6["viewer_state_final"] = viewer_state
        gate6 = viewer_verdict
        hard_gates = [gate1, gate2, gate3, gate4, gate5, gate6]

    # v3.1 (Finding A fix): FAIL outranks UNPROVEN. A detected hard-gate failure
    # is never masked by an unreachable or inconclusive viewer; exit-code
    # automation can always distinguish "fraud detected" from "viewer down".
    if any(g == "FAIL" for g in hard_gates):
        verdict = "FAIL"
    elif all(g == "PASS" for g in hard_gates):
        verdict = "PASS"
    else:
        verdict = "UNPROVEN"

    receipt = {
        "tool": TOOL_VERSION,
        "run_at": run_at,
        "repo": args.repo,
        "ref": args.ref,
        "mode": "anonymous (no token)",
        "artifact_hashes": {f: artifacts[f]["sha256"] for f in artifacts},
        "gate1_artifact_integrity": {"verdict": gate1, **g1},
        "gate2_receipt_integrity": {"verdict": gate2, **g2},
        "gate3_conservation": {"verdict": gate3, **g3},
        "gate4_card_artifact_parity": {"verdict": gate4, **g4},
        "gate5_semantic_verification_census": {"verdict": gate5, **g5},
        "gate6_viewer_release_parity": {"verdict": gate6, **g6},
        "gate7_model_evaluation": {
            "status": "NOT RUN (requires GPU harness)",
            "inherited_note": ("base 47/60 and candidate-v1 40/60 (Oct 12 local run) are "
                               "CLAIMED-inherited; rerun before any use")},
        "gate8_athelgard_integration": {"status": "NOT READY (wired plan; consumes receipts only)"},
        "stage_census": {"provenance_only": provenance_only, "semantically_verified": sem_rows},
        "hard_gate_failures": hard_gate_failures,
        "checked_public_endpoints": ENDPOINTS,
        "verdict": verdict,
    }
    open(args.out, "w", encoding="utf-8", newline="\n").write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps({k: receipt[k] for k in ("tool", "run_at", "ref", "verdict")}))
    for k in receipt:
        if k.startswith("gate") and isinstance(receipt[k], dict) and "verdict" in receipt[k]:
            print(f"  {k}: {receipt[k]['verdict']}")
    print("  stage_census:", receipt["stage_census"])
    return {"PASS": 0, "FAIL": 1, "UNPROVEN": 2}[verdict]


if __name__ == "__main__":
    sys.exit(main())

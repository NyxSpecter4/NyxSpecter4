#!/usr/bin/env python3
"""Filter KIN DPO rows into SFT format, with an auditable dry-run report."""
import argparse
import json
import re
import sys
from collections import Counter

KIN_SYS = "You are KIN - a sharp cybersecurity AI partner. Direct, opinionated, specific. Name tools, CVEs, companies. Sound like a senior engineer at a bar, not a textbook. Lead with your boldest take. End with a specific action. Max 2-3 paragraphs."

INTERNAL = ["athelgard","hunt-harbor","cryptnoir","bountywarz","protocolbreach","makothoth",
            "anchor_intro","panel_voice","anchor_synthesis","sign_off","fitness landscape"]

CYBER = ["CVE-","XSS","SQL injection","buffer overflow","RCE","MFA","EDR","SIEM","phishing",
         "ransomware","malware","exploit","vulnerability","OWASP","CWE","zero-day","MITRE",
         "ATT&CK","Sigma","YARA","DFIR","SOC","CrowdStrike","Splunk","log4shell","solarwinds",
         "colonial pipeline","mgm","Kubernetes","Docker","IAM","OAuth","SAML","zero trust"]

def is_cyber(text):
    tl = text.lower()
    return sum(1 for k in CYBER if k.lower() in tl) >= 2

def is_internal(text):
    tl = text.lower()
    return sum(1 for k in INTERNAL if k.lower() in tl) >= 2

def clean(text):
    text = re.sub(r'\[(anchor_intro|panel_voice|sign_off|call|cover)\].*?(?=\[|$)', '', text, flags=re.DOTALL)
    return text.strip()

def evaluate(prompt, chosen):
    combined = prompt + " " + chosen
    if is_internal(combined): return None, "internal-content"
    if not is_cyber(combined): return None, "insufficient-cyber-signals"
    c = clean(chosen)
    if len(c) < 50: return None, "short-after-cleaning"
    return {"messages": [{"role":"system","content":KIN_SYS},{"role":"user","content":prompt},{"role":"assistant","content":c}]}, None


def convert(prompt, chosen):
    """Compatibility wrapper used by existing callers."""
    item, _ = evaluate(prompt, chosen)
    return item


def prepare(rows):
    sft = []
    rejected = Counter()
    for row in rows:
        item, reason = evaluate(row.get("prompt", ""), row.get("chosen", ""))
        if item:
            sft.append(item)
        else:
            rejected[reason] += 1
    return sft, rejected


def audit_report(source, input_rows, sft, rejected):
    return {
        "source": source,
        "input_rows": input_rows,
        "retained_rows": len(sft),
        "rejected_rows": sum(rejected.values()),
        "rejection_reasons": {key: rejected[key] for key in sorted(rejected)},
        "output_written": False,
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dpo-repo", default="nyxspecter4/kin-cyber-dpo-v2")
    p.add_argument("--input", help="local JSONL with prompt/chosen fields; avoids a dataset download")
    p.add_argument("--output", default="kin-v2-sft.jsonl")
    p.add_argument("--stats", action="store_true", help="emit JSON filter counts without writing a training artifact")
    a = p.parse_args()
    if a.input:
        with open(a.input, encoding="utf-8") as source_file:
            rows = [json.loads(line) for line in source_file if line.strip()]
        source = a.input
    else:
        from datasets import load_dataset
        print(f"Loading from {a.dpo_repo}...", file=sys.stderr if a.stats else sys.stdout)
        rows = list(load_dataset(a.dpo_repo, split="train"))
        source = a.dpo_repo
    sft, rejected = prepare(rows)
    if a.stats:
        print(json.dumps(audit_report(source, len(rows), sft, rejected), sort_keys=True))
        return
    with open(a.output, "w") as f:
        for item in sft: f.write(json.dumps(item) + "\n")
    print(f"Done: {len(sft)} SFT pairs -> {a.output} (rejected {sum(rejected.values())})")
    print(json.dumps(audit_report(source, len(rows), sft, rejected), sort_keys=True))

if __name__ == "__main__":
    main()

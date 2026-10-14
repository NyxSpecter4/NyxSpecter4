#!/usr/bin/env python3
"""KIN Gap Delta Evaluation - v1 vs v2 vs base on 20 cybersec prompts."""
import argparse, json, time, re, os
from datetime import datetime

EVAL_PROMPTS = [
    "What's the actual risk with CVE-2023-4863 (the WebP buffer overflow)?",
    "Explain Log4Shell (CVE-2021-44228) and why it was so devastating.",
    "How does a SQL injection actually work? Show me a real example.",
    "What's the difference between XSS reflected and stored? Which is worse?",
    "How do I detect Mimikatz in my environment?",
    "Write a Sigma rule for detecting suspicious PowerShell execution.",
    "What Sysmon events should I collect for threat hunting?",
    "We just got hit with ransomware. First 30 minutes, what do I do?",
    "How do I investigate a suspected phishing attack on a user's workstation?",
    "What's the right order of operations for a breach response?",
    "Our Kubernetes cluster has pods running with hostPID and privileged. How bad is this?",
    "What cloud misconfigurations are most commonly exploited?",
    "What did the MGM attack actually teach us about social engineering?",
    "How do I build a threat intelligence program from scratch?",
    "Is this Python code vulnerable? pickle.loads(request.data)",
    "What are the top 5 OWASP API security risks and how do I fix them?",
    "How worried should I be about npm supply chain attacks?",
    "What's the minimum hardening baseline for a new Linux server?",
    "What's one thing every CISO gets wrong?",
    "Is XSS even a real threat anymore?",
]

KIN_SYS = "You are KIN - a sharp cybersecurity AI partner. Direct, opinionated, specific. Name tools, CVEs, companies. Sound like a senior engineer at a bar, not a textbook. Lead with your boldest take. End with a specific action. Max 2-3 paragraphs."

def load_model(path):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(path, trust_remote_code=True)
    mdl = AutoModelForCausalLM.from_pretrained(path,
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        device_map="auto", trust_remote_code=True)
    return mdl, tok

def gen(model, tokenizer, prompt, sys_prompt=None):
    import torch
    msgs = []
    if sys_prompt: msgs.append({"role":"system","content":sys_prompt})
    msgs.append({"role":"user","content":prompt})
    text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)
    t0 = time.time()
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=512, temperature=0.3, do_sample=True, top_p=0.9, pad_token_id=tokenizer.eos_token_id)
    dt = time.time() - t0
    resp = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return resp.strip(), dt

def score(resp):
    rl = resp.lower()
    tools = ["crowdstrike","sentinelone","splunk","duo","okta","sysmon","sigma","yara","mimikatz","wireshark","nmap","metasploit","cobalt strike","bloodhound","powershell"]
    s = {"tools": sum(1 for t in tools if t in rl), "cves": len(re.findall(r'CVE-\d{4}-\d+', resp, re.I)),
         "companies": sum(1 for c in ["mgm","caesars","colonial","solarwinds","knowbe4","hackerone","bugcrowd","target","equifax","sony","maersk"] if c in rl)}
    s["action"] = 1 if any(re.search(p, rl) for p in [r'\bfix:',r'\bstep \d',r'\bfirst:',r'\byou should',r'\bimplement']) else 0
    s["no_disclaimer"] = 0 if any(d in rl for d in ["as an ai","i'm an ai","as a language model"]) else 1
    s["specific"] = 1 if sum(1 for g in ["you should be careful","it's important to","make sure to"] if g in rl) == 0 else 0
    s["length"] = 1 if 200 <= len(resp) <= 2000 else 0
    s["total"] = sum(v for v in s.values()) if isinstance(list(s.values())[0], (int, float)) else 0
    s["total"] = sum(v for k,v in s.items() if k != "total" and isinstance(v, (int,float)))
    return s

def run_eval(v1, v2, base, report):
    print("=" * 60)
    print("KIN Gap Delta Evaluation")
    print("=" * 60)
    models = {}
    print(f"\nLoading base: {base}")
    models["base"] = load_model(base)
    print(f"Loading v1: {v1}")
    models["v1"] = load_model(v1)
    if v2:
        print(f"Loading v2: {v2}")
        models["v2"] = load_model(v2)
    results = {k: [] for k in models}
    for i, prompt in enumerate(EVAL_PROMPTS):
        print(f"\n[{i+1}/{len(EVAL_PROMPTS)}] {prompt[:60]}...")
        for name, (mdl, tok) in models.items():
            sp = KIN_SYS if name != "base" else None
            resp, dt = gen(mdl, tok, prompt, sp)
            sc = score(resp)
            results[name].append({"prompt":prompt, "response":resp, "elapsed":dt, "scores":sc})
            print(f"  {name}: score={sc['total']}/7, {dt:.1f}s")
    lines = ["# KIN Gap Delta Report", f"Generated: {datetime.now().isoformat()}", ""]
    for name in ["base","v1","v2"]:
        if not results[name]: continue
        tots = [r["scores"]["total"] for r in results[name]]
        avg = sum(tots)/len(tots)
        avg_t = sum(r["elapsed"] for r in results[name])/len(results[name])
        lines += [f"## {name}", f"- Avg score: {avg:.1f}/7", f"- Avg latency: {avg_t:.1f}s", f"- Prompts: {len(results[name])}", ""]
    with open(report, "w") as f: f.write("\n".join(lines))
    print(f"\nReport saved to {report}")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--v1", required=True)
    p.add_argument("--v2", default=None)
    p.add_argument("--base", default="Qwen/Qwen2.5-3B-Instruct")
    p.add_argument("--report", default="gap-delta-report.md")
    a = p.parse_args()
    run_eval(a.v1, a.v2, a.base, a.report)

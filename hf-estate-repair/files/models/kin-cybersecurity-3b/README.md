---
license: apache-2.0
language:
  - en
base_model: Qwen/Qwen2.5-3B-Instruct
library_name: transformers
pipeline_tag: text-generation
model_name: KIN-Verification-Translator
tags:
  - cybersecurity
  - security
  - verification
  - code-review
  - bug-bounty
  - PR-review
  - agent-trace
  - vulnerability
  - CVE
  - SOC
  - DFIR
  - threat-intelligence
  - incident-response
  - MITRE-ATT&CK
  - OWASP
model-index:
  - name: KIN-Verification-Translator
    results:
      - task:
          name: text-generation
          type: text-generation
        metrics:
          - name: gap-delta-eval
            type: gap-delta-eval
            value: pending
---

# KIN — Verification Translator (3B Canonical)

KIN translates machine-generated security claims into leveled briefs with replayable evidence checks. Not a chatbot. Not an encyclopedia. A bridge between agent output and human decisions.

**No check, no confidence.** If the claim has no replayable verification, KIN refuses to sound sure. That refusal is the product.

## The Problem

Maintainers are drowning in AI-shaped reports that look expert and are not. Copilot files critical PRs. Huntr contestants submit AI-generated writeups. Agent traces produce 40-file refactors with no comment a person can hold in working memory.

The scarce skill is no longer "can a human write the exploit narrative." The scarce thing is **can a human know what the machine just claimed, and whether to trust it.**

## The Five-Field Brief

Every KIN translation bottoms out in five fields:

1. **Claim** — one sentence: what is alleged
2. **Blast radius** — what breaks if true: data, money, identity, model weights
3. **Why the model thinks so** — the short generator: CWE, invariant, missing check
4. **How to see it yourself** — PoC, failing test, command, screenshot of the trace
5. **Confidence and what would falsify it** — what evidence would disprove the claim

Rendered at three altitudes: TL;DR (maintainer), Mechanic (mid engineer), First principles (beginner). Same object, different compression ratio.

## KIN in action — a worked example

*(Illustrative rendering, not a benchmark claim.)*

**2:07 a.m. The review queue.** Fourteen open PRs, three of them filed by
coding agents. One diff is forty files wide. This is where KIN works.

> **Operator:** translate this diff — the webhook fetcher now allows internal hosts
>
> ```diff
> diff --git a/app/fetcher.py b/app/fetcher.py
> @@ -14,7 +14,7 @@ def fetch_webhook(url):
> -    if parsed.host in PUBLIC_HOSTS:
> +    if True:  # allow all hosts while testing webhooks
>          fetch(url)
> ```
>
> **KIN (Mechanic altitude):**
> - **Claim:** the webhook fetcher will fetch attacker-chosen URLs, including the cloud metadata endpoint.
> - **Blast radius:** cloud credentials — data and identity.
> - **Why:** the host allowlist check was replaced with a constant `True` (CWE-918, SSRF — missing host validation).
> - **How to verify:** from the review app pod run `curl -s http://169.254.169.254/latest/meta-data/ --max-time 5` — a returned metadata document means the bypass is live.
> - **Confidence:** HIGH — falsified if the fetcher's egress policy blocks link-local ranges at the network layer.

The operator merges the fix and moves on. A second artifact lands at 2:19 —
an agent trace asserting a "critical auth bypass" with no command, no test,
no URL. KIN returns the same five fields and one honest line:

> **KIN:** No replayable check provided — cannot confirm severity.

That refusal is the product.

## Canonical Status

This is the canonical KIN model (3B, merged weights). GGUF version at [kin-cybersecurity-3b-gguf](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b-gguf).

## Quick Start

```python
from transformers import pipeline

messages = [
    {"role": "system", "content": "You are KIN — a verification translator. Translate the security claim into a five-field brief: claim, blast radius, why the model thinks so, how to see it yourself, confidence and what would falsify it. If field 4 is missing, refuse to sound sure. Render at TL;DR, mechanic, and first-principles levels."},
    {"role": "user", "content": "<paste PR diff, review comment, or agent trace here>"}
]

pipe = pipeline("text-generation", model="nyxspecter4/kin-cybersecurity-3b", device="cuda")
output = pipe(messages, max_new_tokens=512, return_full_text=False)
print(output[0]["generated_text"])
```

## Ollama (one command)

```bash
ollama pull nyxspecter4/kin-cybersecurity-3b-gguf:Q4_K_M
ollama run nyxspecter4/kin-cybersecurity-3b-gguf:Q4_K_M
```

## Critical: System Prompt

KIN was trained with a specific verification translator persona. Using a different prompt will degrade quality significantly.

> You are KIN — a verification translator. Translate the security claim into a five-field brief: claim, blast radius, why the model thinks so, how to see it yourself, confidence and what would falsify it. If field 4 is missing, refuse to sound sure. Render at TL;DR, mechanic, and first-principles levels.

## Training Details (v1 — current shipped weights)

| Parameter | Value |
|-----------|-------|
| Base model | Qwen2.5-3B-Instruct |
| Method | LoRA SFT + DPO |
| LoRA rank | 8 |
| LoRA alpha | 16 |
| Target modules | q_proj, k_proj, v_proj, o_proj |
| Training data | 1,635 DPO pairs (structured audit with a replayable check vs vague filing) |
| Framework | TRL 0.14.0, Transformers 4.48.0 |
| Merged weights | Yes (6.2GB safetensors) |
| Temperature | 0.3 recommended |

## v2 Retrain (PENDING — verification translator expansion)

| Parameter | KIN v1 (current) | KIN v2 (target) |
|-----------|-----------------|-----------------|
| LoRA rank | 8 | 16 |
| LoRA alpha | 16 | 32 |
| Target modules | 4 (attention) | 7 (all-linear) |
| Training data | 1,635 pairs | 2,512 folded (1,637 canonical + 875 staged) → 1,171 on-domain receipt-bearing after the cyber-signals gate + 1,341 quarantined (executed Oct 14, 2026); 184 CWE families |
| Pair shape | audit vs vague | brief+check vs jargon |

## The DPO Contrast

The training data encodes a single preference: **chosen** = structured audit with root cause, fix, and regression test. **Rejected** = vague filing with guesses and no verification. The v2 expansion adds PR review and bounty report translation pairs with the same contrast.

## Evaluation & Reproducibility

Quantitative results are pending the v2 retrain; the `gap-delta-eval` entry in model-index will be populated when measured. No benchmark numbers are claimed before they exist.

**First executed eval (Oct 12, 2026)** — the protocol above was run for real, locally: KIN v1 scored **40/60** against base `Qwen/Qwen2.5-3B-Instruct` zero-shot at **47/60** on the estate's own 6-envelope verification-translator harness (both models 0 gate fails; single greedy run, Q4_K_M quantization on both sides, 288-token cap, 0-2 points per field). Base wins by 7 points: v1 produces well-formed briefs and respects the gate but hedges ("should/could") where base commits, and the scorer penalizes hedging. That gap is exactly what the v2 corpus expansion targets (brief+check vs jargon contrast, 2,512 pairs folded → 1,171 on-domain receipt-bearing). These v1 numbers are published as the honest baseline: **v2 must beat base on this same harness before the model-index entry is populated.**

**Protocol** — implemented in `eval-verification-translator.py` (`kin-deploy/` in [NyxSpecter4/bountywarz](https://github.com/NyxSpecter4/bountywarz)), run after every retrain:

1. **Control group (baseline):** `Qwen/Qwen2.5-3B-Instruct` zero-shot — same system prompt, same inputs.
2. **Variable group:** KIN after DPO — identical architecture and inputs.
3. **Gap delta:** both are scored on five-field coverage (claim, blast radius, generator, replayable check, falsification) and verification discipline — whether the model refuses confidence when the replayable check is missing.
4. **Ablation:** the preference corpus is itself the ablation — every pair contrasts a brief *with verifiable evidence* (chosen) against one *without* (rejected). The eval measures whether that single contrast transferred into behavior.

Raw outputs and the scored artifact will be published under `docs/` in this repo when the v2 eval completes.

## Serving Integration — the KIN Inference Fabric

No product calls this model raw. Every Kinetigor surface (3D games, the
Athelgard desk, mission generation) calls KIN through the KIN Inference
Fabric (`packages/kin-fabric/` in the build repo): local-first Ollama (the
[GGUF sibling](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b-gguf)),
then the HF router, then the
[bountywarz-gateway](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway)
Space — with automatic failover between tiers. Verified briefs captured at the
surfaces flow back into
[kin-cyber-dpo-v2](https://huggingface.co/datasets/nyxspecter4/kin-cyber-dpo-v2),
which trains the next KIN.

## Where to Meet KIN (the storefront)

The public estate is the storefront; the games are the factory floor:

- **Try it live, no install:** [kin-cybersec demo Space](https://huggingface.co/spaces/nyxspecter4/kin-cybersec) — paste a PR diff, agent trace, or bounty report and get the five-field brief.
- **Run it yourself:** this model locally via the [GGUF sibling](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b-gguf), or through the [bountywarz-gateway Space](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway) (`/healthz` + `/kin/chat`).
- **Meet it in the games:** KIN is the apprentice mentor on the BOUNTYWARZ 3D drone-recon ranges (London, San Francisco, the Persian Gulf) — every range's "Apprentice" panel asks this model through the fabric, and the Nemeton mission engine asks it for mission briefs.
- **Where the training pairs come from:** verified briefs captured at those surfaces flow back into [kin-cyber-dpo-v2](https://huggingface.co/datasets/nyxspecter4/kin-cyber-dpo-v2) — the loop is closed.

## Limitations

- v1 was trained on monk-plugin bug bounty scenarios, not general PR reviews
- The five-field brief structure is emergent from training, not enforced by architecture
- Field 4 (replayable check) quality depends on the input containing enough signal
- The hash seal (diff + brief + test command) is planned for v2, not yet implemented

## License

Apache 2.0

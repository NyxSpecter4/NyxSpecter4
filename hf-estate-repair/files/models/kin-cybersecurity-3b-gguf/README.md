---
license: apache-2.0
base_model: Qwen/Qwen2.5-3B-Instruct
language:
  - en
library_name: gguf
pipeline_tag: text-generation
tags:
  - cybersecurity
  - security
  - gguf
  - qwen2.5
  - lora
  - infosec
  - threat-intelligence
  - red-team
  - blue-team
  - defensive-security
  - offensive-security
  - SIEM
  - EDR
  - DFIR
  - malware-analysis
  - MITRE-ATT&CK
  - OWASP
  - ollama
  - llama.cpp
model_name: kin-cybersecurity-3b-gguf
datasets:
  - nyxspecter4/kin-cyber-dpo-v2
---

# KIN — Verification Translator (GGUF, 3B Canonical)

Quantized GGUF version of [kin-cybersecurity-3b](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b) — a cybersecurity fine-tune of **Qwen2.5-3B-Instruct**. Runs locally via Ollama or llama.cpp on a laptop.

## Why this model

| Field | Value |
|------|-------|
| Base | `Qwen/Qwen2.5-3B-Instruct` (NOT 7B Coder) |
| Trained on | `nyxspecter4/kin-cyber-dpo-v2` (1,635 DPO pairs) |
| LoRA rank | 8 (v1) → 16 (v2 pending) |
| LoRA alpha | 16 (v1) → 32 (v2 pending) |
| Target modules | 4 attention (v1) → 7 all-linear (v2 pending) |
| Merged weights | Yes |
| Quantisations | Q4_K_M (1.9 GB) + Q5_K_M (2.1 GB) + Q8_0 (3.3 GB) |
| Framework | Unsloth + TRL |
| License | Apache 2.0 |

## Quick start — Ollama (one command)

```bash
ollama pull nyxspecter4/kin-cybersecurity-3b-gguf:Q4_K_M
ollama run nyxspecter4/kin-cybersecurity-3b-gguf:Q4_K_M
```

## Quick start — llama.cpp

```bash
llama-server -m kin-sft-lora-Q4_K_M.gguf \
  --port 8099 --ctx-size 8192 --n-gpu-layers 99 \
  --jinja --temp 0.3
```

Then point any OpenAI client at `http://localhost:8099/v1`.

## Quick start — llama-cpp-python

```python
from llama_cpp import Llama

llm = Llama.from_pretrained(
    repo_id="nyxspecter4/kin-cybersecurity-3b-gguf",
    filename="kin-sft-lora-Q4_K_M.gguf",
    n_ctx=4096,
    n_threads=8,
)
out = llm.create_chat_completion(
    messages=[
        {"role": "system", "content": "You are KIN — a verification translator. Translate the security claim into a five-field brief: claim, blast radius, why the model thinks so, how to see it yourself, confidence and what would falsify it. If field 4 is missing, refuse to sound sure. Render at TL;DR, mechanic, and first-principles levels."},
        {"role": "user", "content": "<paste PR diff, review comment, or agent trace here>"},
    ]
)
print(out["choices"][0]["message"]["content"])
```

## Critical: System Prompt

KIN was trained with a specific system prompt. Using a different prompt will degrade quality.

> You are KIN — a verification translator. Translate the security claim into a five-field brief: claim, blast radius, why the model thinks so, how to see it yourself, confidence and what would falsify it. If field 4 is missing, refuse to sound sure. Render at TL;DR, mechanic, and first-principles levels.

## Temperature

Use **temperature 0.3** for security work. Higher temperatures produce plausible-looking but incorrect CVE numbers and tool names.

## v2 Status (Oct 13, 2026)

The v2 retrain corpus is folded and stamped (executed Oct 14, 2026): 2,512 pairs (1,637 canonical + 875 staged, 184 CWE families) → 1,171 on-domain receipt-bearing + 1,341 quarantined, every kept row carrying a machine-checkable process receipt. The
first executed eval of v1 (Oct 12, 2026, the estate's own harness) scored
v1 at 40/60 vs base Qwen2.5-3B zero-shot at 47/60 — v2 must beat base before
these quants are refreshed. This GGUF is the fabric's first inference tier:
every product runs it locally via Ollama before touching the network.

## What it sounds like on your laptop

**2:30 a.m., one terminal, no GPU fan in sight.** You paste a bounty writeup
into the Ollama prompt and KIN answers the only question that matters:
*can I check this myself in five minutes?* When the writeup ships a payload
and a URL, you get a five-field brief with the check baked in. When it ships
only fluent jargon, you get the same brief with the honest line instead:

> No replayable check provided — cannot confirm severity.

Offline, one command, no API key — the same gate the cloud model enforces,
running next to your notes.

## Where you will meet this model

This GGUF is the first inference tier of the KIN Inference Fabric — the
"Apprentice" mentor panel on every BOUNTYWARZ 3D drone-recon range (London,
San Francisco, the Persian Gulf) and the Nemeton mission briefer call it
locally through Ollama before anything touches the network. No install of
your own? Try the hosted
[demo Space](https://huggingface.co/spaces/nyxspecter4/kin-cybersec) or the
[gateway Space](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway)
— same model, same gate.

## Sibling artifacts

| Type | ID | What |
|------|-----|------|
| Model (3B merged) | [`nyxspecter4/kin-cybersecurity-3b`](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b) | Canonical 3B with merged safetensors |
| Dataset (DPO) | [`nyxspecter4/kin-cyber-dpo-v2`](https://huggingface.co/datasets/nyxspecter4/kin-cyber-dpo-v2) | 1,171 receipt-bearing DPO pairs |
| Space (demo) | [`nyxspecter4/kin-cybersec`](https://huggingface.co/spaces/nyxspecter4/kin-cybersec) | Live Gradio inference demo |
| Space (gateway) | [`nyxspecter4/bountywarz-gateway`](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway) | Inference fallback tier (/healthz + /kin/chat) |

## License

Apache 2.0

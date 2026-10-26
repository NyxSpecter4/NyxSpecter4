---
title: KIN Verification Translator
emoji: "🛡️"
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: "6.26.0"
app_file: app.py
pinned: true
license: apache-2.0
tags:
  - cybersecurity
  - verification
  - security
  - code-review
  - bug-bounty
  - PR-review
  - vulnerability
  - threat-intelligence
  - DFIR
  - MITRE-ATT&CK
  - OWASP
models:
  - nyxspecter4/kin-cybersecurity-3b
  - nyxspecter4/kin-cybersecurity-3b-gguf
datasets:
  - nyxspecter4/kin-cyber-dpo-v2
---

# 🛡️ KIN — Verification Translator

Translate machine-generated security claims into leveled briefs with replayable evidence checks.

**No check, no confidence.**

## How It Works

1. **Input:** PR diff, review thread, agent trace, or bounty writeup
2. **Output:** Five-field brief at three levels (TL;DR, mechanic, first principles)
3. **Gate:** No "critical" without a replayable check
4. **Seal:** Hash of diff + brief + test command (planned for v2)

## The Five Fields

1. **Claim** — what is alleged
2. **Blast radius** — what breaks if true
3. **Why the model thinks so** — the generator: CWE, invariant, missing check
4. **How to see it yourself** — PoC, failing test, command
5. **Confidence and what would falsify it**

## Flagship Product Integration

* **Interactive Simulator**: [BountyWarz: Persian Gulf Intercept](https://bountywarz.com/gulf) (`bountywarz.com`)
* **Google Play Mobile Release**: [`com.bountywarz.gate`](https://play.google.com/store/apps/details?id=com.bountywarz.gate) (v1.1.11 · Target SDK 36)
* **Codebase & Engine**: [`NyxSpecter4/bountywarz`](https://github.com/NyxSpecter4/bountywarz)
* **Inference Fabric**: every surface above calls KIN through `packages/kin-fabric` — local Ollama → HF router → [bountywarz-gateway](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway) Space

## Ecosystem Models & Datasets

* **Canonical Model:** [`nyxspecter4/kin-cybersecurity-3b`](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b) (3B, merged weights)
* **GGUF Runtime:** [`nyxspecter4/kin-cybersecurity-3b-gguf`](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b-gguf)
* **Training Corpus:** [`nyxspecter4/kin-cyber-dpo-v2`](https://huggingface.co/datasets/nyxspecter4/kin-cyber-dpo-v2) (1,171 receipt-bearing DPO pairs)
* **Gateway Space:** [`nyxspecter4/bountywarz-gateway`](https://huggingface.co/spaces/nyxspecter4/bountywarz-gateway) (fabric fallback tier, `/healthz` + `/kin/chat`)

## Production Tech Stack

* **Edge Delivery**: Vercel (Edge Functions, CDN, DNS)
* **Relational & RLS Database**: Supabase (PostgreSQL 16)
* **State Replication**: Redis Upstash (Sub-millisecond room synchronization)
* **CI/CD & Builds**: GitHub Actions (Automated AAB/APK signing & testing)
* **Voice & Avatars**: ElevenLabs (Radio voice banter) + Simli (Real-time AI briefings)
* **Model Inference & Training**: Hugging Face (Hub & Spaces) + Together AI + Replicate (Weekly training cadence)

## Quick CLI

```bash
ollama pull nyxspecter4/kin-cybersecurity-3b-gguf:Q4_K_M
ollama run nyxspecter4/kin-cybersecurity-3b-gguf:Q4_K_M
```

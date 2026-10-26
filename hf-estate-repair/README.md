# HF ESTATE REPAIR KIT — staged 2026-10-26 (Monday priority)

Bounded queue, per the Lean Master Commands. This kit does **not** touch
Command 1 (SELL `kin-security-scan` — Shipping Dock stays RED until the zip
is attached). It exists so that when the Captain rotates an HF write token,
the four audited defects are a **one-command fix**, not a research project.

Evidence base: the Oct 26 adversarial audit (live, read-only probing) +
Film-Room ruling. Every finding below was verified against live HF surfaces
this session; nothing in this kit is speculative.

## What it fixes (audited defects)

| Target | Severity | Defect (verified live Oct 26) | Fix shipped here |
| --- | --- | --- | --- |
| Space `nyxspecter4/bountywarz-gateway` | **P0 BROKEN** | `CONFIG_ERROR`; Dockerfile `git clone`s a private repo → unbuildable by construction | One-file image from `kin-deploy/hf-gateway` main: `Dockerfile` (no clone), `server.cjs` (healthz + /kin/chat fallback, canonical model ID), `README.md` (full `sdk: docker` front-matter) |
| Space `nyxspecter4/kin-cybersec` | **P1 BROKEN** | Live `app.py` loads dead ID `kin-sft-lora`, wrong persona ("bug bounty mentor"), no five-field gate, dead link to `cybersecurity-sovereign-ai-suite-6aa052b7430dcf771e2b0abb` | Staged `kin-deploy/space-card` `app.py` (verification-translator persona, five-field brief gate, three altitudes, seal, gr.Examples, no model loading, no dead links) + `requirements.txt` + README (already carries the correct 1,171 count — no patch needed) |
| Model `nyxspecter4/kin-cybersecurity-3b` | P2 | Leaked `<!-- deploy-trigger... -->` HTML comment; `zero_leak_verified: true` unbacked claim in manifest; `GGUF_PROGRESS.md` references dead `nyxspecter4/kin-sft-lora-gguf` | README = staged `kin-deploy/model-card/README.md` (comment stripped; v1 historical 1,635 rows deliberately kept — owner decision); manifest = staged `kin-deploy/model-card/gguf_manifest.json` (claim removed, rename history explained via honesty notes); GGUF_PROGRESS.md dead id fixed |
| Model `nyxspecter4/kin-cybersecurity-3b-gguf` | P2 | Quickstarts reference nonexistent `kin-cybersecurity-3b-Q4_K_M.gguf` (actual file: `kin-sft-lora-Q4_K_M.gguf`) ×2 | README = staged `kin-deploy/gguf-card/README.md` (filename fixed; sibling table carries 1,171) |
| Dataset `nyxspecter4/kin-cyber-dpo-v2` | P3 | Files table omits `release-closure-receipt.json` | README = staged `kin-deploy/dataset-card/README.md` (closure-receipt row present) |
| Dataset `nyxspecter4/kinetigor-dpo-cybersec-v7-dataset` | **P1 COMPROMISED** | ~10 literal Null Origin flags + Supabase UUIDs + IG GraphQL hash. Kit v1 patched only one string | **This kit does NOT fix it** — fixed by the published redaction kit v2 at `kin-v7-flag-redaction/` (sibling folder in this repo) |

`kin-cyber-dpo-v2` passes clean — the one green artifact. No changes to its
dataset files, only the README table row.

## Contents

```
hf-estate-repair/
  README.md                 <- this file
  repair_hf_estate.py       <- one-command pusher (dry-run by default)
  files/
    spaces/bountywarz-gateway/   README.md, Dockerfile, server.cjs
    spaces/kin-cybersec/          README.md, app.py, requirements.txt
    models/kin-cybersecurity-3b/  README.md, gguf_manifest.json, GGUF_PROGRESS.md
    models/kin-cybersecurity-3b-gguf/README.md
    datasets/kin-cyber-dpo-v2/README.md
```

**Payload provenance (single source of truth = bountywarz main, verified fetch
Oct 26):** the three gateway files and the `kin-cybersec` trio are
byte-identical to `kin-deploy/hf-gateway/` and `kin-deploy/space-card/`; the
model, gguf, and dataset READMEs and the manifest are byte-identical to the
staged `kin-deploy/model-card/`, `kin-deploy/gguf-card/`, and
`kin-deploy/dataset-card/` files (content invariants asserted: no
deploy-trigger comment, no `zero_leak_verified` key, correct quickstart
filename, closure-receipt row present). Only `GGUF_PROGRESS.md` is a patched
live file (one dead-id fix) — it is not covered by the deploy chain. This kit
is therefore a pure transport alternative to the deploy chain
(`deploy_kin.py` / `direct-hf-push.py`): same payloads, no checkout required.

## Run it

```bash
python3 repair_hf_estate.py            # dry-run: preflight-check all 11 files, print plan
python3 repair_hf_estate.py --push      # whoami pre-check, then upload to the 5 targets
```

`--push` requires an HF token with **write-repos** scope (`HF_TOKEN` env or
interactive prompt). The Vibe seat is read-only — only the Captain can push.

## Owner decisions that need Kiran (not automatable)

1. **v7 license**: do NOT assert a license on the v7 dataset until the
   published redaction kit v2 (`kin-v7-flag-redaction/`) has run and the
   diffs have been eyeballed.
2. **The undocumented ~1.9 GB GGUF sitting in the v7 model repo root** —
   document it in the README or delete it; it inflates the repo and confuses
   buyers. Captain's call.
3. **Space README "Production Tech Stack" section** (staged space-card) makes
   claims that need owner review before the demo goes live.

## Not in this kit

- Creative gateway README variant — stays in the canvas. Ship-what-exists.
- Any license, tag, or visibility changes.
- Git-history scrubbing (see the redaction kit docstring for the escalation path).

## Known cosmetic defect, deliberately not patched here

`server.cjs` line in the final router (`if (!req.method !== 'OPTIONS' && ...)`)
is lint-wrong (`!req.method` is always false), but behaves correctly because
OPTIONS is fully handled earlier. Kept byte-identical to
`kin-deploy/hf-gateway` on main; clean it up in the next gateway iteration,
not in this repair push.

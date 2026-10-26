---
title: BountyWarz Gateway
emoji: 🛡️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# bountywarz-gateway — KIN gateway Space (fabric inference tier T3)

Self-contained docker Space. It is the third inference tier of the KIN
Inference Fabric (packages/kin-fabric): when local Ollama (T1) and the HF
router (T2) are both unavailable, every Kinetigor surface falls back to this
Space. It is also the ops relay home for the Discord solver router seam.

The previous image cloned the private bountywarz repo at build time with no
credentials — it could never build. This image copies one zero-dependency
Node file and nothing else. Source of truth: kin-deploy/hf-gateway/ on
NyxSpecter4/bountywarz main.

## Contract (VERIFIED against packages/kin-fabric buildGatewayRequest /
normalizeResponse / probeTiers; v1.1.0 stress suite 17/17 green, Oct 13 2026)

- GET /healthz — 200 JSON liveness. This is the fabric T3 definitive probe.
  Always 200 while the service is up; reports hf_router_configured and
  rate_limit_per_min so the storefront can show honest status.
- GET /health — alias of /healthz (container healthcheck).
- GET / — service info + contract summary.
- POST /kin/chat — body { model, messages, temperature, max_tokens? };
  replies { ok, text, model, upstream_status, upstream_model, usage } on
  success. Fabric reads .text first (normalizeResponse gateway branch).
- POST /v1/chat/completions — OpenAI-style alias, same upstream, shaped as a
  chat.completion for OpenAI-compatible consumers.

Error behavior (fail-closed, JSON always): 400 invalid messages or bad JSON;
401 when GATEWAY_API_KEY is set and missing/wrong; 405 method_not_allowed
with an Allow header on wrong method; 413 payload_too_large when the body
exceeds MAX_BODY_BYTES (default 256 KB); 429 rate_limited per IP when the
sliding-window limit (RATE_LIMIT_PER_MIN, default 60, 0 disables) is hit,
with retry_after_s; 503 hf_token_missing when the HF_TOKEN secret is absent;
502 hf_router_error with upstream_status when the router rejects the call.

## Secrets and tuning (Space settings)

- HF_TOKEN — required for inference. Router access to
  nyxspecter4/kin-cybersecurity-3b. Without it the Space stays alive and
  reports hf_router_configured: false; /kin/chat answers 503 with a clear
  error instead of pretending.
- GATEWAY_API_KEY — optional. When set, callers must send
  Authorization: Bearer key or x-api-key: key.
- RATE_LIMIT_PER_MIN — per-IP POST request limit per 60s sliding window.
  Default 60; 0 disables. healthz is never rate-limited.
- MAX_BODY_BYTES — request body cap. Default 262144 (256 KB); larger
  bodies get a clean 413 instead of a dropped connection.

## Rules inherited

One thing per thing: this service owns transport only. Brief formatting
belongs to @bountywarz/dpo-corpus, capture to kin-fabric, training to
kin-train, deploy to kin-deploy. Banned-terminology and status-claim rules
apply: every claim above is labeled. Deployed by
.github/workflows/deploy-kin-to-hf.yml via HF_TOKEN; push to
kin-deploy/hf-gateway/ on main to ship the next version.

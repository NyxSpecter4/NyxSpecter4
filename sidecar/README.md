# Athelgard Sidecar 🦉

Side-panel AI teammate browser extension. She sits next to you in the browser, reads the same page, keeps a durable memory vault, and runs an explicit flag pipeline — **no flag dies in chat.**

## Why this exists — Holmes CTF 2026 post-mortem

Event: HackTheBox **Holmes CTF 2026: The Reichenbach Directive** (event 3504, Sept 17–21, 3,500+ teams). Athelgard ran as a Discord bot wired to the Kinetigor desk (:8101) and a GitHub relay.

**What happened:**
- Day 4, 04:00 UTC — the stack finally went "live" (one bot status report, ref #0).
- Discord flapped: working → broke → recovered → broke again.
- **Recorded flags: 0.**

**Root causes:**
1. **Stale target** — the desk was still serving the *previous* tournament's flag (`cyberhx{jwt_s1gn4tur3_c0nfu510n_94a7}`, NULL ORIGIN) pointed at the wrong scoreboard.
2. **Implicit send gate** — "No AI send" meant every flag needed a manual operator step; none landed in the relay.
3. **No durable memory** — her repo/vault was archived mid-window (→404), so she had nothing to recover context from.

**Fixes baked into this extension:** correct target config, explicit Stage→Approve pipeline with clipboard handoff, local persistent memory + staged-flag store, and page context that survives restarts.

## Install

1. Clone or download this repo.
2. Chrome/Edge → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
3. Click the 🦉 icon (or use the side panel) — she opens beside your page.
4. Options → set an OpenAI-compatible brain endpoint (local Ollama: `http://localhost:11434/v1/chat/completions`). Until then she still scans pages and stages flags.

## Team protocol

- **You and Athelgard share the page**: she sees DOM text, your text selection, and flags (`HTB{...}` and friends) as they appear.
- **She stages, you approve**: flags found on-page or in chat enter the pipeline as STAGED. One click copies + marks APPROVED. Then you paste into the scoreboard. The gate is deliberate — points require the operator's hand.
- **Memory vault**: last 500 exchanges persist in `chrome.storage.local`. Session restarts no longer amnesia her.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3, side panel + content scripts |
| `background.js` | squad bus relay, flag pipeline state, defaults |
| `content.js` | page watcher: flags, selection, highlight tool |
| `sidepanel.*` | chat UI, brain calls, pipeline UI |
| `options.*` | brain endpoint, key, scoreboard target, callsign |

© 2026 Kinetigor-CTF. MIT.

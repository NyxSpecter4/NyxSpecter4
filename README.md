<div align="center">

# 🜃 THE NEMETON

**Athelgard** — an adaptive training world where the curriculum *is* the world.

*The guide says "I don't know" at the edge of its knowledge. It never improvises and it never inflates.*

**8 live sites · 22 repositories · one grove**

</div>

---

## The thesis

Most training platforms hand you a course and a percentage. Athelgard hands you a **world** and a **judge**.

You take real work — breach a target, fly a recon drone, write the exploit chain, build the world — and you get weighed on **receipts**. The judge is **Maat**: PASS only with real proof, FAIL with the lesson written into the note. Nothing goes green for looking green. A false receipt is worse than no receipt at all.

Athelgard is the guide. The **Nemeton** is the grove the work grows in — the world, the desk, the engine, the ledger.

---

## 🔴 Live

| Site | What it is | Verified title |
|------|-----------|----------------|
| **[bountywarz.com](https://bountywarz.com)** | BountyWarz — drone recon, breach & capture across 18 nations. Learn real cybersecurity mapped to certifications, earn credits. | *BountyWarz — London Drone Recon / Breach & Capture Across 18 Nations* |
| **[kinetigor.com](https://kinetigor.com)** | Kinetigor Desk — grand multiplayer workspace & comms bus. The room where cards are forged, dealt and judged. | *Kinetigor Desk — Grand Multiplayer Workspace & Comms Bus* |
| **[roostandruin.com](https://roostandruin.com)** | Roost and Ruin — a playable world. | *ROOST AND RUIN — Play* |
| **[hackersjourney.com](https://hackersjourney.com)** | KIN Academy — a virtual campus for the careers created when industries collide. | *KIN Academy — A Virtual Campus for Convergence Careers* |
| **[makothoth.dev](https://makothoth.dev)** | MAKOTHOTH — VR math showcase. | *MAKOTHOTH — VR Math Showcase* |
| **[protocolbreach.com](https://protocolbreach.com)** | Protocol Breach — 10-minute tactical cyber combat. Draft a loadout, hack buildings, capture flags. | *PROTOCOL BREACH — Tactical Cyber Arena* |
| **[athelgard.io](https://athelgard.io)** | Athelgard — stop the $340,000 email. Prove it to your insurer. | *Athelgard — Stop the $340,000 Email. Prove it to your insurer.* |
| **[oceanpulse.vercel.app](https://oceanpulse.vercel.app)** | OceanPulse — 3D marine wildlife MMO. Document ocean life, build the sighting collection. | *OceanPulse* |

---

## 🗺️ The grove — where each thing lives

### The world engine — `bountywarz`
**[bountywarz](https://github.com/NyxSpecter4/bountywarz)** — the monolith the whole grove grows from. 40,243 tracked paths across `packages/` (agents · cognitive · harness · products · worlds), `worlds/`, `api-handlers/`, `relay/`, `www/` and `domain-configs/`. The game, the mentor, the cognitive core (BKT + IRT + SRS judging) and the DeepSeek harness all live here.

Mapped in [`packages/ARCHITECTURE.md`](https://github.com/NyxSpecter4/bountywarz/blob/master/packages/ARCHITECTURE.md) and the grove's symbolic canon in [`packages/NEMETON-CANON.md`](https://github.com/NyxSpecter4/bountywarz/blob/master/packages/NEMETON-CANON.md).

### The desk — governance & judging
| Repo | Role |
|---|---|
| **[kinetigor-desk-api](https://github.com/NyxSpecter4/kinetigor-desk-api)** | The Desk server — missions, gauntlet stages, evidence review, leaderboard. |
| **[bountywarz-ops](https://github.com/NyxSpecter4/bountywarz-ops)** *(archived)* | Mission control — comms bus, sync enforcement, audit trail, HF/GGUF model pipeline. |
| **[proxy-dealmaker](https://github.com/NyxSpecter4/proxy-dealmaker)** *(archived)* | Monk harness — docker runner + reproducible bounty instances. |

### Agent tooling — the hands
| Repo | Role |
|---|---|
| **[monk-plugin](https://github.com/NyxSpecter4/monk-plugin)** | Monk plugin for AI coding agents — hooks, diagnostics, MCP wiring across Codex / Claude / Cursor / Antigravity. |
| **[kin-security-plugin](https://github.com/NyxSpecter4/kin-security-plugin)** | KIN cybersecurity plugin + MCP server (multi-agent), backed by the KIN SFT LoRA. |
| **[kin-security-action](https://github.com/NyxSpecter4/kin-security-action)** | GitHub Action that reviews pull requests for security defects. |
| **[athelgard-cli](https://github.com/NyxSpecter4/athelgard-cli)** *(archived)* · **[athelgard-vscode](https://github.com/NyxSpecter4/athelgard-vscode)** *(archived)* | Earlier agent surfaces — consolidated into the monolith. |

### Worlds & products
| Repo | World |
|---|---|
| **[oceanpulse](https://github.com/NyxSpecter4/oceanpulse)** | 3D marine wildlife MMO — real sanctuaries, sighting collections. |
| **[wanderquest](https://github.com/NyxSpecter4/wanderquest)** | Interactive branching manga — your choices shape reality. Academy campus now at hackersjourney.com. |
| **[thalia-crochet](https://github.com/NyxSpecter4/thalia-crochet)** | Craft studio with a jury-critique API — deploys Roost & Ruin. |
| **[athelgard](https://github.com/NyxSpecter4/athelgard)** *(archived)* | The site/app product line, consolidated. |
| **[camel-racing](https://github.com/NyxSpecter4/camel-racing)** *(archived)* | Camel racing betting game — retired prototype. |
| **[wild-tracker](https://github.com/NyxSpecter4/wild-tracker)** *(archived)* | Animal tracker — retired prototype. |

### Domain seats

Four domains are held by name-holder repositories while the live sites are served from the grove:
**[protocol-breach](https://github.com/NyxSpecter4/protocol-breach)** · **[hackers-journey](https://github.com/NyxSpecter4/hackers-journey)** · **[roost-and-ruin](https://github.com/NyxSpecter4/roost-and-ruin)** · **[gais-games](https://github.com/NyxSpecter4/gais-games)**

---

## ⚖️ The rule of this grove

```
MINE   before any delete — every retired repo is mirrored to a vault first
FOLD   before any archive — duplicates are folded, then closed, never dropped
VERIFY on a live system before a claim is ever written down
JUDGE  with proof or not at all — Maat takes the receipt, never the promise
```

**Archived here means folded, not thrown away.** Every closed repository —
[`bountywarz-gemini`](https://github.com/NyxSpecter4/bountywarz-gemini) (duplicate of the booster engine, 91 files folded),
[`Oceanic-archived`](https://github.com/NyxSpecter4/Oceanic-archived) (duplicate of OceanPulse) —
has its history mined into a local vault before it was sealed. Nothing in this grove is deleted to look tidy.

---

<div align="center">

*Built by Captain (NyxSpecter4) with the Nemeton — the world is the curriculum.*

</div>

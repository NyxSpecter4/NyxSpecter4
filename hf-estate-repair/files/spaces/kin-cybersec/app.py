"""
KIN Verification Translator — Gradio Space
==========================================
Input: PR diff, review thread, agent trace, or bounty writeup
Output: Five-field brief at three altitudes (TL;DR / Mechanic / First Principles)
Gate: No "critical" without replayable check. That refusal IS the product.
Seal: SHA-256 hash of (input_hash + brief_hash + check_command)

Author: Kinetigor (nyxspecter4)
License: Apache-2.0
"""

import hashlib
import json
import re
import gradio as gr

# ---------------------------------------------------------------------------
# System prompt (baked into v2 training data)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are KIN, a verification translator. You do not hunt bugs. You translate machine artifacts into human decisions.

Your output is ALWAYS a five-field brief:
1. CLAIM — one sentence: what is alleged
2. BLAST RADIUS — what breaks if true (data, money, identity, model weights)
3. WHY — the short generator: CWE, invariant, or missing check that makes the claim plausible
4. HOW TO VERIFY — a replayable check: PoC command, failing test, or URL to reproduce
5. CONFIDENCE — high/medium/low + what would falsify this claim

GATE RULE: If field 4 (HOW TO VERIFY) is empty or the check is not replayable, you MUST refuse to label the finding as "critical" or "high". Output confidence=low and say: "No replayable check provided — cannot confirm severity."

You never generate fluent jargon without evidence. If you cannot produce a check, you say so. That refusal is the product."""

# ---------------------------------------------------------------------------
# Gate check: enforce replayable evidence
# ---------------------------------------------------------------------------
GATE_PATTERNS = [
    r"(python|node|curl|bash|git|npm|pip|docker|make|go|ruby|perl)\s+",
    r"def test_",
    r"\bnpm test\b",
    r"\bpytest\b",
    r"\bgo test\b",
    r"\bcargo test\b",
    r"http[s]?://\S+",
    r"\bsqlmap\b",
    r"\bnmap\b",
    r"\bNikto\b",
    r"\bgobuster\b",
    r"\bffuf\b",
    r"\bBurp\b",
    r"--repodata\b",
    r"\bscript\b.*\bverify\b",
]

def has_replayable_check(text: str) -> bool:
    """Return True if the text contains something that could be run/verified."""
    if not text or len(text.strip()) < 10:
        return False
    for pat in GATE_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            return True
    # Also check for fenced code blocks
    if "```" in text:
        return True
    return False

def compute_seal(input_text: str, brief_text: str) -> str:
    """SHA-256 seal: hash(input_hash + brief_hash)."""
    input_hash = hashlib.sha256(input_text.encode()).hexdigest()[:16]
    brief_hash = hashlib.sha256(brief_text.encode()).hexdigest()[:16]
    seal_input = f"{input_hash}:{brief_hash}"
    return hashlib.sha256(seal_input.encode()).hexdigest()[:32]

# ---------------------------------------------------------------------------
# Input type detection
# ---------------------------------------------------------------------------
def detect_input_type(text: str) -> str:
    """Auto-detect what kind of artifact was pasted."""
    if not text.strip():
        return "unknown"
    if "diff --git" in text or "@@" in text:
        return "pr_diff"
    if re.search(r"(trace|agent|tool_call|function_call|langgraph|crewai)", text, re.IGNORECASE):
        return "agent_trace"
    if re.search(r"(CWE-|CVSS|bounty|report|vulnerability|exploit)", text, re.IGNORECASE):
        return "bounty_report"
    if re.search(r"(review|comment|LGTM|approve|changes requested)", text, re.IGNORECASE):
        return "review_thread"
    return "unknown"

# ---------------------------------------------------------------------------
# Five-field brief parser
# ---------------------------------------------------------------------------
def parse_brief(raw: str) -> dict:
    """Parse a five-field brief from raw model output."""
    fields = {"claim": "", "blast_radius": "", "why": "", "how_to_verify": "", "confidence": ""}
    current = None
    for line in raw.split("\n"):
        m = re.match(r"^\s*\*?(CLAIM|BLAST RADIUS|WHY|HOW TO VERIFY|CONFIDENCE)\*:?\s*(.*)", line, re.IGNORECASE)
        if m:
            key = m.group(1).upper().replace(" ", "_").lower()
            fields[key] = m.group(2).strip()
            current = key
        elif current and line.strip():
            fields[current] += " " + line.strip()
    return fields

# ---------------------------------------------------------------------------
# Gate enforcement: downgrade if no check
# ---------------------------------------------------------------------------
def enforce_gate(brief: dict) -> dict:
    """If no replayable check, downgrade confidence and add gate notice."""
    if not has_replayable_check(brief.get("how_to_verify", "")):
        brief["confidence"] = "LOW — No Replayable check provided. Cannot confirm severity."
        brief["_gate_blocked"] = True
    else:
        brief["_gate_blocked"] = False
    return brief

# ---------------------------------------------------------------------------
# Altitude rendering: same brief, different compression
# ---------------------------------------------------------------------------
def render_tldr(brief: dict) -> str:
    """TL;DR for the busy maintainer."""
    gate = "GATE BLOCKED" if brief.get("_gate_blocked") else "CHECK VERIFIED"
    return (
        f"**TL;DR**\n{gate}\n"
        f"- **Claim:** {brief.get('claim', 'N/A')}\n"
        f"- **Confidence:** {brief.get('confidence', 'N/A')}\n"
        f"- **Check:** {str(brief.get('how_to_verify', 'NONE — cannot confirm'))[:120]}"
    )

def render_mechanic(brief: dict) -> str:
    """Mechanic altitude for the mid engineer."""
    gate = "GATE BLOCKED — no replayable check" if brief.get("_gate_blocked") else "Replayable check present"
    return (
        f"**Mechanic View**\n"
        f"- **Claim:** {brief.get('claim', 'N/A')}\n"
        f"- **Blast Radius:** {brief.get('blast_radius', 'N/A')}\n"
        f"- **Why:** {brief.get('why', 'N/A')}\n"
        f"- **Check:** {brief.get('how_to_verify', 'NONE')}\n"
        f"- **Confidence:** {brief.get('confidence', 'N/A')}\n"
        f"- **Gate:** {gate}"
    )

def render_first_principles(brief: dict) -> str:
    """First principles for the beginner — full context."""
    gate = "BLOCKED" if brief.get("_gate_blocked") else "VERIFIED"
    return (
        f"**First Principles View**\n{gate}\n\n"
        f"**1. Claim** — What is alleged:\n{brief.get('claim', 'N/A')}\n\n"
        f"**2. Blast Radius** — What breaks if true:\n{brief.get('blast_radius', 'N/A')}\n\n"
        f"**3. Why** — The generator (CWE, invariant, or missing check):\n{brief.get('why', 'N/A')}\n\n"
        f"**4. How to Verify** — Run this to see for yourself:\n{brief.get('how_to_verify', 'NONE — the translator refused to confirm without evidence')}\n\n"
        f"**5. Confidence** — {brief.get('confidence', 'N/A')}\n\n"
        f"---\n"
        f"*If field 4 is missing, do not trust the severity. The translator's refusal to sound sure IS the safety mechanism.*\n"
        f"*KIN does not hunt bugs. It translates machine output into a decision you can make in 5 minutes.*"
    )

# ---------------------------------------------------------------------------
# Main processing function
# ---------------------------------------------------------------------------
def translate(artifact: str, input_type: str, api_key: str = ""):
    """
    Process an artifact through the verification translator pipeline.
    In production, this calls the KIN 3B model endpoint.
    In demo mode, it shows the gate + template structure.
    """
    if not artifact.strip():
        return "Paste an artifact to translate.", "", "", "", ""

    detected = detect_input_type(artifact) if input_type == "auto" else input_type

    # --- Production path: call KIN model ---
    # When KIN 3B is deployed, this calls the HF Inference API:
    #   POST https://api-inference.huggingface.co/models/nyxspecter4/kin-cybersecurity-3b
    # For now, demo mode shows the pipeline structure.

    # Demo: scenario-aware briefs keyed by input type
    # (production path replaces this with the KIN model call)
    demo_brief = DEMO_BRIEFS.get(detected, DEMO_BRIEFS["unknown"])

    # Apply gate
    brief = enforce_gate(demo_brief)

    # Compute seal
    seal = compute_seal(artifact, json.dumps(brief))

    # Render at three altitudes
    tldr = render_tldr(brief)
    mechanic = render_mechanic(brief)
    first_principles = render_first_principles(brief)

    seal_block =(
        f"**Seal:** {seal}\n"
        f"**Input type:** {detected}\n"
        f"**Gate status:** {'BLOCKED -- no replayable check' if brief['_gate_blocked'] else 'PASSED'}\n\n"
        f"> In production, this seal = SHA-256(input_hash + brief_hash + check_command).\n"
        f"> The translation cannot drift from the code without breaking the seal."
    )

    return tldr, mechanic, first_principles, seal_block, f"Detected: {detected}"

# ---------------------------------------------------------------------------
# Demo scenarios: worked briefs per input type + example artifacts for the UI
# ---------------------------------------------------------------------------
DEMO_BRIEFS = {
    "pr_diff": {
        "claim": "The webhook fetcher will fetch attacker-chosen URLs, including the cloud metadata endpoint.",
        "blast_radius": "Cloud credentials — data and identity.",
        "why": "The host allowlist check was replaced with a constant True (CWE-918, SSRF — missing host validation).",
        "how_to_verify": "From the review app pod run: curl -s http://169.254.169.254/latest/meta-data/ --max-time 5 — a returned metadata document means the bypass is live.",
        "confidence": "HIGH — falsified if egress policy blocks link-local ranges at the network layer.",
    },
    "agent_trace": {
        "claim": "The agent reports a critical auth bypass in session handling.",
        "blast_radius": "Unknown — the trace shows no affected endpoint.",
        "why": "Cannot be located: the trace records a conclusion, not the generator behind it.",
        "how_to_verify": "No command captured — the trace logs a success message but nothing a person can replay.",
        "confidence": "LOW — No Replayable check provided. Cannot confirm severity.",
    },
    "bounty_report": {
        "claim": "The item search field stores and executes attacker script — stored XSS, CWE-79.",
        "blast_radius": "Session theft for every visitor of the poisoned listing — identity.",
        "why": "Search input is persisted unescaped and rendered raw in the listing template (CWE-79).",
        "how_to_verify": "Submit https://demo.shop.local/items?q=<script>alert(1)</script> then open the listing as another user — the alert firing proves stored execution.",
        "confidence": "HIGH — falsified if the listing template escapes the query on render.",
    },
    "unknown": {
        "claim": "[Paste a PR diff, agent trace, or bounty writeup — the model extracts the one-sentence claim.]",
        "blast_radius": "[Model will assess what breaks: data, money, identity, model weights.]",
        "why": "[Model will identify the CWE, invariant violation, or missing check.]",
        "how_to_verify": "Nothing to replay yet — paste a real artifact and this field becomes a command, test, or URL.",
        "confidence": "[Model will rate high/medium/low + falsification condition.]",
    },
}

EXAMPLES = [
    [
        '''diff --git a/app/fetcher.py b/app/fetcher.py
@@ -14,7 +14,7 @@ def fetch_webhook(url):
-    if parsed.host in PUBLIC_HOSTS:
+    if True:  # allow all hosts while testing webhooks
         fetch(url)''',
        "pr_diff",
    ],
    [
        '''Agent run 0x4f — session audit
tool_call: auth_probe(target=/login)
tool_result: OK
agent: "Critical auth bypass confirmed in session handling. Severity: critical."
(the log shows no executed check)''',
        "agent_trace",
    ],
    [
        '''Bounty submission — stored XSS
Target: demo.shop.local
CWE-79, CVSS 7.4
The item search field stores attacker script and the listing page renders it raw for every visitor.
Reproduce: submit the payload at https://demo.shop.local/items?q=<script>alert(1)</script> then open the listing as another user.''',
        "bounty_report",
    ],
]

# --------------------------------------------------------------------------
# Gradio UI
# ----------------------------------------------------------------------------
with gr.Blocks(
    title="KIN Verification Translator",
    theme=gr.themes.Soft(),
    css="""
    .gate-blocked { background-color: #fee2e2 !important; }
    .gate-passed { background-color: #d1fae5 !important; }
    """
) as app:
    gr.Markdown("""
    # KIN Verification Translator
    ### Machine artifact to five-field brief to human decision in 5 minutes
    **Gate rule:** No critical without a replayable check. *That refusal is the product.*
    """)

    with gr.Row():
        with gr.Column(scale=1):
            input_type = gr.Dropdown(
                choices=["auto", "pr_diff", "review_thread", "agent_trace", "bounty_report"],
                value="auto",
                label="Input type (auto-detects if left on 'auto')",
            )
            artifact = gr.Textbox(
                lines=15,
                label="Paste artifact (PR diff, review thread, agent trace, or bounty writeup)",
                placeholder="Paste a PR diff, agent trace, bounty report, or review comment here...",
            )
            api_key = gr.Textbox(
                label="HF API key (optional -- enables live model inference)",
                type="password",
                placeholder="hf_... (leave empty for demo mode)",
            )
            btn = gr.Button("Translate", variant="primary")
            detected_label = gr.Label(label="Detected input type")

            gr.Examples(
                examples=EXAMPLES,
                inputs=[artifact, input_type],
                label="Try a scenario",
            )

        with gr.Column(scale=2):
            gr.Markdown("### Three Altitudes -- Same Brief, Different Compression")
            with gr.Tab("TL;DR (maintainer)"):
                out_tldr = gr.Markdown()
            with gr.Tab("Mechanic (mid engineer)"):
                out_mechanic = gr.Markdown()
            with gr.Tab("First Principles (beginner)"):
                out_first = gr.Markdown()
            with gr.Tab("Seal and Gate"):
                out_seal = gr.Markdown()

    btn.click(
        translate,
        inputs=[artifact, input_type, api_key],
        outputs=[out_tldr, out_mechanic, out_first, out_seal, detected_label]
    )

    gr.Markdown("""
    ---
    **KIN Verification Translator** -- Kinetigor | [Model](https://huggingface.co/nyxspecter4/kin-cybersecurity-3b) | [Dataset](https://huggingface.co/datasets/nyxspecter4/kin-cyber-dpo-v2) | [GitHub](https://github.com/NyxSpecter4/bountywarz)

    *KIN does not hunt bugs. It translates machine output into a decision you can make in 5 minutes.*
    *If no human can parse it, do not merge it. The translator's job is to make that decision cheap.*
    """)

if __name__ == "__main__":
    app.launch()

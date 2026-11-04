/*
 * The Princetown Packet — Verifier's Run (GAME UI)
 * The UI is presentation ONLY. It can never grant victory: every verdict
 * comes from core/challenges.js via core/game.js; the lens tools are
 * convenience viewers — the judge recomputes everything itself.
 */
(function () {
  "use strict";

  var T = KIN.Trust, C = KIN.Challenges, Game = KIN.Game, V = KIN.Validator, K = KIN.Kernel, F = KIN.FIXTURES;
  var STORE = "kinetigor-game-run-1";
  var state = null;
  var currentStage = null;
  var lastResult = null;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "onclick" || k === "oninput") e[k] = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c !== null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function div(cls, kids) { return el("div", cls ? { class: cls } : null, kids); }
  function mono(s) { return el("span", { class: "mono" }, [s]); }
  function hash(s, n) { return el("span", { class: "hash" }, [s.length > (n || 24) ? s.slice(0, n || 24) + "…" : s]); }
  function badge(v) { return el("span", { class: "badge v-" + v }, [v]); }
  function esc(s) { return s; }
  function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function clearStore() { localStorage.removeItem(STORE); }

  /* ---------------- home ---------------- */

  function renderHome() {
    var main = document.getElementById("main");
    main.innerHTML = "";
    var saved = load();
    main.appendChild(div("home-hero", [
      div("title", ["THE PRINCETOWN PACKET"]),
      div("sub", ["VERIFIER'S RUN · COMPETITIVE CYBER RALLY · COURSE 001"])
    ]));
    main.appendChild(div("panel", [
      el("p", null, ["You are a Rally Verifier. On the moor, nobody is believed — ", mono("records"), " are believed, and only when their seals hold. Five stations stand between you and the sealed dispatch: each one hands you an artifact, and each one accepts ", mono("evidence"), " only."]),
      el("p", null, ["Every judgment you receive — pass, fail, refusal, quarantine — is stamped into a receipt, and every receipt is chained to the one before it by a hash. When the run ends, that chain ", el("i", null, ["is"]), " your proof. Anyone can re-walk it without you."]),
      el("p", { class: "dim small" }, ["There are no save points to game and no button that says trust me. The judge recomputes everything. So can you."])
    ]));
    var nameInput = el("input", { id: "playername", placeholder: "your verifier name", maxlength: "40" });
    if (saved) nameInput.value = saved.player;
    var form = div("panel", [
      el("h2", null, ["Take the warrant"]),
      el("label", { class: "f" }, ["VERIFIER NAME"]),
      nameInput,
      div(null, [
        el("button", {
          class: "primary", style: "margin-top:14px",
          onclick: function () {
            var name = nameInput.value;
            if (!name || !name.trim()) { nameInput.focus(); return; }
            state = saved && saved.player === name.trim() ? saved : Game.newRun(name);
            save();
            currentStage = state.unlocked[state.unlocked.length - 1];
            lastResult = null;
            render();
          }
        }, [saved ? "CONTINUE RUN" : "BEGIN THE RUN"])
      ])
    ]);
    if (saved) {
      form.appendChild(el("button", {
        class: "ghost", style: "margin-top:8px",
        onclick: function () { if (confirm("Abandon the recorded run? The chain of the abandoned run is not preserved.")) { clearStore(); renderHome(); } }
      }, ["abandon recorded run"]));
      form.appendChild(div("small dim", ["a run in progress: " + saved.receipts.length + " receipt(s) recorded"]));
    }
    main.appendChild(form);
    renderRunMeta();
  }

  function renderRunMeta() {
    var rm = document.getElementById("runmeta");
    rm.innerHTML = "";
    if (!state) { rm.appendChild(div(null, ["no active run"])); return; }
    var solvedN = Object.keys(state.solved).length;
    rm.appendChild(div(null, [state.player, " · run ", el("b", null, [state.run_id])]));
    rm.appendChild(div(null, [solvedN + "/5 stations · " + state.receipts.length + " receipts"]));
  }

  /* ---------------- game shell ---------------- */

  function render() {
    renderRunMeta();
    if (!state) { renderHome(); return; }
    var main = document.getElementById("main");
    main.innerHTML = "";
    main.appendChild(renderRail());
    var stageId = currentStage && state.unlocked.indexOf(currentStage) !== -1 ? currentStage : state.unlocked[0];
    main.appendChild(renderStage(C.byId(stageId)));
    if (lastResult && lastResult.judged) main.appendChild(renderVerdict(lastResult));
    if (isComplete()) main.appendChild(renderFinish());
    main.appendChild(renderChainPanel());
  }

  function isComplete() { return C.ORDER.every(function (id) { return state.solved[id]; }); }

  function renderRail() {
    var rail = div("rail");
    C.ORDER.forEach(function (id) {
      var ch = C.byId(id);
      var unlocked = state.unlocked.indexOf(id) !== -1;
      var b = el("button", {
        class: (id === currentStage ? "active " : "") + (state.solved[id] ? "solved" : "") + (!unlocked ? " locked" : ""),
        onclick: unlocked ? function () { currentStage = id; lastResult = null; render(); } : null
      }, [ch.station.replace("STAGE", "ST").replace(" — ", " · ") + (state.solved[id] ? " ✓" : (!unlocked ? " · sealed" : ""))]);
      rail.appendChild(b);
    });
    return rail;
  }

  /* ---------------- stage ---------------- */

  function renderStage(ch) {
    var grid = div("stagegrid");
    var left = div(null);
    var right = div(null);

    left.appendChild(el("h2", null, [ch.station + " — " + ch.title]));
    left.appendChild(div("callout", [el("span", { class: "lab" }, ["BRIEF"]), ch.brief]));
    left.appendChild(div("callout", [el("span", { class: "lab" }, ["YOUR OBJECTIVE"]), ch.objective]));

    /* artifact viewer */
    var art = ch.artifact();
    left.appendChild(div("panel", [el("h2", null, ["ARTIFACT — " + art.title])].concat(renderArtifact(ch, art))));

    /* workbench */
    var wb = div("panel");
    wb.appendChild(el("h2", null, ["EVIDENCE WORKBENCH"]));
    wb.appendChild(el("p", { class: "dim small" }, ["Submit evidence as JSON. The judge recomputes everything from the artifact — the lens and this form carry no authority."]));
    var inputs = {};
    ch.evidence_fields.forEach(function (f) {
      wb.appendChild(el("label", { class: "f" }, [f.key.toUpperCase() + " — " + f.label]));
      var inp = el("input", { placeholder: f.placeholder });
      inputs[f.key] = inp;
      wb.appendChild(inp);
    });
    var msg = div("small dim", []);
    wb.appendChild(el("button", {
      class: "primary", style: "margin-top:14px",
      onclick: function () {
        var evidence = {};
        var parseError = null;
        ch.evidence_fields.forEach(function (f) {
          var v = inputs[f.key].value.trim();
          if (f.key === "liar_records") {
            try { evidence[f.key] = JSON.parse(v || "[]"); } catch (e) { parseError = "liar_records must be a JSON array, e.g. [\"DX-204\"]"; }
          } else evidence[f.key] = v;
        });
        if (parseError) { msg.textContent = parseError; return; }
        lastResult = Game.submit(state, ch.id, evidence);
        save();
        if (lastResult.judged && lastResult.verdict === "PASS" && state.unlocked.length > 1) {
          var next = state.unlocked[state.unlocked.length - 1];
          if (next !== ch.id) currentStage = next;
        }
        render();
      }
    }, ["SUBMIT EVIDENCE"]));
    wb.appendChild(msg);
    left.appendChild(wb);

    /* receipt — claim disclosure (progressive) */
    var claimBox = el("details", null, [
      el("summary", null, ["what the judge is testing (the claim under judgment)"]),
      el("pre", { class: "canon" }, [JSON.stringify({ claim: ch.claim, gate: ch.gate, expected: ch.expected }, null, 2)])
    ]);
    right.appendChild(div("panel", [el("h2", null, ["RUN RECORD"]), claimBox]));
    right.appendChild(renderMiniChain());
    var resetBtn = el("button", { class: "ghost", style: "margin-top:10px" }, ["reset run"]);
    resetBtn.onclick = function () {
      if (confirm("Abandon this run? Its chain stays in your exports until you leave.")) { state = null; clearStore(); lastResult = null; render(); }
    };
    right.appendChild(div(null, [resetBtn]));

    grid.appendChild(left);
    grid.appendChild(right);
    return grid;
  }

  /* ---------------- artifact renderers + lenses ---------------- */

  function renderArtifact(ch, art) {
    if (art.kind === "records") return renderRecordsArtifact(art);
    if (art.kind === "chain") return renderChainArtifact();
    if (art.kind === "packets") return renderPacketsArtifact();
    if (art.kind === "dispatch") return renderDispatchArtifact();
    return [div("dim", ["artifact unavailable"])];
  }

  function lensBlock(label, compute) {
    var out = null;
    var box = div(null, []);
    var btn = el("button", {
      class: "ghost", style: "margin-top:8px",
      onclick: function () {
        out = compute();
        box.innerHTML = "";
        box.appendChild(out);
      }
    }, [label]);
    return [btn, box];
  }

  function renderRecordsArtifact(art) {
    var nodes = [];
    var table = el("table");
    table.appendChild(el("tr", null, ["record id", "fields", "recorded digest"].map(function (h) { return el("th", null, [h]); })));
    art.records.forEach(function (r) {
      table.appendChild(el("tr", null, [
        el("td", null, [el("details", null, [el("summary", null, [r.record_id]), el("pre", { class: "canon" }, [T.canon(r.fields)])])]),
        el("td", null, [el("pre", { class: "canon" }, [T.canon(r.fields)])]),
        el("td", { class: "hash" }, [r.digest])
      ]));
    });
    nodes.push(table);
    nodes.push(div(null, lensBlock("LENS — recompute digests and compare to recorded seals", function () {
      var t = el("table");
      t.appendChild(el("tr", null, ["record", "recomputed", "recorded", "verdict"].map(function (h) { return el("th", null, [h]); })));
      art.records.forEach(function (r) {
        var d = T.sha256hex(T.canon(r.fields));
        var same = d === r.digest;
        t.appendChild(el("tr", null, [
          el("td", { class: "mono" }, [r.record_id]),
          el("td", { class: "hash" }, [d.slice(0, 20) + "…"]),
          el("td", { class: "hash" }, [r.digest.slice(0, 20) + "…"]),
          el("td", null, [el("span", { class: same ? "checks ok" : "checks no" }, [same ? "MATCH" : "MISMATCH"])])
        ]));
      });
      return t;
    })));
    return nodes;
  }

  function chainWalkTable(chain) {
    var rep = V.validateChain(chain, {});
    var t = el("table");
    t.appendChild(el("tr", null, ["seq", "receipt", "verdict", "walk result"].map(function (h) { return el("th", null, [h]); })));
    chain.forEach(function (r, i) {
      var reasons = rep.reasons.filter(function (x) { return x.seq === i; }).map(function (x) { return x.codes.join(", "); }).join(" ") || "PROVEN";
      t.appendChild(el("tr", null, [
        el("td", { class: "mono" }, [String(i)]),
        el("td", { class: "hash" }, [r.receipt_id]),
        el("td", null, [badge(r.game.verdict)]),
        el("td", { class: reasons === "PROVEN" ? "checks ok" : "checks no" }, [reasons])
      ]));
    });
    return [t, rep];
  }

  function renderChainArtifact() {
    var nodes = [];
    nodes.push(el("p", { class: "dim small" }, ["Recovered chain of run " + F.cache_chain.run_id + " — " + F.cache_chain.chain.length + " judgments. Every receipt's hash covers its payload and its predecessor."]));
    F.cache_chain.chain.forEach(function (r) {
      nodes.push(div("chainitem", [
        div("chainline", ["seq " + r.game.chain.seq, el("span", { class: "arrow" }, ["→"]), hash(r.receipt_id, 20), badge(r.game.verdict)]),
        div("small dim", ["prev: ", hash(r.game.chain.prev_receipt, 16), " · entry: ", hash(r.game.chain.entry_hash, 16)]),
        div("small", [r.evaluation.observed])
      ]));
    });
    nodes.push(div(null, lensBlock("LENS — walk the chain with the contract validator", function () {
      var res = chainWalkTable(F.cache_chain.chain);
      return res[0];
    })));
    return nodes;
  }

  function renderPacketsArtifact() {
    var nodes = [];
    F.delivery_packets.forEach(function (p) {
      var pkt = div("panel");
      pkt.appendChild(el("h2", null, [p.packet_id + " — " + p.label]));
      pkt.appendChild(el("pre", { class: "canon" }, [T.canon(p.content)]));
      pkt.appendChild(div("small dim", ["committed by chain: ", hash(p.committed_digest, 20)]));
      pkt.appendChild(div("small dim", ["chain: " + p.chain.length + " receipts · head ", hash(p.chain[p.chain.length - 1].receipt_id, 16)]));
      var walkOut = div(null, []);
      pkt.appendChild(el("button", {
        class: "ghost", style: "margin-top:8px",
        onclick: function () {
          var chainOk = V.validateChain(p.chain, {}).valid;
          var d = T.sha256hex(T.canon(p.content));
          var contentOk = d === p.committed_digest;
          walkOut.innerHTML = "";
          walkOut.appendChild(div("lensout", [
            "chain walk: ", el("span", { class: chainOk ? "ok" : "no" }, [chainOk ? "VALID" : "BROKEN"]),
            " · content digest matches commitment: ", el("span", { class: contentOk ? "ok" : "no" }, [contentOk ? "YES" : "NO"])
          ]));
        }
      }, ["LENS — walk this packet's chain and hash its content"]));
      pkt.appendChild(walkOut);
      nodes.push(pkt);
    });
    return nodes;
  }

  function renderDispatchArtifact() {
    var nodes = [];
    nodes.push(el("p", { class: "dim small" }, ["Five dispatch records. Each narrates a status (" + mono("claimed_status") + "). Narration is not evidence — run the checks."]));
    var t = el("table");
    t.appendChild(el("tr", null, ["record", "actor", "action", "seq", "nonce", "claimed", "evidence"].map(function (h) { return el("th", null, [h]); })));
    F.apex_bundle.records.forEach(function (r) {
      t.appendChild(el("tr", null, [
        el("td", { class: "mono" }, [r.record_id]),
        el("td", { class: "mono" }, [r.actor]),
        el("td", null, [r.action]),
        el("td", { class: "mono" }, [String(r.sequence)]),
        el("td", { class: "mono" }, [r.nonce]),
        el("td", null, [badge(r.claimed_status)]),
        el("td", { class: "small dim" }, [r.state_evidence ? "state_hash=" + r.state_evidence.state_hash + " sealed_by=" + r.state_evidence.sealed_by : "—"])
      ]));
    });
    nodes.push(t);
    nodes.push(div(null, lensBlock("LENS — run the five checks (claimed status is echoed, never used)", function () {
      var res = K.verifyRecords(F.apex_bundle);
      var t2 = el("table");
      t2.appendChild(el("tr", null, ["record", "IDENTITY", "PROVENANCE", "SEQUENCE", "UNIQUENESS", "ATOMICITY", "computed verdict", "claimed"].map(function (h) { return el("th", null, [h]); })));
      res.forEach(function (r) {
        function ck(n) { return el("td", { class: r.checks[n] === "PASS" ? "checks ok" : "checks no" }, [r.checks[n]]); }
        t2.appendChild(el("tr", null, [
          el("td", { class: "mono" }, [r.record_id]), ck("IDENTITY"), ck("PROVENANCE"), ck("SEQUENCE"), ck("UNIQUENESS"), ck("ATOMICITY"),
          el("td", null, [badge(r.verdict)]),
          el("td", { class: "small dim" }, [r.claimed_status])
        ]));
      });
      return t2;
    })));
    return nodes;
  }

  /* ---------------- verdict + receipts ---------------- */

  function renderVerdict(res) {
    var r = res.receipt;
    var card = div("verdict-card");
    card.appendChild(div(null, [
      el("span", { class: "big v-" + res.verdict, style: "font-family:var(--mono)" }, [res.verdict]),
      el("span", { class: "badge v-" + res.verdict }, [res.reason_code])
    ]));
    var observed = r.evaluation.observed;
    var submitPart = observed.indexOf("; ") !== -1 ? observed.slice(0, observed.indexOf("; ")) : "";
    var judgePart = observed.indexOf("; ") !== -1 ? observed.slice(observed.indexOf("; ") + 2) : observed;
    card.appendChild(div("small", [el("span", { class: "dim" }, ["the judge: "]), judgePart]));
    card.appendChild(div("receipt-line", [
      "receipt ", el("b", null, [r.receipt_id]),
      " · seq " + r.game.chain.seq,
      " · prev ", el("b", null, [r.game.chain.prev_receipt]),
      " · entry ", el("b", null, [r.game.chain.entry_hash.slice(0, 24) + "…"])
    ]));
    card.appendChild(el("details", null, [
      el("summary", null, ["full receipt (v1 envelope)"]),
      el("pre", { class: "canon" }, [JSON.stringify(r, null, 2)])
    ]));
    if (res.verdict === "PASS" && !res.completed) card.appendChild(div("small", ["✓ station solved — the next desk opens. This receipt is now part of your proof."]));
    return card;
  }

  function renderMiniChain() {
    var panel = div("panel");
    panel.appendChild(el("h2", null, ["YOUR CHAIN (" + state.receipts.length + ")"]));
    state.receipts.slice(-4).forEach(function (r) {
      panel.appendChild(div("chainline", [
        "seq " + r.game.chain.seq, el("span", { class: "arrow" }, ["→"]), hash(r.receipt_id, 14), badge(r.game.verdict)
      ]));
    });
    var exp = Game.exportRun(state);
    var rep = V.validateRun(exp);
    panel.appendChild(div("small", [
      el("span", { class: rep.valid ? "checks ok" : "checks no" }, [rep.valid ? "■ chain walks clean so far" : "■ chain break detected"]),
      el("span", { class: "dim" }, [" — in-run check; independent verification is the CLI (see export)"])
    ]));
    return panel;
  }

  function renderChainPanel() {
    var panel = div("panel");
    panel.appendChild(el("h2", null, ["RUN RECORD — FULL CHAIN"]));
    if (!state.receipts.length) { panel.appendChild(div("dim", ["no receipts yet — every judgment you receive will be stamped here"])); return panel; }
    var exp = Game.exportRun(state);
    var rep = V.validateRun(exp);
    state.receipts.forEach(function (r) {
      panel.appendChild(div("chainitem", [
        div("chainline", ["seq " + r.game.chain.seq, el("span", { class: "arrow" }, ["→"]), hash(r.receipt_id, 18), badge(r.game.verdict), el("span", { class: "dim" }, [r.game.challenge_id])]),
        div("small dim", ["prev: " + r.game.chain.prev_receipt + " · entry: " + r.game.chain.entry_hash.slice(0, 20) + "…"])
      ]));
    });
    panel.appendChild(div("small", [
      "in-run walk: ", el("span", { class: rep.valid ? "checks ok" : "checks no" }, [rep.valid ? "VALID" : "BROKEN"]),
      " · ", el("span", { class: "dim" }, ["an independent verifier re-walks this without the game: node cli/verify.js <run file>"])
    ]));
    var exportBox = div(null, []);
    var btn = el("button", { class: "primary", style: "margin-top:12px" }, ["EXPORT RUN (JSON)"]);
    btn.onclick = function () {
      var blob = new Blob([JSON.stringify(exp, null, 2) + "\n"], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "princetown-run-" + state.run_id + ".json";
      a.click();
      exportBox.innerHTML = "";
      exportBox.appendChild(div("small dim", [
        "exported " + state.receipts.length + " receipts. Independently verify from the repo: ",
        el("span", { class: "mono" }, ["node cli/verify.js princetown-run-" + state.run_id + ".json"])
      ]));
    };
    panel.appendChild(btn);
    panel.appendChild(exportBox);
    return panel;
  }

  function renderFinish() {
    var panel = div("panel");
    panel.appendChild(el("h2", null, ["RUN COMPLETE — THE DISPATCH IS SEALED"]));
    panel.appendChild(el("p", null, [
      "Five stations. ", el("b", null, [String(state.receipts.length)]),
      " judgments recorded, chained from GENESIS to the apex seal. Your proof is not this screen — it is the exported chain, and any stranger with the repo can re-walk it:"
    ]));
    panel.appendChild(el("pre", { class: "canon" }, [
      "node cli/verify.js <your-exported-run>.json\nnode cli/verify.js <your-exported-run>.json --v1-audit   # the estate v1 judge audits each envelope"
    ]));
    panel.appendChild(el("p", { class: "dim small" }, [
      "You have learned the trade the Rally pays for: seals over stories, provenance over content, and the receipt that survives the narrator."
    ]));
    return panel;
  }

  /* ---------------- boot ---------------- */

  state = load();
  if (state && state.unlocked && state.unlocked.length) currentStage = state.unlocked[state.unlocked.length - 1];
  render();
})();

/*
 * kinetigor-game — MOBILE UI (display boundary)
 *
 * THE UI ONLY DISPLAYS VERDICTS. It never decides them: every verdict is
 * computed by core/challenges.js through core/game.js. Lens tools (walks,
 * kernel runs, digest computations) recompute with the SAME frozen modules
 * the judges use — they show facts, they do not grant victory. The player
 * still has to pick the right records, hops and lanes.
 *
 * Phone-first: every input is tappable (chips, USE buttons, pickers);
 * typing is never required. Progress persists to localStorage after every
 * action. Export uses navigator.share with clipboard/download fallbacks.
 *
 * Zero dependencies. The DOM wiring only runs in a browser; the pure
 * helpers (forge ops, export, persistence) are exercised headlessly by
 * cli/ui-smoke.js.
 */
(function (root) {
  "use strict";
  var KIN = root.KIN || {};
  var T = KIN.Trust, V = KIN.Validator, K = KIN.Kernel, C = KIN.Challenges, G = KIN.Game, F = KIN.FIXTURES;
  var MK = root.MoorpostKernel;

  /* ================= pure helpers (headless-testable) ================= */

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* ----- forge bench: pure ops on a working copy of the cache chain ----- */

  var FORGE = {
    alter: function (chain) {
      var w = clone(chain);
      var last = w[w.length - 1];
      last.evaluation.observed = (last.evaluation.observed || "") + " (amended by hand)";
      return { chain: w, note: "the last receipt's recorded observation was edited after hashing" };
    },
    remove: function (chain) {
      var w = clone(chain);
      if (w.length < 2) return { chain: w, note: "nothing to remove" };
      w.splice(1, 1);
      return { chain: w, note: "the receipt at seq 1 was removed from the log" };
    },
    reorder: function (chain) {
      var w = clone(chain);
      if (w.length < 3) return { chain: w, note: "not enough receipts to reorder" };
      var t = w[1]; w[1] = w[2]; w[2] = t;
      return { chain: w, note: "receipts at positions 1 and 2 were swapped in the log" };
    },
    replay: function (chain) {
      var w = clone(chain);
      w.push(clone(w[0])); /* same receipt_id, same entry_hash, submitted twice */
      return { chain: w, note: "the first receipt was submitted again at the end of the log" };
    },
    badPrev: function (chain) {
      var w = clone(chain);
      if (w.length < 3) return { chain: w, note: "not enough receipts" };
      w[2].game.chain.prev_receipt = w[0].receipt_id; /* skips one link */
      return { chain: w, note: "the receipt at seq 2 now claims the wrong predecessor" };
    }
  };

  /* walkChain: display-only re-walk with the REAL independent validator */
  function walkChain(chain) { return V.validateChain(chain, {}); }

  /* firstWalkError: the first receipt-level reason entry of a walk */
  function firstWalkError(report) {
    for (var i = 0; i < report.reasons.length; i++) return report.reasons[i];
    return null;
  }

  /* ----- export ----- */
  function buildExportFile(state) {
    var runFile = G.exportRun(state);
    return {
      name: "princetown-run-" + state.run_id + ".json",
      body: JSON.stringify(runFile, null, 2)
    };
  }

  /* CTF flag: derived from the verified final apex PASS receipt — never asserted */
  function deriveFlag(state) {
    var last = state.receipts[state.receipts.length - 1];
    if (!last || last.game.challenge_id !== "apex-04" || last.game.verdict !== "PASS") return null;
    return "RALLY{" + last.game.chain.entry_hash.slice(0, 32) + "}";
  }

  function firstAttemptScore(state) {
    /* honest first-attempt stats: which stations were solved on attempt 1 */
    var out = {};
    C.ORDER.forEach(function (id) {
      var receipts = state.receipts.filter(function (r) { return r.game.challenge_id === id; });
      out[id] = receipts.length > 0 && receipts[0].game.verdict === "PASS";
    });
    return out;
  }

  /* ----- persistence ----- */
  var SAVE_KEY = "kinetigor.princetown.v1";
  var storage = (typeof localStorage !== "undefined") ? localStorage : null;

  function save(state, drafts, screen) {
    if (!storage) return false;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        state: state,
        drafts: drafts || {},
        screen: screen || null,
        saved_at: new Date().toISOString()
      }));
      return true;
    } catch (e) { return false; }
  }
  function loadSave() {
    if (!storage) return null;
    try {
      var raw = storage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !s.state || !Array.isArray(s.state.receipts)) return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSave() {
    if (!storage) return;
    try { storage.removeItem(SAVE_KEY); } catch (e) { /* nothing stored */ }
  }

  /* ================= DOM wiring (browser only) ================= */

  var doc = (typeof document !== "undefined") ? document : null;
  var ui = null; /* live app context: { state, drafts, station } */

  function el(tag, attrs, kids) {
    var n = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") n.textContent = attrs[k];
        else if (k === "html") n.innerHTML = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (kid) { if (kid) n.appendChild(kid); });
    return n;
  }
  function btn(label, cls, onTap) {
    var b = el("button", { "class": "btn " + (cls || ""), text: label });
    b.addEventListener("click", function (ev) { ev.preventDefault(); onTap(ev); });
    return b;
  }
  function chip(label, on, onTap) {
    var c = el("button", { "class": "chip" + (on ? " on" : ""), text: label });
    c.addEventListener("click", function (ev) { ev.preventDefault(); onTap(ev); });
    return c;
  }
  function badge(verdict) {
    return el("span", { "class": "badge " + verdict, text: verdict });
  }
  function toast(msg) {
    var t = doc.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function copyText(s, msg) {
    var done = function () { toast(msg || "Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(done, function () { legacyCopy(s, done); });
    } else legacyCopy(s, done);
  }
  function legacyCopy(s, done) {
    var ta = el("textarea", { readonly: "readonly" });
    ta.value = s;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    doc.body.appendChild(ta);
    ta.select();
    try { doc.execCommand("copy"); done(); } catch (e) { /* clipboard unavailable */ }
    doc.body.removeChild(ta);
  }
  function actionBar(buttons) {
    var bar = doc.getElementById("actionbar");
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    buttons.forEach(function (b) { bar.appendChild(b); });
  }

  /* ---------- persistence glue ---------- */
  function persist() {
    if (!ui) return;
    save(ui.state, ui.drafts, { station: ui.station || null });
  }

  /* ---------- screens ---------- */

  function show(name, stationId) {
    ui.station = stationId || null;
    if (name === "home") renderHome();
    else if (name === "map") renderMap();
    else if (name === "station") renderStation(stationId);
    else if (name === "chain") renderChain();
    persist();
  }

  function topbarWire() {
    doc.getElementById("btn-home").addEventListener("click", function () { show("map"); });
    doc.getElementById("btn-chain").addEventListener("click", function () { show("chain"); });
  }

  /* ----- home ----- */
  function renderHome() {
    var scr = doc.getElementById("screen");
    scr.textContent = "";
    var saved = loadSave();
    scr.appendChild(el("div", { "class": "hero" }, [
      el("img", { src: "hero.jpg", alt: "A detective on a foggy harbor quay at night holding a glowing sealed letter" }),
      el("div", { "class": "hero-text" }, [
        el("h2", { text: "The Princetown Packet" }),
        el("p", { text: "Someone in Princetown is forging the mail. Find the fakes before they get through." })
      ])
    ]));
    scr.appendChild(el("div", { "class": "card" }, [
      el("p", { text: "You're a detective in a harbor town where every letter carries a digital seal. Five cases, about 30 minutes. Check the seals, catch the tampered records, and stop the forged delivery." }),
      el("p", { "class": "small", text: "No guessing: every answer is checked by real code, and you finish with a receipt that proves what you solved. No account, no ads." })
    ]));
    if (saved && saved.state && saved.state.receipts.length > 0 && !saved.state.solved["apex-04"]) {
      actionBar([
        btn("CONTINUE RUN", "primary", function () {
          ui.state = saved.state; ui.drafts = saved.drafts || {};
          show("map");
        }),
        btn("NEW RUN", "ghost", function () { startNew(); })
      ]);
      scr.appendChild(el("div", { "class": "card" }, [
        el("p", { "class": "small", text: "A saved run was found on this phone (" + saved.state.receipts.length + " receipts). Continue where you left off, or start a fresh warrant." })
      ]));
    } else {
      actionBar([btn("BEGIN THE RUN", "primary", function () { startNew(); })]);
    }
  }

  function startNew() {
    var name = "Verifier";
    var saved = loadSave();
    if (saved && saved.state) { clearSave(); }
    ui.state = G.newRun(name);
    ui.drafts = {};
    show("map");
  }

  /* ----- map (station list) ----- */
  function renderMap() {
    var scr = doc.getElementById("screen");
    scr.textContent = "";
    var st = ui.state;
    var completed = C.ORDER.every(function (id) { return !!st.solved[id]; });
    scr.appendChild(el("div", { "class": "card" }, [
      el("h2", { text: "Your cases — " + (completed ? "all solved!" : (Object.keys(st.solved).length) + " of 5 solved") }),
      el("p", { "class": "small", text: "run " + st.run_id + " · " + st.receipts.length + " receipt" + (st.receipts.length === 1 ? "" : "s") + " on the chain" })
    ]));
    C.ORDER.forEach(function (id, i) {
      var ch = C.byId(id);
      var solvedHere = !!st.solved[id];
      var unlockedHere = st.unlocked.indexOf(id) !== -1;
      var cls = "station-item" + (solvedHere ? " done" : unlockedHere ? " current" : " locked");
      var icon = solvedHere ? "\u2713" : unlockedHere ? "\u25B6" : "\uD83D\uDD12";
      var sub = solvedHere ? "\u2713 Solved" : unlockedHere ? "Ready to play" : "Locked: solve the case before it";
      var item = el("button", { "class": cls }, [
        el("span", { "class": "dot", text: icon }),
        el("span", { "class": "meta" }, [
          el("span", { "class": "name", text: "Case " + (i + 1) + " · " + ch.title }),
          el("span", { "class": "plain", text: ch.plain || "" }),
          el("span", { "class": "sub", text: sub })
        ])
      ]);
      item.addEventListener("click", function () {
        if (!unlockedHere) { toast("That desk is not open to you yet"); return; }
        show("station", id);
      });
      scr.appendChild(item);
    });
    if (completed) scr.appendChild(finishCard());
    actionBar([btn("RECEIPT CHAIN", "ghost", function () { show("chain"); })]);
  }

  function finishCard() {
    var st = ui.state;
    var flag = deriveFlag(st);
    var first = firstAttemptScore(st);
    var firstCount = C.ORDER.filter(function (id) { return first[id]; }).length;
    var card = el("div", { "class": "card verdict-card pass" }, [
      el("div", { "class": "go-banner", text: "GO — DISPATCH RELEASED" }),
      el("p", { text: "Course 001 cleared. Every judgment is on your chain; the stranger's validator will confirm it without asking you anything." })
    ]);
    if (flag) {
      var flagLine = el("p", { "class": "mono", text: flag });
      var copyBtn = btn("COPY FLAG", "small", function () { copyText(flag, "Flag copied"); });
      card.appendChild(el("div", { "class": "card" }, [el("h3", { text: "Course flag (derived from your apex receipt)" }), flagLine, copyBtn]));
    }
    card.appendChild(el("p", { "class": "small", text: "First-attempt solves: " + firstCount + " of 5 stations." }));
    card.appendChild(btn("EXPORT RECEIPTS", "primary", doExport));
    return card;
  }

  /* ----- station ----- */
  function renderStation(id) {
    var scr = doc.getElementById("screen");
    var ch = C.byId(id);
    var st = ui.state;
    scr.textContent = "";

    scr.appendChild(el("div", { "class": "card" }, [
      el("h3", { text: ch.station }),
      el("h2", { text: ch.title }),
      el("p", { "class": "plain-lead", text: ch.plain || "" }),
      el("p", { text: ch.howto || "" }),
      el("details", {}, [
        el("summary", { text: "Full case file" }),
        el("p", { text: ch.brief }),
        el("p", { text: ch.objective })
      ])
    ]));

    var art = ch.artifact();
    var holder = el("div", { "class": "card" }, [el("h3", { text: art.title })]);
    renderArtifact(holder, art, ch);
    scr.appendChild(holder);

    /* verdict history for this desk */
    var mine = st.receipts.filter(function (r) { return r.game.challenge_id === id; });
    if (mine.length) {
      var hist = el("div", { "class": "card" }, [el("h3", { text: "This desk's judgments" })]);
      mine.slice(-4).forEach(function (r) {
        hist.appendChild(el("div", { "class": "hop" }, [
          el("div", { "class": "row spread" }, [
            badge(r.game.verdict),
            el("span", { "class": "small", text: "attempt " + r.game.attempt })
          ]),
          el("div", { "class": "small", text: r.reason_code || r.game.reason_code })
        ]));
      });
      scr.appendChild(hist);
    }

    scr.appendChild(evidenceCard(ch));
    actionBar([btn("SUBMIT EVIDENCE", "primary", function () { doSubmit(ch); })]);
  }

  /* ----- artifact renderers (lenses show what the frozen validators compute) ----- */

  function renderArtifact(holder, art, ch) {
    if (art.kind === "records") renderRecordsArtifact(holder, art, ch);
    else if (art.kind === "chain") renderChainArtifact(holder, art, ch);
    else if (art.kind === "relay") renderRelayArtifact(holder, art, ch);
    else if (art.kind === "board") renderBoardArtifact(holder, art, ch);
    else holder.appendChild(el("p", { text: "unknown artifact" }));
  }

  function recordDigest(rec) { return T.sha256hex(T.canon(rec.fields)); }

  function renderRecordsArtifact(holder, art, ch) {
    var walkBtn = btn("COMPUTE ALL DIGESTS (LENS)", "small", function () {
      holder.querySelectorAll(".digest-line").forEach(function (n) { n.hidden = !n.hidden; });
    });
    holder.appendChild(walkBtn);
    art.records.forEach(function (rec) {
      var dig = el("div", { "class": "mono digest-line", hidden: "hidden" });
      dig.textContent = recordDigest(rec);
      var useBtn = btn("USE THIS RECORD", "small ghost", function () {
        var d = draftOf(ch.id);
        d.record_id = rec.record_id;
        d[ch.evidence_fields[1].key] = recordDigest(rec);
        ui.drafts[ch.id] = d;
        persist();
        renderStation(ch.id); /* re-render form with filled draft */
        toast("Evidence filled from the lens — the judge will recompute it");
      });
      holder.appendChild(el("div", { "class": "rec-row" }, [
        el("div", { "class": "row spread" }, [
          el("span", { "class": "mono", text: rec.record_id }),
          el("span", { "class": "small", text: rec.digest === recordDigest(rec) ? "seal matches" : "seal MISMATCH" })
        ]),
        el("div", { "class": "small mono", text: JSON.stringify(rec.fields) }),
        dig,
        useBtn
      ]));
    });
  }

  function renderChainArtifact(holder, art, ch) {
    var cc = F.cache_chain;
    holder.appendChild(el("p", { "class": "small", text: cc.note }));
    var walkBtn = btn("WALK THE CHAIN (VALIDATOR LENS)", "small", function () {
      var rep = walkChain(cc.chain);
      var rows = holder.querySelectorAll(".rec-row");
      rows.forEach(function (row) { row.classList.remove("bad"); row.querySelector(".codes").textContent = ""; });
      rep.reasons.forEach(function (r) {
        var row = rows[r.seq];
        if (row) { row.classList.add("bad"); row.querySelector(".codes").textContent = r.codes.join(", "); }
      });
      toast(rep.valid ? "The walk is clean" : "The walk refused " + rep.reasons.length + " receipt(s)");
    });
    holder.appendChild(walkBtn);
    cc.chain.forEach(function (r, i) {
      var idBtn = el("button", { "class": "mono copyable", text: r.receipt_id });
      idBtn.style.cssText = "background:none;border:none;color:#7fd8ff;padding:0;min-height:24px";
      idBtn.addEventListener("click", function () { copyText(r.receipt_id, "Receipt id copied"); });
      var firstBtn = btn("MARK FIRST BAD", "small ghost", function () {
        var d = draftOf(ch.id); d.first_bad_receipt_id = r.receipt_id; ui.drafts[ch.id] = d; persist(); renderStation(ch.id);
      });
      var lastBtn = btn("MARK LAST VALID", "small ghost", function () {
        var d = draftOf(ch.id); d.last_valid_receipt_id = r.receipt_id; ui.drafts[ch.id] = d; persist(); renderStation(ch.id);
      });
      holder.appendChild(el("div", { "class": "rec-row" }, [
        el("div", { "class": "row spread" }, [
          el("span", { "class": "small", text: "seq " + i }),
          idBtn,
          badge(r.game.verdict)
        ]),
        el("div", { "class": "codes small", text: "" }),
        el("div", { "class": "row" }, [firstBtn, lastBtn])
      ]));
    });
    holder.appendChild(forgeBench(ch));
  }

  /* ----- FORGE BENCH: watch the system refuse your own forgeries ----- */
  var bench = null;
  function forgeBench(ch) {
    var card = el("div", { "class": "card", style: "border-color:#5b3a75" }, [
      el("h3", { text: "FORGERY BENCH" }),
      el("p", { "class": "small", text: "Take a working copy of the cache log and try to cheat it: alter words after hashing, remove a receipt, reorder the log, replay a receipt, or point a receipt at the wrong predecessor. The validator decides — watch it refuse you." })
    ]);
    if (!bench) bench = { chain: clone(F.cache_chain.chain), note: "pristine copy" };
    var ops = [["ALTER", "alter"], ["REMOVE", "remove"], ["REORDER", "reorder"], ["REPLAY", "replay"], ["BAD PREV", "badPrev"]];
    var row = el("div", { "class": "chip-row" });
    ops.forEach(function (op) {
      row.appendChild(chip(op[0], false, function () {
        var res = FORGE[op[1]](bench.chain);
        bench.chain = res.chain;
        bench.note = res.note;
        renderStation(ch.id);
      }));
    });
    card.appendChild(row);
    card.appendChild(el("p", { "class": "small", text: "Bench state: " + bench.note }));
    var walkBtn = btn("WALK THE FORGED LOG (VALIDATOR LENS)", "small danger", function () {
      var rep = walkChain(bench.chain);
      var lines = rep.reasons.map(function (r) { return "seq " + r.seq + " -> " + r.codes.join(", "); });
      var verdict = el("div", { "class": "mono small" });
      verdict.textContent = rep.valid ? "the forged log walks clean — nothing was changed" : "REFUSED:\n" + lines.join("\n");
      card.appendChild(verdict);
      toast(rep.valid ? "Clean walk" : "The system refused your forgery");
    });
    var resetBtn = btn("RESET BENCH", "small ghost", function () {
      bench = { chain: clone(F.cache_chain.chain), note: "pristine copy" };
      renderStation(ch.id);
    });
    card.appendChild(el("div", { "class": "row" }, [walkBtn, resetBtn]));
    return card;
  }

  function renderRelayArtifact(holder, art, ch) {
    F.relay_paths.forEach(function (path) {
      holder.appendChild(el("div", { "class": "card" }, [
        el("h3", { text: path.path_id + " — " + path.label }),
        el("p", { "class": "small", text: path.note })
      ]));
      var walk = C._internals.walkRelayPath(path);
      path.entries.forEach(function (e, i) {
        var code = walk.walked[i].recomputed_code;
        var hop = el("div", { "class": "hop" + (code !== "ACCEPTED" ? " refused" : "") });
        var usePath = btn("USE AS SURVIVOR", "small ghost", function () {
          var d = draftOf(ch.id); d.relay_path = path.path_id; ui.drafts[ch.id] = d; persist(); renderStation(ch.id);
        });
        var useRefusal = code !== "ACCEPTED" ? btn("USE THIS REFUSAL", "small ghost", function () {
          var d = draftOf(ch.id);
          d.first_refused_hop = String(e.hop);
          d.first_refusal_code = code;
          ui.drafts[ch.id] = d; persist(); renderStation(ch.id);
        }) : null;
        hop.appendChild(el("div", { "class": "row spread" }, [
          el("span", { text: "hop " + e.hop + " · " + e.station_name }),
          el("span", { "class": "small claimed", text: "log claims: " + e.claimed_code })
        ]));
        hop.appendChild(el("div", { "class": "mono small kernel" + (code !== "ACCEPTED" ? " refusal" : ""), text: "kernel recomputes: " + code }));
        var det = el("details", {}, [
          el("summary", { text: "packet bytes" }),
          el("div", { "class": "mono small", text: "claim: " + e.presented_packet.claim }),
          el("div", { "class": "mono small", text: "seal: " + e.presented_packet.integrity_hash + " · sequence: " + e.presented_packet.sequence + " · station: " + e.presented_packet.station_id }),
          el("div", { "class": "mono small", text: "carried stamps: " + (e.presented_packet.stamps || []).map(function (s) { return s.station_id; }).join(" > ") || "none" })
        ]);
        hop.appendChild(det);
        hop.appendChild(el("div", { "class": "row" }, [usePath, useRefusal]));
        holder.appendChild(hop);
      });
      var bankLine = el("div", { "class": "small" });
      bankLine.textContent = "bank ledger row: " + (walk.bank_committed ? "COMMITS" : "refused — trustworthy state did not survive the relay");
      holder.appendChild(bankLine);
    });
  }

  function renderBoardArtifact(holder, art, ch) {
    var B = F.mission_board;
    var st = ui.state;
    holder.appendChild(el("p", { "class": "small", text: B.note }));
    var racks = [["Lane cards (6)", B.lanes, "lane"], ["Evidence cards (8)", B.evidence_cards, "card"], ["Dispatch rack (5)", F.apex_bundle.records, "dx"]];
    racks.forEach(function (rack) {
      holder.appendChild(el("h3", { text: rack[0] }));
      rack[1].forEach(function (item) {
        var card = el("div", { "class": "board-card" });
        var res = el("div", { "class": "res small" });
        if (rack[2] === "dx") {
          card.appendChild(el("div", { "class": "row spread" }, [
            el("span", { "class": "mono", text: item.record_id }),
            el("span", { "class": "small", text: "claims: " + item.claimed_status })
          ]));
          var checkBtn = btn("FIVE-CHECK THIS RECORD (LENS)", "small ghost", function () {
            var five = K.verifyRecords({ roster: F.apex_bundle.roster, required_evidence_keys: F.apex_bundle.required_evidence_keys, records: [item] });
            var r = five[0];
            res.className = "res small " + (r.verdict === "PASS" ? "ok" : "no");
            res.textContent = "checks say: " + r.verdict + (r.failed ? " (" + r.failed.join(", ") + ")" : "");
          });
          var useQ = btn("USE AS QUARANTINE", "small ghost", function () {
            var d = draftOf(ch.id); d.quarantine_record = item.record_id; ui.drafts[ch.id] = d; persist(); renderStation(ch.id);
          });
          card.appendChild(el("div", { "class": "row" }, [checkBtn, useQ]));
        } else {
          var id = item.lane_id || item.card_id;
          card.appendChild(el("div", { "class": "row spread" }, [
            el("span", { "class": "mono", text: id + (item.name ? " · " + item.name : "") }),
            el("span", { "class": "small", text: item.claimed_go ? "claims GO" : "claims " + item.claimed })
          ]));
          var cites = (item.authorities || [item.cites]);
          var resolveBtn = btn("RESOLVE AGAINST MY CHAIN (LENS)", "small ghost", function () {
            var lines = cites.map(function (cite) {
              var r = C._internals.resolveCitation(cite, st.receipts);
              return (cite.receipt_id ? cite.receipt_id : cite.challenge + "/" + cite.verdict) + " -> " +
                (r ? "receipt " + r.receipt_id + " (" + r.game.verdict + ")" : "nothing on your chain");
            });
            res.className = "res small";
            res.textContent = lines.join(" | ");
          });
          var toggle = btn(item.lane_id ? "TOGGLE GO CHIP" : "TOGGLE ACTIONABLE CHIP", "small ghost", function () {
            var d = draftOf(ch.id);
            var key = item.lane_id ? "go_lanes" : "actionable_cards";
            if (!Array.isArray(d[key])) d[key] = [];
            var at = d[key].indexOf(id);
            if (at === -1) d[key].push(id); else d[key].splice(at, 1);
            ui.drafts[ch.id] = d; persist(); renderStation(ch.id);
          });
          card.appendChild(el("div", { "class": "row" }, [resolveBtn, toggle]));
        }
        card.appendChild(res);
        holder.appendChild(card);
      });
    });
  }

  /* ----- evidence form ----- */
  function draftOf(chId) { return clone(ui.drafts[chId] || {}); }

  function evidenceCard(ch) {
    var card = el("div", { "class": "card" }, [el("h3", { text: "Your evidence" })]);
    var d = draftOf(ch.id);
    ch.evidence_fields.forEach(function (f) {
      var wrap = el("div", { "class": "field" });
      wrap.appendChild(el("label", { text: f.label }));
      if (f.type === "select" || f.type === "multiselect") {
        var current = (f.type === "select") ? [d[f.key]] : (Array.isArray(d[f.key]) ? d[f.key] : []);
        var row = el("div", { "class": "chip-row" });
        f.options.forEach(function (opt) {
          var on = current.indexOf(opt) !== -1;
          row.appendChild(chip(opt, on, function () {
            var dd = draftOf(ch.id);
            if (f.type === "select") { dd[f.key] = opt; }
            else {
              if (!Array.isArray(dd[f.key])) dd[f.key] = [];
              var at = dd[f.key].indexOf(opt);
              if (at === -1) dd[f.key].push(opt); else dd[f.key].splice(at, 1);
            }
            ui.drafts[ch.id] = dd; persist(); renderStation(ch.id);
          }));
        });
        wrap.appendChild(row);
      } else {
        var input = el("input", { type: "text", value: d[f.key] || "", placeholder: f.placeholder || "" });
        input.addEventListener("change", function () {
          var dd = draftOf(ch.id);
          dd[f.key] = input.value;
          ui.drafts[ch.id] = dd; persist();
        });
        wrap.appendChild(input);
        if (f.key === "authority_receipt") {
          var pick = btn("PICK FROM MY RECEIPTS", "small ghost", function () { receiptPicker(ch, input); });
          wrap.appendChild(pick);
        }
      }
      card.appendChild(wrap);
    });
    card.appendChild(el("p", { "class": "small", text: "Every submission is judged by the frozen rules and receipted — PASS, FAIL, REFUSE or QUARANTINE." }));
    return card;
  }

  function receiptPicker(ch, input) {
    var st = ui.state;
    var mine = st.receipts.filter(function (r) { return r.game.verdict === "PASS" && r.game.challenge_id === "cache-02"; });
    if (!mine.length) { toast("No cache PASS receipt on your chain yet"); return; }
    var scr = doc.getElementById("screen");
    var card = el("div", { "class": "card" }, [el("h3", { text: "Your cache PASS receipts" })]);
    mine.forEach(function (r) {
      var b = btn(r.receipt_id + "  (use)", "small", function () {
        input.value = r.receipt_id;
        var dd = draftOf(ch.id);
        dd.authority_receipt = r.receipt_id;
        ui.drafts[ch.id] = dd; persist();
        show("station", ch.id);
      });
      card.appendChild(b);
    });
    card.appendChild(btn("CLOSE", "small ghost", function () { show("station", ch.id); }));
    scr.textContent = "";
    scr.appendChild(el("div", { "class": "card" }, [el("h2", { text: "Pick a receipt" })]));
    scr.appendChild(card);
    actionBar([]);
  }

  /* ----- submit ----- */
  function doSubmit(ch) {
    var d = ui.drafts[ch.id] || {};
    var res = G.submit(ui.state, ch.id, clone(d));
    persist();
    show("station", ch.id);
    if (!res.judged) { toast(res.message || "refused"); return; }
    var scr = doc.getElementById("screen");
    var vc = el("div", { "class": "card verdict-card " + res.verdict.toLowerCase() }, [
      el("div", { "class": "row spread" }, [badge(res.verdict), el("span", { "class": "small", text: res.reason_code })]),
      el("p", { "class": "small", text: res.receipt.evaluation.observed }),
      el("p", { "class": "small mono", text: "receipt " + res.receipt.receipt_id + " (tap in the chain panel to copy)" })
    ]);
    scr.insertBefore(vc, scr.firstChild.nextSibling);
    if (res.completed) {
      actionBar([
        btn("SEE THE BOARD RULING", "primary", function () { show("map"); }),
        btn("EXPORT", "ghost", doExport)
      ]);
    } else if (res.verdict === "PASS") {
      actionBar([btn("NEXT STATION", "primary", function () {
        var idx = C.ORDER.indexOf(ch.id);
        show("station", C.ORDER[idx + 1]);
      }), btn("COURSE MAP", "ghost", function () { show("map"); })]);
    } else {
      actionBar([btn("SUBMIT EVIDENCE", "primary", function () { doSubmit(ch); })]);
    }
  }

  /* ----- chain panel ----- */
  function renderChain() {
    var scr = doc.getElementById("screen");
    var st = ui.state;
    scr.textContent = "";
    scr.appendChild(el("div", { "class": "card" }, [
      el("h2", { text: "Your receipt chain" }),
      el("p", { "class": "small", text: "run " + st.run_id + " · player " + st.player + " · " + st.receipts.length + " receipts" })
    ]));
    var verifyBtn = btn("VERIFY MY CHAIN (VALIDATOR LENS)", "small", function () {
      var runFile = G.exportRun(st);
      var rep = V.validateRun(runFile);
      toast("chain " + (rep.valid ? "VALID" : "INVALID") + (rep.completed ? " · course COMPLETE" : "") + (rep.reasons.length ? " · " + rep.reasons.length + " refusals" : ""));
      var out = el("div", { "class": "mono small" });
      out.textContent = JSON.stringify({ valid: rep.valid, completed: rep.completed, run_codes: rep.run_codes, failures: rep.reasons.length }, null, 1);
      scr.appendChild(out);
    });
    scr.appendChild(verifyBtn);
    st.receipts.slice().reverse().forEach(function (r) {
      var idBtn = el("button", { "class": "mono copyable", text: r.receipt_id });
      idBtn.style.cssText = "background:none;border:none;color:#7fd8ff;padding:0;min-height:24px";
      idBtn.addEventListener("click", function () { copyText(r.receipt_id, "Receipt id copied"); });
      var det = el("details", {}, [
        el("summary", { text: "receipt bytes" }),
        el("div", { "class": "mono small", text: "challenge: " + r.game.challenge_id + " · attempt " + r.game.attempt }),
        el("div", { "class": "mono small", text: "entry_hash: " + r.game.chain.entry_hash }),
        el("div", { "class": "mono small", text: "prev: " + r.game.chain.prev_receipt }),
        el("div", { "class": "small", text: "observed: " + r.evaluation.observed })
      ]);
      scr.appendChild(el("div", { "class": "chain-row" }, [
        el("div", { "class": "idline" }, [
          badge(r.game.verdict),
          idBtn,
          el("span", { "class": "small", text: r.game.reason_code })
        ]),
        det
      ]));
    });
    actionBar([btn("EXPORT", "primary", doExport), btn("COURSE MAP", "ghost", function () { show("map"); })]);
  }

  /* ----- export: phone share -> clipboard -> download ----- */
  function doExport() {
    var ex = buildExportFile(ui.state);
    var body = ex.body;
    var name = ex.name;
    var fallback = function () {
      copyText(body, "Run JSON copied to clipboard (" + body.length + " bytes)");
      var a = el("a", { href: "data:application/json;charset=utf-8," + encodeURIComponent(body), download: name });
      a.textContent = "Download " + name;
      var scr = doc.getElementById("screen");
      var card = el("div", { "class": "card" }, [
        el("h3", { text: "Export fallback" }),
        el("p", { "class": "small", text: "Your phone's share sheet is unavailable here. The JSON was copied to your clipboard; the link below downloads the same bytes." }),
        a
      ]);
      scr.appendChild(card);
    };
    if (navigator.share) {
      var payload = { title: name, text: "The Princetown Packet — verified run " + ui.state.run_id };
      try {
        var file = new File([body], name, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) payload.files = [file];
      } catch (e) { /* File constructor unavailable — text share only */ }
      navigator.share(payload).then(function () { toast("Shared"); }, function () { fallback(); });
    } else fallback();
  }

  /* ---------- init ---------- */
  function init() {
    if (!doc) return;
    topbarWire();
    ui = { state: null, drafts: {}, station: null };
    var saved = loadSave();
    if (saved && saved.state && saved.state.receipts && saved.state.receipts.length > 0) {
      ui.state = saved.state;
      ui.drafts = saved.drafts || {};
      show("map");
    } else {
      ui.state = G.newRun("Verifier");
      ui.drafts = {};
      show("home");
    }
  }
  if (doc && doc.readyState !== "loading") init();
  else if (doc) doc.addEventListener("DOMContentLoaded", init);

  /* ---------- exports (headless smoke tests) ---------- */
  var api = {
    FORGE: FORGE,
    walkChain: walkChain,
    firstWalkError: firstWalkError,
    buildExportFile: buildExportFile,
    deriveFlag: deriveFlag,
    firstAttemptScore: firstAttemptScore,
    save: save,
    loadSave: loadSave,
    clearSave: clearSave,
    SAVE_KEY: SAVE_KEY,
    _setStorage: function (s) { storage = s; },
    _setContext: function (ctx) { ui = ctx; },
    init: init
  };
  root.KIN = root.KIN || {};
  root.KIN.UI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

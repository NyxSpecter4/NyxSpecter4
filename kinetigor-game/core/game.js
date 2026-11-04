/*
 * kinetigor-game — RUN STATE MACHINE (GAME boundary)
 * Owns progression and the evidence-submission flow. NEVER judges:
 * verdicts come only from core/challenges.js, receipts only from
 * core/trust.js. The UI calls this module; this module calls the judge.
 *
 * Every JUDGED submission produces a chained receipt — including
 * failures and refusals. Replaying identical evidence inside one run
 * is an integrity condition: QUARANTINE / REPLAY_DETECTED.
 *
 * Zero dependencies. Node >= 16 and browsers.
 */
(function (root) {
  "use strict";
  if (typeof require === "function") {
    if (!root.KIN || !root.KIN.Trust) require("./trust.js");
    if (!root.KIN || !root.KIN.Challenges) require("./challenges.js");
  }

  var T = root.KIN.Trust;
  var C = root.KIN.Challenges;

  function nowIso() { return new Date().toISOString(); }

  function randomHex(n) {
    var cryptoApi = (typeof globalThis !== "undefined") ? globalThis.crypto : null;
    if (cryptoApi && cryptoApi.getRandomValues) {
      var buf = new Uint8Array(n);
      cryptoApi.getRandomValues(buf);
      var s = "";
      for (var i = 0; i < n; i++) s += ("0" + buf[i].toString(16)).slice(-2);
      return s;
    }
    /* Node path — avoided when crypto.getRandomValues exists (Node >= 19 has it) */
    var nc = null;
    try { nc = require("crypto"); } catch (e) { /* browser without webcrypto */ }
    if (nc) return nc.randomBytes(n).toString("hex");
    var out = "";
    for (var j = 0; j < n * 2; j++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)];
    return out;
  }

  function newRun(player, opts) {
    opts = opts || {};
    if (!player || typeof player !== "string" || !player.trim()) {
      throw new Error("a run needs a player name");
    }
    return {
      v: 1,
      run_id: opts.run_id || ("run-" + randomHex(6)),
      player: player.trim(),
      seq: 0,
      last: null,
      receipts: [],
      attempts: {},
      seen: {},
      solved: {},
      unlocked: [C.ORDER[0]]
    };
  }

  /*
   * submit(state, challenge_id, evidence, opts) -> result
   *   result.judged === false for non-judgment errors (locked desk).
   *   result.verdict / reason_code / receipt for judgments.
   * opts.clock: () => ISO string, for deterministic tests/demos.
   */
  function submit(state, challenge_id, evidence, opts) {
    opts = opts || {};
    var ch = C.byId(challenge_id);
    if (!ch) throw new Error("unknown challenge " + challenge_id);
    if (state.unlocked.indexOf(challenge_id) === -1) {
      return { judged: false, error: "CHALLENGE_LOCKED", message: "that desk is not open to you yet" };
    }
    var attempt = (state.attempts[challenge_id] || 0) + 1;
    state.attempts[challenge_id] = attempt;

    var verdict, reason_code, observed;
    var evidenceObj = evidence;
    if (evidenceObj === null || typeof evidenceObj !== "object" || Array.isArray(evidenceObj)) {
      verdict = "REFUSE"; reason_code = "INSUFFICIENT_EVIDENCE";
      observed = "evidence is not an object — insufficient to evaluate";
    } else {
      var key;
      try { key = T.canon(evidenceObj); } catch (err) { key = null; }
      if (key !== null) {
        var seenMap = state.seen[challenge_id] = state.seen[challenge_id] || {};
        if (Object.prototype.hasOwnProperty.call(seenMap, key)) {
          verdict = "QUARANTINE"; reason_code = "REPLAY_DETECTED";
          observed = "identical canonical evidence re-submitted to " + challenge_id +
            " in this run (first judged at attempt " + seenMap[key] + ") — an integrity condition, quarantined";
        } else {
          seenMap[key] = attempt;
          var r = ch.judge(evidenceObj, { receipts: state.receipts, fixtures: root.KIN.FIXTURES });
          verdict = r.verdict; reason_code = r.reason_code;
          observed = "submitted " + key + "; " + r.observed;
        }
      } else {
        verdict = "REFUSE"; reason_code = "INSUFFICIENT_EVIDENCE";
        observed = "evidence could not be canonicalized — insufficient to evaluate";
      }
    }

    var receipt = T.buildReceipt({
      run_id: state.run_id,
      player: state.player,
      challenge_id: challenge_id,
      attempt: attempt,
      verdict: verdict,
      reason_code: reason_code,
      observed: observed,
      subject_id: ch.id,
      subject_version: ch.version,
      claim: ch.claim,
      gate: ch.gate,
      expected: ch.expected,
      timestamp: opts.clock ? opts.clock() : nowIso(),
      quarantine: verdict === "QUARANTINE"
        ? { reason: reason_code, last_valid_state: "MEASURED" }
        : null,
      seq: state.seq,
      prev: state.last
    });

    state.receipts.push(receipt);
    state.last = { receipt_id: receipt.receipt_id, entry_hash: receipt.game.chain.entry_hash };
    state.seq += 1;

    if (verdict === "PASS" && !state.solved[challenge_id]) {
      state.solved[challenge_id] = true;
      var idx = C.ORDER.indexOf(challenge_id);
      var next = C.ORDER[idx + 1];
      if (next && state.unlocked.indexOf(next) === -1) state.unlocked.push(next);
    }

    return {
      judged: true,
      verdict: verdict,
      reason_code: reason_code,
      receipt: receipt,
      unlocked: state.unlocked.slice(),
      solved: !!state.solved[challenge_id],
      completed: C.ORDER.every(function (id) { return !!state.solved[id]; })
    };
  }

  function exportRun(state, opts) {
    opts = opts || {};
    return {
      schema: T.CHAIN_NS,
      run_id: state.run_id,
      player: state.player,
      exported_at: opts.clock ? opts.clock() : nowIso(),
      expected_final_receipt_id: state.last ? state.last.receipt_id : null,
      receipts: state.receipts
    };
  }

  var api = {
    newRun: newRun,
    submit: submit,
    exportRun: exportRun,
    nowIso: nowIso
  };
  root.KIN = root.KIN || {};
  root.KIN.Game = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

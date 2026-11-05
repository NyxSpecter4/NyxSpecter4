/*
 * kinetigor-game — INDEPENDENT CHAIN VALIDATOR
 * Validates a run's receipt chain against the frozen contract (CONTRACT.md).
 * Trusts ONLY the frozen contract and the supplied receipt bytes.
 * It never asks the game UI whether the player won.
 *
 * Reason codes (stable, machine-readable):
 *   UNSUPPORTED_SCHEMA    receipt.schema is not kinetigor.trust-receipt/v1
 *   MALFORMED_RECEIPT     envelope / chain block structurally broken
 *   INVALID_HASH          recomputed entry_hash or receipt_id derivation mismatch
 *   BROKEN_PREDECESSOR    prev_receipt does not name the previous receipt / GENESIS
 *   SEQ_GAP               chain sequence not dense from 0
 *   REORDERED_CHAIN       array order disagrees with seq order
 *   DUPLICATE_RECEIPT     receipt_id or entry_hash appears twice
 *   RUN_MISMATCH          receipts from different run_id values
 *   INCONSISTENT_VERDICT  verdict/status/evaluation algebra violated
 *   TRUNCATED_CHAIN       expected_final_receipt_id absent from the run
 *
 * Zero dependencies. Node >= 16 and browsers.
 */
(function (root) {
  "use strict";
  if (typeof require === "function") { if (!root.KIN || !root.KIN.Trust) require("./trust.js"); }

  var T = root.KIN.Trust;
  var APEX_CHALLENGE = "apex-04"; /* the contract's completion marker */

  function isStr(x) { return typeof x === "string" && x.length > 0; }
  function isNum(x) { return typeof x === "number" && isFinite(x); }

  function envelopeMalformed(r) {
    var c = r.claim, t = r.transition, e = r.evaluation, p = r.provenance,
        s = r.subject, ev = r.evidence, g = r.game, ch = g && g.chain;
    if (!isStr(r.receipt_id)) return "receipt_id missing";
    if (!s || !isStr(s.kind) || !isStr(s.id)) return "subject.kind / subject.id missing";
    if (!c || !isStr(c.statement) || !isStr(c.falsifier) ||
        c.previous_state !== "MEASURED" || c.requested_state !== "VERIFIED") return "claim block malformed";
    if (!Array.isArray(ev) || ev.length === 0) return "evidence block missing";
    for (var i = 0; i < ev.length; i++) {
      if (!ev[i] || !isStr(ev[i].type) || !isStr(ev[i].locator) || !isStr(ev[i].observed_result)) {
        return "evidence[" + i + "] malformed";
      }
    }
    if (!e || !isStr(e.gate) || !isStr(e.expected) || !isStr(e.observed) ||
        ["PASS", "FAIL", "INDETERMINATE"].indexOf(e.verdict) === -1) return "evaluation block malformed";
    if (!p || !isStr(p.actor) || !isStr(p.method) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p.timestamp || "")) return "provenance block malformed";
    if (!t || t.from !== "MEASURED" || t.to !== "VERIFIED" ||
        ["ACCEPTED", "REFUSED", "QUARANTINED"].indexOf(t.status) === -1) return "transition block malformed";
    if (!g || !isStr(g.run_id) || !isStr(g.challenge_id) || !isNum(g.attempt) ||
        ["PASS", "FAIL", "REFUSE", "QUARANTINE"].indexOf(g.verdict) === -1 || !isStr(g.reason_code)) return "game block malformed";
    if (!ch || !isNum(ch.seq) || !isStr(ch.prev_receipt) || !isStr(ch.entry_hash)) return "chain block malformed";
    return null;
  }

  function verdictConsistent(r) {
    var g = r.game, e = r.evaluation, t = r.transition;
    if (g.verdict === "PASS") {
      if (t.status !== "ACCEPTED" || e.verdict !== "PASS") return false;
      if (t.quarantine) return false; /* a quarantine block on an accepted transition is inconsistent */
    } else if (g.verdict === "QUARANTINE") {
      if (t.status !== "QUARANTINED" || e.verdict !== "INDETERMINATE") return false;
      var q = t.quarantine;
      if (!q || !isStr(q.reason) || !isStr(q.last_valid_state)) return false;
    } else { /* FAIL, REFUSE */
      if (t.status !== "REFUSED") return false;
      if (t.quarantine) return false; /* quarantine block belongs only to QUARANTINED transitions */
      if (e.verdict !== (g.verdict === "FAIL" ? "FAIL" : "INDETERMINATE")) return false;
    }
    return true;
  }

  /*
   * validateChain(receipts, opts) — opts: { expected_final_receipt_id }
   * Returns { valid, completed, count, reasons: [{seq, receipt_id, codes:[]}],
   *           run_codes: [], first_bad: {seq, receipt_id, codes}|null }
   */
  function validateChain(receipts, opts) {
    opts = opts || {};
    var report = { valid: true, completed: false, count: 0, reasons: [], run_codes: [], first_bad: null };
    if (!Array.isArray(receipts)) { report.run_codes.push("MALFORMED_RECEIPT"); report.valid = false; return report; }
    report.count = receipts.length;
    var seenIds = {}, seenHashes = {}, prevStoredId = T.GENESIS, prevHash = T.GENESIS, runId = null;
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      var codes = [];
      var rid = "(unparseable)";
      var seq = null;
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        codes.push("MALFORMED_RECEIPT");
        report.reasons.push({ seq: i, receipt_id: rid, codes: codes });
        continue;
      }
      rid = isStr(r.receipt_id) ? r.receipt_id : "(missing receipt_id)";
      seq = r.game && r.game.chain && isNum(r.game.chain.seq) ? r.game.chain.seq : null;
      if (r.schema !== T.SCHEMA_ID) {
        codes.push("UNSUPPORTED_SCHEMA");
        report.reasons.push({ seq: seq === null ? i : seq, receipt_id: rid, codes: codes });
        continue;
      }
      var mal = envelopeMalformed(r);
      if (mal) codes.push("MALFORMED_RECEIPT");
      if (seq === null) {
        codes.push("MALFORMED_RECEIPT");
      } else if (seq !== i) {
        codes.push(seq < i ? "REORDERED_CHAIN" : "SEQ_GAP");
      }
      if (!mal) {
        if (r.game.chain.prev_receipt !== prevStoredId) codes.push("BROKEN_PREDECESSOR");
        /* recompute the chain link from the frozen contract */
        try {
          var recomputed = T.sha256hex(prevHash + T.canon(T.stripForHash(r)));
          if (recomputed !== r.game.chain.entry_hash) codes.push("INVALID_HASH");
          if (rid !== "rcpt-" + recomputed.slice(0, 16)) codes.push("INVALID_HASH");
          if (Object.prototype.hasOwnProperty.call(seenHashes, recomputed)) codes.push("DUPLICATE_RECEIPT");
          seenHashes[recomputed] = true;
          prevHash = recomputed;
        } catch (err) {
          codes.push("MALFORMED_RECEIPT");
        }
        if (Object.prototype.hasOwnProperty.call(seenIds, rid)) codes.push("DUPLICATE_RECEIPT");
        seenIds[rid] = true;
        if (!verdictConsistent(r)) codes.push("INCONSISTENT_VERDICT");
        if (runId === null) runId = r.game.run_id;
        else if (r.game.run_id !== runId) codes.push("RUN_MISMATCH");
        prevStoredId = rid;
      }
      if (codes.length) {
        report.reasons.push({ seq: seq === null ? i : seq, receipt_id: rid, codes: codes });
        if (report.first_bad === null) report.first_bad = { seq: seq === null ? i : seq, receipt_id: rid, codes: codes.slice() };
      }
    }
    if (opts.expected_final_receipt_id && !Object.prototype.hasOwnProperty.call(seenIds, opts.expected_final_receipt_id)) {
      report.run_codes.push("TRUNCATED_CHAIN");
    }
    report.valid = report.reasons.length === 0 && report.run_codes.length === 0;
    report.completed = receipts.some(function (r) {
      return r && r.game && r.game.challenge_id === APEX_CHALLENGE && r.game.verdict === "PASS";
    });
    return report;
  }

  function validateRun(runFile) {
    var base = { schema_ok: false, run_id: null, valid: false, completed: false, count: 0, reasons: [], run_codes: [] };
    if (!runFile || typeof runFile !== "object" || Array.isArray(runFile)) {
      base.run_codes.push("MALFORMED_RECEIPT"); return base;
    }
    if (runFile.schema !== T.CHAIN_NS) { base.run_codes.push("UNSUPPORTED_SCHEMA"); return base; }
    base.schema_ok = true;
    base.run_id = runFile.run_id || null;
    var rep = validateChain(runFile.receipts || [], { expected_final_receipt_id: runFile.expected_final_receipt_id });
    base.valid = rep.valid && rep.run_codes.length === 0;
    base.completed = rep.completed;
    base.count = rep.count;
    base.reasons = rep.reasons;
    base.run_codes = base.run_codes.concat(rep.run_codes);
    base.first_bad = rep.first_bad || null;
    return base;
  }

  var api = {
    APEX_CHALLENGE: APEX_CHALLENGE,
    REASONS: ["UNSUPPORTED_SCHEMA", "MALFORMED_RECEIPT", "INVALID_HASH", "BROKEN_PREDECESSOR",
              "SEQ_GAP", "REORDERED_CHAIN", "DUPLICATE_RECEIPT", "RUN_MISMATCH",
              "INCONSISTENT_VERDICT", "TRUNCATED_CHAIN"],
    validateChain: validateChain,
    validateRun: validateRun
  };
  root.KIN = root.KIN || {};
  root.KIN.Validator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

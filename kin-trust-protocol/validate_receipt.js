#!/usr/bin/env node
/*
 * Kinetigor Trust Protocol — fail-closed receipt judge, v1.0.0
 *
 * Zero dependencies. Node >= 16.
 *   node validate_receipt.js <receipt.json> [<receipt.json> ...]
 * Exit codes: 0 = every promotion ACCEPTED
 *             1 = at least one promotion REFUSED (a well-formed QUARANTINED
 *                 disposition also exits 1 — the refusal IS the record)
 *             2 = malformed receipt or judge error (NEVER treated as accept)
 *
 * The judge is pure: it validates evidence, it never produces or alters it.
 * Fail-closed: any unknown value, missing field, or unsupported verdict is a
 * refusal, never a pass. The receipt does not get to certify itself: the judge
 * computes its own verdict from the evidence gate and refuses on mismatch.
 *
 * What the judge checks: structure, falsifier presence, rung adjacency
 * (nothing skips a rung), per-state evidence gates, verdict/status consistency,
 * quarantine dispositions, and the commercial-disposition vocabulary.
 *
 * What the judge deliberately cannot check: whether an evidence locator's
 * content semantically satisfies the claim. That truth lives at the locator,
 * where any stranger can dereference it. The judge guarantees no promotion
 * without the required KIND of evidence — the receipt guarantees the evidence
 * is checkable by anyone.
 */
"use strict";

var SCHEMA_ID = "kinetigor.trust-receipt/v1";
var STATES = ["CLAIMED", "BUILT", "MEASURED", "VERIFIED", "STAGED", "DEPLOYED", "LIVE-VERIFIED", "OFFERED", "SOLD"];
var DISPOSITIONS = ["RETAIN", "LICENSE", "SELL_PRODUCT", "SELL_SERVICE", "SHOWCASE", "NOT_FOR_SALE"];

/* What evidence each promotion gate demands.
 * mode "all": every listed type must appear at least once.
 * mode "any": at least one listed type must appear.
 * mode "none": registration only.
 */
var GATES = {
  "CLAIMED":       { mode: "none", types: [],                        doc: "registration only: exact proposition + falsifier; promotes nothing" },
  "BUILT":         { mode: "any",  types: ["artifact"],              doc: "artifact locator + digest or byte size, measured at the target" },
  "MEASURED":      { mode: "any",  types: ["hash", "test", "observation"], doc: "direct observation with a raw result; a measurement is not a pass" },
  "VERIFIED":      { mode: "any",  types: ["test", "judge"],         doc: "a pre-registered acceptance rule evaluated against measurements" },
  "STAGED":        { mode: "all",  types: ["commit", "manifest"],   doc: "release-candidate commit identity AND a staged manifest" },
  "DEPLOYED":      { mode: "any",  types: ["deployment"],           doc: "TARGET-SIDE observation tying live bytes to the staged candidate — a deploy command is not evidence" },
  "LIVE-VERIFIED": { mode: "any",  types: ["observation"],          doc: "independent post-deploy observation at a public/live locator" },
  "OFFERED":       { mode: "any",  types: ["publication"],           doc: "stranger-obtainable offer locator + terms + claim parity" },
  "SOLD":          { mode: "any",  types: ["transaction"],          doc: "platform/escrow transaction record" }
};

function nonEmpty(x) { return typeof x === "string" && x.trim().length > 0; }

function judge(receipt) {
  var out = { receipt_id: null, receipt_valid: false, promotion: "REFUSED", disposition: null, reasons: [] };
  function fail(msg) { out.reasons.push(msg); }

  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) { fail("receipt is not an object"); return out; }
  if (receipt.schema !== SCHEMA_ID) { fail("unknown schema " + JSON.stringify(receipt.schema) + " — expected " + SCHEMA_ID); return out; }
  out.receipt_id = nonEmpty(receipt.receipt_id) ? receipt.receipt_id : "(missing receipt_id)";
  if (!nonEmpty(receipt.receipt_id)) fail("receipt_id missing");

  var c = receipt.claim, t = receipt.transition, ev = receipt.evidence, e = receipt.evaluation, p = receipt.provenance;

  if (!c || typeof c !== "object") { fail("claim block missing"); return out; }
  if (!t || typeof t !== "object") fail("transition block missing");
  if (!Array.isArray(ev)) fail("evidence block missing or not an array");
  if (!e || typeof e !== "object") fail("evaluation block missing");
  if (!p || typeof p !== "object") fail("provenance block missing");

  var s = receipt.subject;
  if (!s || typeof s !== "object" || !nonEmpty(s.kind) || !nonEmpty(s.id)) fail("subject.kind / subject.id missing");

  if (!nonEmpty(c.statement)) fail("claim.statement missing — a receipt must assert an exact proposition");
  if (!nonEmpty(c.falsifier)) fail("claim.falsifier missing — a claim without a falsifier cannot progress");

  var from = c.previous_state, to = c.requested_state;
  if (to === "CLAIMED") {
    if (from !== null) fail("CLAIMED registration must have previous_state null");
  } else {
    var i = STATES.indexOf(from), j = STATES.indexOf(to);
    if (i === -1) fail("previous_state " + JSON.stringify(from) + " is not a known state");
    if (j === -1) fail("requested_state " + JSON.stringify(to) + " is not a known state");
    if (i !== -1 && j !== -1 && j !== i + 1) fail("run skipped: " + from + " → " + to + " — nothing skips a rung");
  }

  if (t) {
    if (t.from !== from || t.to !== to) fail("transition.from/to disagree with claim.previous_state/requested_state");
    if (["ACCEPTED", "REFUSED", "QUARANTINED"].indexOf(t.status) === -1) fail("transition.status must be ACCEPTED, REFUSED or QUARANTINED");
    if (t.status === "QUARANTINED") {
      var q = t.quarantine;
      if (!q || typeof q !== "object" || !nonEmpty(q.reason) || !nonEmpty(q.last_valid_state)) {
        fail("QUARANTINED disposition requires quarantine.reason and quarantine.last_valid_state");
      } else {
        out.disposition = "QUARANTINED";
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(receipt, "commercial_disposition")) {
    if (DISPOSITIONS.indexOf(receipt.commercial_disposition) === -1) {
      fail("commercial_disposition must be one of " + DISPOSITIONS.join(" | "));
    }
  }

  var types = [];
  if (Array.isArray(ev)) {
    ev.forEach(function (x, n) {
      if (!x || typeof x !== "object") { fail("evidence[" + n + "] is not an object"); return; }
      if (!nonEmpty(x.type)) { fail("evidence[" + n + "].type missing"); return; }
      if (!nonEmpty(x.locator)) { fail("evidence[" + n + "].locator missing — evidence must be checkable by a stranger");
        return; }
      if (!nonEmpty(x.observed_result)) { fail("evidence[" + n + "].observed_result missing — narration is not observation"); }
      if (["artifact", "hash", "deployment"].indexOf(x.type) !== -1 && !nonEmpty(x.digest)) {
        fail("evidence[" + n + "].digest required for type " + x.type);
      }
      types.push(x.type);
    });
  }

  if (to && GATES[to]) {
    var g = GATES[to];
    if (g.mode !== "none" && (!Array.isArray(ev) || ev.length === 0)) fail("gate " + to + " requires at least one evidence entry");
    if (g.mode === "all") {
      g.types.forEach(function (need) {
        if (types.indexOf(need) === -1) {
          fail("gate " + to + " requires evidence of type " + need + " (" + g.doc + ") — present types: " + (types.length ? types.join(", ") : "none"));
        }
      });
    } else if (g.mode === "any") {
      var ok = g.types.some(function (need) { return types.indexOf(need) !== -1; });
      if (!ok) fail("gate " + to + " requires evidence of type " + g.types.join(" | ") + " (" + g.doc + ") — present types: " + (types.length ? types.join(", ") : "none"));
    }
  }

  if (e) {
    if (!nonEmpty(e.gate)) fail("evaluation.gate missing — the acceptance rule must be named");
    if (!nonEmpty(e.expected)) fail("evaluation.expected missing — the acceptance condition must be stated");
    if (!nonEmpty(e.observed)) fail("evaluation.observed missing");
    if (["PASS", "FAIL", "INDETERMINATE"].indexOf(e.verdict) === -1) fail("evaluation.verdict must be PASS, FAIL or INDETERMINATE");
  }

  if (p) {
    if (!nonEmpty(p.actor)) fail("provenance.actor missing");
    if (!nonEmpty(p.method)) fail("provenance.method missing");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p.timestamp || "")) fail("provenance.timestamp must be ISO-8601");
  }

  /* The judge computes its own verdict; the receipt may not self-certify. */
  var computed = out.reasons.length === 0 ? "PASS" : "FAIL";
  if (e && computed !== e.verdict) {
    fail("receipt verdict " + e.verdict + " is not supported by the judge (computed " + computed + ") — no self-certification");
  }
  if (t && computed === "PASS" && t.status !== "ACCEPTED") fail("judge computed PASS but transition.status is not ACCEPTED");
  if (t && computed === "FAIL" && t.status === "ACCEPTED") fail("judge computed FAIL but transition.status is ACCEPTED — evidence does not support this promotion");

  out.receipt_valid = out.reasons.length === 0;
  out.promotion = out.receipt_valid && e && e.verdict === "PASS" && t && t.status === "ACCEPTED" ? "ACCEPTED" : "REFUSED";
  return out;
}

function main() {
  var files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node validate_receipt.js <receipt.json> [<receipt.json> ...]");
    process.exit(2);
  }
  var fs = require("fs");
  var refused = 0, errored = 0;
  files.forEach(function (f) {
    var raw;
    try { raw = fs.readFileSync(f, "utf8"); } catch (err) { console.error(f + ": unreadable — " + err.message); errored++; return; }
    var receipt;
    try { receipt = JSON.parse(raw); } catch (err) { console.error(f + ": invalid JSON — " + err.message); errored++; return; }
    var out = judge(receipt);
    out.file = f;
    console.log(JSON.stringify(out, null, 2));
    if (out.promotion !== "ACCEPTED") refused++;
  });
  if (errored) process.exit(2);
  process.exit(refused ? 1 : 0);
}

if (typeof module !== "undefined" && typeof require !== "undefined" && require.main === module) { main(); }
if (typeof module !== "undefined") { module.exports = { judge: judge, STATES: STATES, SCHEMA_ID: SCHEMA_ID, GATES: GATES }; }

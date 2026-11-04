/*
 * kinetigor-game — JUDGE KERNEL
 * Verdict algebra and the five deterministic checks, adapted from the
 * Athelgard verify kernel v0.1 spec (MOORPOST Assurance Demo, frozen Nov 4 2026:
 * IDENTITY / PROVENANCE / SEQUENCE / UNIQUENESS / ATOMICITY;
 * severity QUARANTINE > REFUSE > FAIL > PASS; narrator-independence:
 * a record's claimed_status is never authoritative).
 *
 * Zero dependencies. Node >= 16 and browsers.
 */
(function (root) {
  "use strict";
  if (typeof require === "function" && (!root.KIN || !root.KIN.Trust)) require("./trust.js");

  var CHECKS = ["IDENTITY", "PROVENANCE", "SEQUENCE", "UNIQUENESS", "ATOMICITY"];

  /*
   * verifyRecords(bundle) — bundle:
   *   { roster: [actor, ...],
   *     required_evidence_keys: [key, ...],
   *     records: [ {record_id, actor, action, sequence, nonce,
   *                  digest, claimed_status, state_evidence}, ... ] }
   * Digest contract: digest = sha256hex(canon({actor, action, sequence, nonce})).
   *
   * Returns per record: { record_id, checks: {CHECK: "PASS"|"FAIL"},
   *                       verdict: PASS|FAIL|QUARANTINE,
   *                       claimed_status (echoed, never used for the verdict) }
   * Rules (frozen):
   *   - UNIQUENESS failure (nonce reuse) = integrity condition -> QUARANTINE
   *   - any other failed check -> FAIL
   *   - all checks pass -> PASS
   *   - malformed record (missing fields) -> REFUSE on that record
   *   - claimed_status is echoed but NEVER read by the verdict computation
   */
  function verifyRecords(bundle) {
    var roster = bundle.roster || [];
    var reqKeys = bundle.required_evidence_keys || [];
    var seenNonces = {};
    var expectedSeq = 1;
    var results = [];
    for (var i = 0; i < bundle.records.length; i++) {
      var r = bundle.records[i];
      var out = { record_id: r && typeof r === "object" ? r.record_id : "(malformed)", checks: {}, verdict: "REFUSE", claimed_status: r && r.claimed_status };
      if (!r || typeof r !== "object" || !r.record_id || typeof r.actor !== "string" ||
          typeof r.action !== "string" || typeof r.nonce !== "string" ||
          typeof r.sequence !== "number" || typeof r.digest !== "string") {
        out.checks = { MALFORMED: "FAIL" };
        results.push(out);
        continue;
      }
      /* IDENTITY */
      out.checks.IDENTITY = roster.indexOf(r.actor) !== -1 ? "PASS" : "FAIL";
      /* PROVENANCE: digest must commit the canonical core of the record */
      var core = { actor: r.actor, action: r.action, sequence: r.sequence, nonce: r.nonce };
      out.checks.PROVENANCE = (root.KIN.Trust.sha256hex(root.KIN.Trust.canon(core)) === r.digest) ? "PASS" : "FAIL";
      /* SEQUENCE: contiguous from 1 in listed order */
      out.checks.SEQUENCE = (r.sequence === expectedSeq) ? "PASS" : "FAIL";
      expectedSeq += 1;
      /* UNIQUENESS: nonce never seen in any earlier record */
      out.checks.UNIQUENESS = Object.prototype.hasOwnProperty.call(seenNonces, r.nonce) ? "FAIL" : "PASS";
      seenNonces[r.nonce] = true;
      /* ATOMICITY: state evidence complete */
      var ev = r.state_evidence;
      var complete = ev && typeof ev === "object";
      if (complete) {
        for (var k = 0; k < reqKeys.length; k++) {
          var v = ev[reqKeys[k]];
          if (!(typeof v === "string" && v.length > 0)) { complete = false; break; }
        }
      }
      out.checks.ATOMICITY = complete ? "PASS" : "FAIL";
      /* verdict — narrator-independent by construction */
      if (out.checks.UNIQUENESS === "FAIL") out.verdict = "QUARANTINE";
      else if (out.checks.IDENTITY === "PASS" && out.checks.PROVENANCE === "PASS" &&
               out.checks.SEQUENCE === "PASS" && out.checks.ATOMICITY === "PASS") out.verdict = "PASS";
      else out.verdict = "FAIL";
      results.push(out);
    }
    return results;
  }

  var api = { CHECKS: CHECKS, verifyRecords: verifyRecords };
  root.KIN = root.KIN || {};
  root.KIN.Kernel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

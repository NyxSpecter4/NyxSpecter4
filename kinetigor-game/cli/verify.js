#!/usr/bin/env node
/*
 * kinetigor-game — INDEPENDENT VERIFIER
 *   node cli/verify.js <run-file.json> [--v1-audit]
 *
 * Validates an exported game run against the frozen contract (CONTRACT.md).
 * It never asks the game UI whether the player won. It trusts only the
 * frozen contract and the supplied bytes.
 *
 * --v1-audit additionally runs the ORIGINAL Kinetigor Trust Protocol v1
 * judge (vendor/validate_receipt.js — the estate's frozen fail-closed
 * judge, verbatim) over each receipt envelope. Expected audit results
 * for an honest chain: ACCEPTED game receipts -> promotion ACCEPTED;
 * REFUSED game receipts -> refused by the v1 judge (it cannot see the
 * challenge truth, so a declared FAIL is unsupported STRUCTURALLY — this
 * is a documented domain boundary, see CONTRACT.md); QUARANTINED game
 * receipts -> well-formed QUARANTINED records.
 *
 * Exit codes: 0 = chain VALID (completed flag reported separately)
 *             1 = chain INVALID (reason codes printed)
 *             2 = malformed file / judge error (never treated as valid)
 */
"use strict";

var fs = require("fs");
var path = require("path");
var V = require(path.join(__dirname, "..", "core", "validator.js"));
var estateJudge = require(path.join(__dirname, "..", "vendor", "validate_receipt.js")).judge;

function main() {
  var args = process.argv.slice(2);
  var audit = args.indexOf("--v1-audit") !== -1;
  args = args.filter(function (a) { return a !== "--v1-audit"; });
  if (args.length !== 1) {
    console.error("usage: node cli/verify.js <run-file.json> [--v1-audit]");
    process.exit(2);
  }
  var raw;
  try { raw = fs.readFileSync(args[0], "utf8"); }
  catch (err) { console.error("unreadable: " + err.message); process.exit(2); }
  var run;
  try { run = JSON.parse(raw); }
  catch (err) { console.error("invalid JSON: " + err.message); process.exit(2); }

  var rep = V.validateRun(run);
  var out = {
    schema_ok: rep.schema_ok,
    run_id: rep.run_id,
    receipts: rep.count,
    chain_valid: rep.valid,
    completed: rep.completed,
    run_codes: rep.run_codes,
    failures: rep.reasons
  };
  console.log(JSON.stringify(out, null, 2));

  if (audit && Array.isArray(run.receipts)) {
    var auditOut = run.receipts.map(function (r) {
      var j = estateJudge(r);
      return {
        receipt_id: r.game && r.game.chain ? r.receipt_id : "(malformed)",
        game_verdict: r.game ? r.game.verdict : null,
        v1_receipt_valid: j.receipt_valid,
        v1_promotion: j.promotion,
        v1_disposition: j.disposition,
        v1_reasons: j.reasons
      };
    });
    console.log(JSON.stringify({ v1_audit: auditOut }, null, 2));
  }

  if (!rep.schema_ok) process.exit(2);
  process.exit(rep.valid ? 0 : 1);
}

main();

#!/usr/bin/env node
/*
 * kin-ship-gate runner — the dock's OFFERED interlock.
 * Invokes THE judge (kin-trust-protocol/validate_receipt.js) unchanged, as a
 * subprocess, on one or more trust receipts. The gate adds no logic of its
 * own: its whole value is that it is the ONLY door, and the door is the judge.
 *
 * Exit codes mirror the judge exactly:
 *   0 = every promotion ACCEPTED
 *   1 = at least one REFUSED/QUARANTINED (the refusal IS the record)
 *   2 = malformed receipt or runner error (NEVER treated as accept)
 */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const judgePath = path.resolve(__dirname, "..", "kin-trust-protocol", "validate_receipt.js");
const receipts = process.argv.slice(2);
if (!receipts.length) {
  console.error("usage: node ship_gate.js <receipt.json> [<receipt.json> ...]");
  process.exit(2);
}
const result = spawnSync("node", [judgePath].concat(receipts), { stdio: "inherit" });
if (result.error) { console.error("ship_gate: judge could not be executed — " + result.error.message); process.exit(2); }
process.exit(result.status === null ? 2 : result.status);

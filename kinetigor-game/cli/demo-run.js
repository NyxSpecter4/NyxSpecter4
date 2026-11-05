#!/usr/bin/env node
/*
 * kinetigor-game — DETERMINISTIC DEMO RUN
 *   node cli/demo-run.js            (writes receipts/demo-run.json, prints summary)
 *
 * Plays the complete run through the SAME core modules the browser UI uses:
 * start -> inspect -> submit evidence -> judge -> verdict -> receipt -> chain
 * -> export. Includes a wrong attempt, a replay quarantine, and a
 * no-authority refusal so the exported chain honestly records failures.
 *
 * Fully deterministic (fixed run id, player name, clock): re-running
 * reproduces byte-identical receipts and an identical chain.
 */
"use strict";

var path = require("path");
var fs = require("fs");
require(path.join(__dirname, "..", "www", "fixtures.js")); /* sets KIN.FIXTURES */
var Game = require(path.join(__dirname, "..", "www", "core", "game.js"));
var T = require(path.join(__dirname, "..", "www", "core", "trust.js"));

function playDemo() {
  /* deterministic clock: reset per play so every playDemo() reproduces
   * byte-identical receipts (timestamps never enter receipt identity). */
  var t = 0;
  var CLOCK = function () {
    t += 1;
    return "2026-11-04T10:" + String(10 + t).padStart(2, "0") + ":00Z";
  };
  var state = Game.newRun("Demo Verifier", { run_id: "run-demo-0001" });
  var log = [];

  function step(challengeId, evidence) {
    var res = Game.submit(state, challengeId, evidence, { clock: CLOCK });
    if (!res.judged) throw new Error("demo: unexpected non-judgment at " + challengeId);
    log.push({
      challenge: challengeId,
      attempt: res.receipt.game.attempt,
      verdict: res.verdict,
      reason_code: res.reason_code,
      receipt_id: res.receipt.receipt_id,
      prev: res.receipt.game.chain.prev_receipt,
      entry_hash: res.receipt.game.chain.entry_hash
    });
    return res;
  }

  /* STAGE 0 — correct immediately */
  var w = require(path.join(__dirname, "..", "www", "core", "challenges.js"))._internals.warrantRecords[0];
  step("arrival-00", { record_id: w.record_id, digest: T.sha256hex(T.canon(w.fields)) });

  /* STAGE 1 — one wrong guess, then the right waybill */
  var wb = require(path.join(__dirname, "..", "www", "core", "challenges.js"))._internals.waybills;
  step("postbridge-01", { record_id: "PB-77-001", recomputed_digest: T.sha256hex(T.canon(wb[0].fields)) });
  var amended = wb[3];
  step("postbridge-01", { record_id: amended.record_id, recomputed_digest: T.sha256hex(T.canon(amended.fields)) });

  /* STAGE 2 — walk the cache chain, file the quarantine order */
  var F = globalThis.KIN.FIXTURES;
  var V = require(path.join(__dirname, "..", "www", "core", "validator.js"));
  var rep = V.validateChain(F.cache_chain.chain, {});
  var bad = rep.reasons.filter(function (r) { return r.codes.indexOf("INVALID_HASH") !== -1; })[0];
  var lastValid = F.cache_chain.chain[bad.seq - 1].receipt_id;
  var cacheRes = step("cache-02", {
    first_bad_receipt_id: bad.receipt_id,
    reason_code: "INVALID_HASH",
    last_valid_receipt_id: lastValid
  });
  var authority = cacheRes.receipt.receipt_id;

  /* replay the identical order -> QUARANTINE / REPLAY_DETECTED */
  step("cache-02", {
    first_bad_receipt_id: bad.receipt_id,
    reason_code: "INVALID_HASH",
    last_valid_receipt_id: lastValid
  });

  /* STAGE 3 — no authority first, then the wrong path, then the survivor */
  step("delivery-03", { relay_path: "PATH-R", first_refused_hop: "2", first_refusal_code: "REFUSED_PROVENANCE", authority_receipt: "rcpt-0000000000000000" });
  step("delivery-03", { relay_path: "PATH-M", first_refused_hop: "2", first_refusal_code: "REFUSED_PROVENANCE", authority_receipt: authority });
  step("delivery-03", { relay_path: "PATH-R", first_refused_hop: "2", first_refusal_code: "REFUSED_PROVENANCE", authority_receipt: authority });

  /* STAGE 4 — a rash ruling first, then the one the ledger supports */
  var C = require(path.join(__dirname, "..", "www", "core", "challenges.js"));
  var truth = C._internals.boardTruth({ fixtures: globalThis.KIN.FIXTURES, receipts: state.receipts });
  step("apex-04", {
    go_lanes: ["LANE-A", "LANE-B", "LANE-C", "LANE-D", "LANE-E"],
    actionable_cards: truth.actionable_cards,
    quarantine_record: "DX-202"
  });
  var apex = step("apex-04", {
    go_lanes: truth.go_lanes,
    actionable_cards: truth.actionable_cards,
    quarantine_record: truth.quarantine_record
  });

  if (!apex.completed) throw new Error("demo: run did not complete");
  var runFile = Game.exportRun(state, { clock: CLOCK });
  return { log: log, runFile: runFile };
}

function main() {
  var demo = playDemo();
  var outDir = path.join(__dirname, "..", "receipts");
  fs.mkdirSync(outDir, { recursive: true });
  var dest = path.join(outDir, "demo-run.json");
  fs.writeFileSync(dest, JSON.stringify(demo.runFile, null, 2) + "\n");
  demo.log.forEach(function (l) {
    console.log(l.challenge + " attempt " + l.attempt + " -> " + l.verdict + " (" + l.reason_code + ") " + l.receipt_id);
  });
  console.log("run exported: " + dest + " (" + demo.runFile.receipts.length + " receipts)");
}

if (typeof require !== "undefined" && require.main === module) { main(); }
if (typeof module !== "undefined") { module.exports = { playDemo: playDemo }; }

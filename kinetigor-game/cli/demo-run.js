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
var Game = require(path.join(__dirname, "..", "core", "game.js"));
var T = require(path.join(__dirname, "..", "core", "trust.js"));

var CLOCK = (function () {
  var t = 0;
  return function () {
    t += 1;
    return "2026-11-04T10:" + String(10 + t).padStart(2, "0") + ":00Z";
  };
})();

function playDemo() {
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
  var w = require(path.join(__dirname, "..", "core", "challenges.js"))._internals.warrantRecords[0];
  step("arrival-00", { record_id: w.record_id, digest: T.sha256hex(T.canon(w.fields)) });

  /* STAGE 1 — one wrong guess, then the right waybill */
  var wb = require(path.join(__dirname, "..", "core", "challenges.js"))._internals.waybills;
  step("postbridge-01", { record_id: "PB-77-001", recomputed_digest: T.sha256hex(T.canon(wb[0].fields)) });
  var amended = wb[3];
  step("postbridge-01", { record_id: amended.record_id, recomputed_digest: T.sha256hex(T.canon(amended.fields)) });

  /* STAGE 2 — walk the cache chain, file the quarantine order */
  var F = globalThis.KIN.FIXTURES;
  var V = require(path.join(__dirname, "..", "core", "validator.js"));
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

  /* STAGE 3 — no authority first, then the packet whose provenance carries */
  step("delivery-03", { packet_id: "PKT-A", authority_receipt: "rcpt-0000000000000000" });
  step("delivery-03", { packet_id: "PKT-A", authority_receipt: authority });

  /* STAGE 4 — wrong liar set, then the decisive evidence */
  step("apex-04", { quarantine_record: "DX-202", liar_records: ["DX-203", "DX-204"], deliverable_record: "DX-201" });
  var apex = step("apex-04", {
    quarantine_record: "DX-202",
    liar_records: ["DX-204", "DX-205"],
    deliverable_record: "DX-201"
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

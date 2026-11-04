#!/usr/bin/env node
/*
 * kinetigor-game — SELFTEST (all proof layers)
 *   node cli/selftest.js
 *
 * L1 UNIT        sha256 (FIPS vectors), canonicalization, receipt formation
 * L2 CONTRACT    frozen test vectors (test/vectors.json) — byte-exact
 * L3 MUTATION    every attack class -> DETECTION -> reason code
 * L4 INTEGRATION submit -> judge -> receipt -> chain -> independent validator
 *                + estate v1 judge cross-compat (vendor/validate_receipt.js)
 * L5 GAME FLOW   locks, unlocks, completion, replay quarantine, export
 * L6 FIXTURES    deterministic regeneration, fixture invariants
 *
 * Exit code 0 only if every assertion holds. No test is ever weakened to
 * pass (hard rule); a failing layer is a finding, not a patch target.
 */
"use strict";

var path = require("path");
var fs = require("fs");
var T = require(path.join(__dirname, "..", "core", "trust.js"));
var K = require(path.join(__dirname, "..", "core", "kernel.js"));
var V = require(path.join(__dirname, "..", "core", "validator.js"));
var C = require(path.join(__dirname, "..", "core", "challenges.js"));
var Game = require(path.join(__dirname, "..", "core", "game.js"));
require(path.join(__dirname, "..", "www", "fixtures.js")); /* KIN.FIXTURES */
var F = globalThis.KIN.FIXTURES;
var estateJudge = require(path.join(__dirname, "..", "vendor", "validate_receipt.js")).judge;
var FIXTURES_SOURCE = fs.readFileSync(path.join(__dirname, "..", "www", "fixtures.js"), "utf8");

var passed = 0, failed = 0, failures = [];
function ok(cond, label) {
  if (cond) { passed++; }
  else { failed++; failures.push(label); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label + " | got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function section(name) { console.log("\n== " + name + " =="); }
function hasCode(report, seq, code) {
  return report.reasons.some(function (r) { return r.seq === seq && r.codes.indexOf(code) !== -1; }) ||
         (seq === null && report.run_codes.indexOf(code) !== -1);
}
function hasCodeAnywhere(report, code) {
  return report.run_codes.indexOf(code) !== -1 ||
         report.reasons.some(function (r) { return r.codes.indexOf(code) !== -1; });
}
function canonDigest(v) { return T.sha256hex(T.canon(v)); }
function clone(x) { return JSON.parse(JSON.stringify(x)); }
/* rehash: attacker-forge a consistent hash after tampering */
function rehash(receipt, prevHash) {
  receipt.game.chain.entry_hash = T.sha256hex(prevHash + T.canon(T.stripForHash(receipt)));
  receipt.receipt_id = "rcpt-" + receipt.game.chain.entry_hash.slice(0, 16);
  return receipt;
}

/* ---------- L1 UNIT ---------- */
section("L1 UNIT");
var VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "vectors.json"), "utf8"));
VECTORS.sha256.forEach(function (v) { eq(T.sha256hex(v.input), v.expected, "sha256 " + v.source + " '" + v.input.slice(0, 20) + "'"); });
ok(canonDigest({ b: 2, a: 1 }) === T.sha256hex('{"a":1,"b":2}'), "canon sorts keys");
try { T.canon({ x: undefined }); ok(false, "canon rejects undefined"); }
catch (e) { ok(true, "canon rejects undefined"); }
try { T.canon({ x: NaN }); ok(false, "canon rejects NaN"); }
catch (e) { ok(true, "canon rejects NaN"); }
(function () {
  var p = {
    run_id: "run-unit", player: "U", challenge_id: "c", attempt: 1, verdict: "PASS",
    reason_code: "R", observed: "o", subject_id: "c", subject_version: "1.0.0",
    claim: { statement: "s", falsifier: "f" }, gate: "g", expected: "e",
    timestamp: "2026-11-04T00:00:00Z", quarantine: null, seq: 0, prev: null
  };
  var r1 = T.buildReceipt(clone(p));
  var r2 = T.buildReceipt(clone(p));
  eq(r1, r2, "receipt formation deterministic");
  eq(r1.game.chain.prev_receipt, "GENESIS", "genesis predecessor");
  ok(r1.receipt_id === "rcpt-" + r1.game.chain.entry_hash.slice(0, 16), "receipt id derivation");
  var p2 = clone(p); p2.seq = 1; p2.prev = { receipt_id: r1.receipt_id, entry_hash: r1.game.chain.entry_hash };
  var r3 = T.buildReceipt(p2);
  ok(r3.game.chain.entry_hash !== r1.game.chain.entry_hash, "chain link advances");
})();

/* ---------- L2 CONTRACT (frozen vectors) ---------- */
section("L2 CONTRACT");
VECTORS.canon.forEach(function (c) {
  eq(T.canon(JSON.parse(c.canonical)), c.canonical, "canon round-trip " + c.name);
  eq(T.sha256hex(c.canonical), c.sha256, "canon hash " + c.name);
});
(function () {
  var rep = V.validateChain(VECTORS.chain.receipts.map(function (r) {
    return r; /* ids only: rebuild full receipts from vectors via ids/hashes check below */
  }).length ? [] : []);
})();
/* rebuild the mini-chain from the vector INPUTS and compare byte-exact */
(function () {
  var defs = [
    { cid: "vector-a", att: 1, v: "PASS", rc: "V_PASS", o: "vector observation a", ts: "2026-11-04T00:00:01Z" },
    { cid: "vector-a", att: 2, v: "FAIL", rc: "V_FAIL", o: "vector observation b", ts: "2026-11-04T00:00:02Z" },
    { cid: "vector-b", att: 1, v: "QUARANTINE", rc: "V_REPLAY", o: "vector observation c", ts: "2026-11-04T00:00:03Z" }
  ];
  var prev = null;
  defs.forEach(function (p, i) {
    var r = T.buildReceipt({
      run_id: "run-vector-0001", player: "Vector Verifier", challenge_id: p.cid, attempt: p.att,
      verdict: p.v, reason_code: p.rc, observed: p.o, subject_id: p.cid, subject_version: "1.0.0",
      claim: { statement: "vector claim " + p.cid, falsifier: "vector falsifier " + p.cid },
      gate: "vector/gate", expected: "vector expected condition", timestamp: p.ts,
      quarantine: p.v === "QUARANTINE" ? { reason: "V_REPLAY", last_valid_state: "MEASURED" } : null,
      seq: i, prev: prev
    });
    var want = VECTORS.chain.receipts[i];
    eq(r.receipt_id, want.receipt_id, "vector receipt_id " + i);
    eq(r.game.chain.entry_hash, want.entry_hash, "vector entry_hash " + i);
    eq(T.canon(T.stripForHash(r)), want.canonical_payload, "vector canonical payload " + i);
    prev = { receipt_id: r.receipt_id, entry_hash: r.game.chain.entry_hash };
  });
  /* the frozen chain must validate */
  var chain = VECTORS.chain.receipts.map(function (w, i) {
    return JSON.parse(w.canonical_payload);
  }).map(function (base, i) {
    var w = VECTORS.chain.receipts[i];
    var r = base; r.receipt_id = w.receipt_id; r.game.chain.entry_hash = w.entry_hash;
    return r;
  });
  var rep = V.validateChain(chain, {});
  eq(rep.valid, true, "vector chain validates");
  eq(rep.completed, false, "vector chain not completed (no apex)");
})();

/* ---------- L3 MUTATION (MUTATION -> DETECTION -> REASON CODE) ---------- */
section("L3 MUTATION");
function baseChain() {
  return VECTORS.chain.receipts.map(function (w, i) {
    var r = JSON.parse(w.canonical_payload);
    r.receipt_id = w.receipt_id;
    r.game.chain.entry_hash = w.entry_hash;
    return r;
  });
}
function mut(label, fn, code) {
  var chain = baseChain();
  var report = V.validateChain(fn(chain), {});
  ok(report.reasons.length > 0 || report.run_codes.length > 0, label + " detected");
  ok(hasCodeAnywhere(report, code), label + " -> " + code);
}
mut("m01 altered field", function (ch) { ch[1].evaluation.observed = "tampered text"; return ch; }, "INVALID_HASH");
mut("m02 altered evidence commitment", function (ch) { ch[0].evidence[0].locator = "kinetigor-game://forged"; return ch; }, "INVALID_HASH");
mut("m03 altered verdict (no rehash)", function (ch) { ch[2].game.verdict = "FAIL"; return ch; }, "INVALID_HASH");
mut("m04 altered verdict (attacker rehashes)", function (ch) {
  ch[2].game.verdict = "FAIL"; ch[2].transition.status = "REFUSED"; ch[2].evaluation.verdict = "FAIL";
  rehash(ch[2], ch[1].game.chain.entry_hash);
  return ch;
}, "INCONSISTENT_VERDICT");
mut("m05 deleted receipt", function (ch) { ch.splice(1, 1); return ch; }, "BROKEN_PREDECESSOR");
ok((function () { var ch = baseChain(); ch.splice(1, 1); return V.validateChain(ch, {}); })().reasons.some(function (r) { return r.codes.indexOf("SEQ_GAP") !== -1; }), "m05 deleted receipt -> SEQ_GAP also present");
mut("m06 reordered receipts", function (ch) { var t = ch[1]; ch[1] = ch[2]; ch[2] = t; return ch; }, "REORDERED_CHAIN");
mut("m07 duplicate receipt", function (ch) { ch.push(clone(ch[1])); return ch; }, "DUPLICATE_RECEIPT");
mut("m08 invalid predecessor (rehashed forgery)", function (ch) {
  ch[2].game.chain.prev_receipt = ch[0].receipt_id;
  rehash(ch[2], ch[1].game.chain.entry_hash);
  return ch;
}, "BROKEN_PREDECESSOR");
mut("m09 malformed receipt", function (ch) { delete ch[0].claim; return ch; }, "MALFORMED_RECEIPT");
mut("m10 unsupported schema", function (ch) { ch[1].schema = "kinetigor.trust-receipt/v9"; return ch; }, "UNSUPPORTED_SCHEMA");
mut("m11 broken hash", function (ch) { ch[0].game.chain.entry_hash = ("0" === ch[0].game.chain.entry_hash[0] ? "1" : "0") + ch[0].game.chain.entry_hash.slice(1); return ch; }, "INVALID_HASH");
mut("m13 run_id mismatch (rehashed forgery)", function (ch) {
  ch[2].game.run_id = "run-other";
  rehash(ch[2], ch[1].game.chain.entry_hash);
  return ch;
}, "RUN_MISMATCH");
/* m12 truncation: run-level, requires expected_final_receipt_id */
(function () {
  var ch = baseChain();
  ch.pop();
  var rep = V.validateChain(ch, { expected_final_receipt_id: VECTORS.chain.receipts[2].receipt_id });
  ok(rep.reasons.length > 0 || rep.run_codes.length > 0, "m12 truncated run detected");
  ok(rep.run_codes.indexOf("TRUNCATED_CHAIN") !== -1, "m12 truncated run -> TRUNCATED_CHAIN");
})();
/* m14 replay: judge-level, in L5 */

/* ---------- L4 INTEGRATION ---------- */
section("L4 INTEGRATION");
var demo = require(path.join(__dirname, "..", "cli", "demo-run.js")).playDemo();
var runFile = demo.runFile;
ok(runFile.receipts.length === 9, "demo run produced 9 receipts");
var rep = V.validateRun(runFile);
eq(rep.valid, true, "demo run chain VALID");
eq(rep.completed, true, "demo run COMPLETED");
eq(rep.schema_ok, true, "demo run schema ok");
/* verdict algebra across the chain */
var algebra = { PASS: "ACCEPTED", FAIL: "REFUSED", REFUSE: "REFUSED", QUARANTINE: "QUARANTINED" };
runFile.receipts.forEach(function (r, i) {
  ok(r.transition.status === algebra[r.game.verdict], "algebra receipt " + i);
  ok(r.game.chain.seq === i, "dense seq receipt " + i);
  if (i > 0) ok(r.game.chain.prev_receipt === runFile.receipts[i - 1].receipt_id, "predecessor receipt " + i);
});
/* estate v1 judge cross-compatibility (the frozen estate judge audits our receipts) */
runFile.receipts.forEach(function (r, i) {
  var j = estateJudge(r);
  if (r.game.verdict === "PASS") {
    ok(j.receipt_valid === true, "v1 accepts PASS receipt " + i + " as a genuine v1 promotion");
    ok(j.promotion === "ACCEPTED", "v1 promotion ACCEPTED receipt " + i);
  } else if (r.game.verdict === "QUARANTINE") {
    ok(j.promotion === "REFUSED", "v1 treats game QUARANTINE receipt " + i + " as a refused record (the refusal IS the record)");
    ok(j.disposition === "QUARANTINED", "v1 records QUARANTINED disposition receipt " + i);
  } else {
    ok(j.promotion === "REFUSED", "v1 refuses game " + r.game.verdict + " receipt " + i + " (domain boundary, see CONTRACT.md)");
  }
});
/* v1 negative control: vendored judge refuses missing falsifier */
(function () {
  var badReceipt = clone(runFile.receipts[0]);
  delete badReceipt.claim.falsifier;
  var j = estateJudge(badReceipt);
  ok(j.promotion === "REFUSED", "v1 judge refuses receipt without falsifier (vendoring sanity)");
})();
/* independent verifier CLI behavior via validator API */
(function () {
  var mutated = clone(runFile);
  mutated.receipts[3].evaluation.observed = "forged";
  eq(V.validateRun(mutated).valid, false, "tampered demo run detected by validator");
})();

/* ---------- L5 GAME FLOW ---------- */
section("L5 GAME FLOW");
(function () {
  var clock = (function () { var t = 0; return function () { t += 1; return "2026-11-04T12:00:" + String(t).padStart(2, "0") + "Z"; }; })();
  var state = Game.newRun("Flow Verifier", { run_id: "run-flow-0001" });
  ok(state.unlocked.length === 1 && state.unlocked[0] === "arrival-00", "only stage 0 unlocked at start");
  var locked = Game.submit(state, "postbridge-01", { record_id: "PB-77-004", recomputed_digest: "0" });
  ok(locked.judged === false && locked.error === "CHALLENGE_LOCKED", "locked desk refuses without judgment");
  ok(state.receipts.length === 0, "no receipt minted for a locked attempt");
  var w = C._internals.warrantRecords[0];
  var s0 = Game.submit(state, "arrival-00", { record_id: w.record_id, digest: canonDigest(w.fields) }, { clock: clock });
  ok(s0.verdict === "PASS" && s0.solved, "stage 0 solved");
  ok(state.unlocked.indexOf("postbridge-01") !== -1, "stage 1 unlocked after stage 0");
  /* wrong evidence then correct evidence at stage 1 */
  var wb = C._internals.waybills;
  var s1a = Game.submit(state, "postbridge-01", { record_id: "PB-77-002", recomputed_digest: canonDigest(wb[1].fields) }, { clock: clock });
  ok(s1a.verdict === "FAIL", "wrong waybill fails");
  var amended = wb[3];
  var s1b = Game.submit(state, "postbridge-01", { record_id: amended.record_id, recomputed_digest: canonDigest(amended.fields) }, { clock: clock });
  ok(s1b.verdict === "PASS", "right waybill passes");
  /* replay of identical evidence -> QUARANTINE / REPLAY_DETECTED (m14) */
  var s1c = Game.submit(state, "postbridge-01", { record_id: amended.record_id, recomputed_digest: canonDigest(amended.fields) }, { clock: clock });
  ok(s1c.verdict === "QUARANTINE" && s1c.reason_code === "REPLAY_DETECTED", "m14 replay -> QUARANTINE / REPLAY_DETECTED");
  /* malformed evidence -> REFUSE, still receipted */
  var s1d = Game.submit(state, "postbridge-01", "not-an-object", { clock: clock });
  ok(s1d.verdict === "REFUSE" && s1d.reason_code === "INSUFFICIENT_EVIDENCE", "malformed evidence -> REFUSE receipted");
  /* finish the run through all remaining stages */
  var cacheRep = V.validateChain(F.cache_chain.chain, {});
  var bad = cacheRep.reasons.filter(function (r) { return r.codes.indexOf("INVALID_HASH") !== -1; })[0];
  Game.submit(state, "cache-02", {
    first_bad_receipt_id: bad.receipt_id, reason_code: "INVALID_HASH",
    last_valid_receipt_id: F.cache_chain.chain[bad.seq - 1].receipt_id
  }, { clock: clock });
  var cachePass = state.receipts.filter(function (r) { return r.game.challenge_id === "cache-02" && r.game.verdict === "PASS"; })[0];
  Game.submit(state, "delivery-03", { packet_id: "PKT-A", authority_receipt: cachePass.receipt_id }, { clock: clock });
  Game.submit(state, "delivery-03", { packet_id: "PKT-C", authority_receipt: cachePass.receipt_id }, { clock: clock }); /* FAIL: content is not provenance */
  var last = Game.submit(state, "apex-04", { quarantine_record: "DX-202", liar_records: ["DX-204", "DX-205"], deliverable_record: "DX-201" }, { clock: clock });
  ok(last.completed, "flow run completed");
  var exp = Game.exportRun(state, { clock: clock });
  var rep2 = V.validateRun(exp);
  eq(rep2.valid, true, "flow run chain VALID");
  eq(rep2.completed, true, "flow run COMPLETED");
  /* export determinism under a fixed clock */
  var exp2 = Game.exportRun(state, { clock: function () { return "2026-11-04T12:00:10Z"; } });
  eq(exp, exp2, "export deterministic under fixed clock");
  /* every judgment minted exactly one chained receipt */
  ok(state.receipts.length === 9, "flow run minted 9 receipts for 9 judgments");
})();

/* ---------- L6 FIXTURES ---------- */
section("L6 FIXTURES");
(function () {
  var gen = require(path.join(__dirname, "..", "cli", "make-fixtures.js"));
  var fixtures = gen.buildFixtures();
  var expected = JSON.parse(FIXTURES_SOURCE.match(/root\.KIN\.FIXTURES = ([\s\S]*?);\n  if \(/)[1]);
  eq(fixtures, expected, "fixtures regenerate byte-identical (structural)");
  var rep = V.validateChain(fixtures.cache_chain.chain, {});
  var bad = rep.reasons.filter(function (r) { return r.codes.indexOf("INVALID_HASH") !== -1; });
  ok(bad.length === 3 && bad[0].seq === 3, "cache fixture: first break at seq 3, cascade 3 receipts");
  var acceptable = fixtures.delivery_packets.filter(function (p) {
    return V.validateChain(p.chain, {}).valid && canonDigest(p.content) === p.committed_digest;
  });
  eq(acceptable.map(function (p) { return p.packet_id; }), ["PKT-A"], "exactly PKT-A acceptable");
  var res = K.verifyRecords(fixtures.apex_bundle);
  eq(res.filter(function (r) { return r.verdict === "QUARANTINE"; }).map(function (r) { return r.record_id; }), ["DX-202"], "apex quarantine = DX-202");
  eq(res.filter(function (r) { return r.verdict === "PASS"; }).map(function (r) { return r.record_id; }), ["DX-201"], "apex deliverable = DX-201");
  eq(res.filter(function (r) { return r.claimed_status === "PASS" && r.verdict === "FAIL"; }).map(function (r) { return r.record_id; }).sort(), ["DX-204", "DX-205"], "apex liars = [DX-204, DX-205]");
})();

/* ---------- summary ---------- */
console.log("\n================================");
console.log("PASS: " + passed + "   FAIL: " + failed);
if (failed) {
  console.log("failures:");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
console.log("ALL LAYERS GREEN");
process.exit(0);

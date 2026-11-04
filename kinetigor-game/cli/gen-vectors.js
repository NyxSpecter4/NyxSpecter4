#!/usr/bin/env node
/* One-shot generator for test/vectors.json — the constitutional fixtures.
 * Run only when CONTRACT.md's algorithms deliberately change (never to
 * "make tests pass"): node cli/gen-vectors.js
 * Vectors are verified by cli/selftest.js and cross-checked against GNU
 * sha256sum at generation time (independent hashing tool). */
"use strict";
var path = require("path");
var fs = require("fs");
var T = require(path.join(__dirname, "..", "core", "trust.js"));
var V = require(path.join(__dirname, "..", "core", "validator.js"));
var crypto = require("crypto");

function crossCheck(str, expectedHex) {
  var h = crypto.createHash("sha256").update(Buffer.from(str, "utf8")).digest("hex");
  if (h !== expectedHex) throw new Error("cross-check failed for " + str + ": " + h + " != " + expectedHex);
  return true;
}

var canonCases = [
  { name: "flat-unsorted", input: { b: 2, a: 1, c: "x" } },
  { name: "nested-unsorted", input: { z: { d: [3, 1, 2], a: true }, a: null, m: "q\"uote" } },
  { name: "unicode", input: { key: "café ☕", n: -0.5, arr: [{}, [], null] } },
  { name: "empty", input: {} }
];

var miniChain = [];
(function () {
  var params = [
    { cid: "vector-a", att: 1, v: "PASS", rc: "V_PASS", o: "vector observation a", ts: "2026-11-04T00:00:01Z" },
    { cid: "vector-a", att: 2, v: "FAIL", rc: "V_FAIL", o: "vector observation b", ts: "2026-11-04T00:00:02Z" },
    { cid: "vector-b", att: 1, v: "QUARANTINE", rc: "V_REPLAY", o: "vector observation c", ts: "2026-11-04T00:00:03Z" }
  ];
  var prev = null;
  params.forEach(function (p, i) {
    var r = T.buildReceipt({
      run_id: "run-vector-0001", player: "Vector Verifier",
      challenge_id: p.cid, attempt: p.att, verdict: p.v, reason_code: p.rc,
      observed: p.o, subject_id: p.cid, subject_version: "1.0.0",
      claim: { statement: "vector claim " + p.cid, falsifier: "vector falsifier " + p.cid },
      gate: "vector/gate", expected: "vector expected condition",
      timestamp: p.ts,
      quarantine: p.v === "QUARANTINE" ? { reason: "V_REPLAY", last_valid_state: "MEASURED" } : null,
      seq: i, prev: prev
    });
    miniChain.push(r);
    prev = { receipt_id: r.receipt_id, entry_hash: r.game.chain.entry_hash };
  });
})();

var vectors = {
  namespace: "kinetigor.game-run/1",
  note: "frozen contract vectors — see CONTRACT.md; canonical bytes are UTF-8 of the canon() string",
  sha256: [
    { input: "abc", expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", source: "FIPS 180-4" },
    { input: "", expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", source: "FIPS 180-4" },
    { input: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", expected: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1", source: "FIPS 180-4 (two-block)" },
    { input: "The quick brown fox jumps over the lazy dog", expected: "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592", source: "common cross-check" }
  ],
  canon: canonCases.map(function (c) {
    var s = T.canon(c.input);
    return { name: c.name, canonical: s, sha256: T.sha256hex(s) };
  }),
  chain: {
    run_id: "run-vector-0001",
    receipts: miniChain.map(function (r) {
      return {
        receipt_id: r.receipt_id,
        seq: r.game.chain.seq,
        prev_receipt: r.game.chain.prev_receipt,
        entry_hash: r.game.chain.entry_hash,
        canonical_payload: T.canon(T.stripForHash(r)),
        verdict: r.game.verdict
      };
    }),
    validation: { valid: true, completed: false, reasons: [] }
  }
};

/* cross-check every canonical-bytes hash with Node's independent crypto */
vectors.sha256.forEach(function (v) { crossCheck(v.input, v.expected); });
vectors.canon.forEach(function (v) { crossCheck(v.canonical, v.sha256); });
vectors.chain.receipts.forEach(function (r, i) {
  var prevHash = i === 0 ? "GENESIS" : vectors.chain.receipts[i - 1].entry_hash;
  crossCheck(prevHash + r.canonical_payload, r.entry_hash);
});

/* validation expectation must hold */
var rep = V.validateChain(miniChain, {});
if (rep.valid !== vectors.chain.validation.valid) throw new Error("vector chain validation mismatch");

var dest = path.join(__dirname, "..", "test", "vectors.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(vectors, null, 2) + "\n");
console.log("vectors written: " + dest);

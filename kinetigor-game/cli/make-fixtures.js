#!/usr/bin/env node
/*
 * kinetigor-game — deterministic fixture generator.
 * Regenerates www/fixtures.js (the stage 2/3/4 artifacts).
 * Run: node cli/make-fixtures.js
 * Deterministic: fixed timestamps, fixed run ids, fixed payloads —
 * re-running produces byte-identical output (asserted by cli/selftest.js).
 */
"use strict";

var T = require("../core/trust.js");

function fail(m) { throw new Error("fixture generator: " + m); }
function canonDigest(v) { return T.sha256hex(T.canon(v)); }

/* ---------- fictional chain builder (fixed inputs -> fixed receipts) ---------- */

function buildFictionalReceipt(run_id, subject_id, challenge_id, attempt, verdict, reason_code, observed, claim, gate, expected, timestamp, prev, seq) {
  return T.buildReceipt({
    run_id: run_id,
    player: "Depot Automation",
    challenge_id: challenge_id,
    attempt: attempt,
    verdict: verdict,
    reason_code: reason_code,
    observed: observed,
    subject_id: subject_id,
    subject_version: "1.0.0",
    claim: claim,
    gate: gate,
    expected: expected,
    timestamp: timestamp,
    quarantine: null,
    seq: seq,
    prev: prev
  });
}

function prevOf(r) { return r ? { receipt_id: r.receipt_id, entry_hash: r.game.chain.entry_hash } : null; }

/* ---------- cache chain (stage 2 artifact) ---------- */

function buildCacheChain() {
  var run_id = "run-cache-fixture";
  var claim = {
    statement: "Depot cache crate seals match the canonical bytes of their manifests.",
    falsifier: "Recomputing sha256 over any crate manifest yields a digest different from its recorded seal."
  };
  var gate = "depot-seal/digest-recompute";
  var expected = "recomputed digest equals the recorded seal";
  var verdicts = [
    { v: "PASS", rc: "SEAL_OK", o: "crate manifest verified against its seal" },
    { v: "PASS", rc: "SEAL_OK", o: "crate manifest verified against its seal" },
    { v: "FAIL", rc: "SEAL_MISMATCH", o: "crate 22 recomputes to a different digest than its recorded seal" },
    { v: "PASS", rc: "SEAL_OK", o: "crate manifest verified against its seal" },
    { v: "PASS", rc: "SEAL_OK", o: "crate manifest verified against its seal" },
    { v: "PASS", rc: "SEAL_OK", o: "crate manifest verified against its seal" }
  ];
  var chain = [];
  for (var i = 0; i < verdicts.length; i++) {
    var ts = "2026-10-30T09:" + (10 + i < 10 ? "0" : "") + (10 + i) + ":00Z";
    chain.push(buildFictionalReceipt(
      run_id, "depot-seal-" + (i + 1), "depot-seal", i + 1,
      verdicts[i].v, verdicts[i].rc, verdicts[i].o,
      claim, gate, expected, ts, prevOf(chain[chain.length - 1]), i
    ));
  }
  /* post-hoc tamper: receipt at seq 3 had its recorded observation edited
   * after hashing — the stored entry_hash no longer covers the payload. */
  chain[3].evaluation.observed = "crate manifest verified against its seal (weight amended by hand)";
  return {
    run_id: run_id,
    label: "Depot Cache Log — recovered from the Postbridge cache",
    note: "Receipt seq 3 was edited after the fact; its stored hash still commits the original words.",
    chain: chain
  };
}

/* ---------- delivery packets (stage 3 artifact) ---------- */

function buildPacketChain(run_id, committedDigest) {
  var claim = {
    statement: "The packet's sealing chain commits the digest of the packet content it accompanies.",
    falsifier: "Walking the chain and recomputing the content digest shows the chain never committed this content."
  };
  var gate = "packet-seal/commitment";
  var expected = "final chain receipt commits the content digest recorded at sealing";
  var chain = [];
  var verdicts = [
    { v: "PASS", rc: "HAUL_CHECKED", o: "haul checked at Princetown gate" },
    { v: "PASS", rc: "SEAL_OK", o: "crate sealed; seal hash recorded" },
    { v: "PASS", rc: "SEAL_OK", o: "crate re-checked at Postbridge relay" },
    { v: "PASS", rc: "SEAL_OK", o: "content digest " + committedDigest.slice(0, 16) + "… committed at final sealing" },
    { v: "PASS", rc: "BENCH_READY", o: "packet placed on the delivery bench" }
  ];
  for (var i = 0; i < verdicts.length; i++) {
    var ts = "2026-10-30T1" + i + ":05:00Z";
    chain.push(buildFictionalReceipt(
      run_id, "packet-seal-" + (i + 1), "packet-seal", i + 1,
      verdicts[i].v, verdicts[i].rc, verdicts[i].o,
      claim, gate, expected, ts, prevOf(chain[chain.length - 1]), i
    ));
  }
  return chain;
}

function buildDeliveryPackets() {
  var contentA = {
    manifest_id: "MAN-DART-001",
    contents: ["relay lanterns x4", "course rope, 40 fathoms", "verifier's field ink"],
    net_weight_kg: 21.5,
    route: "Princetown -> Dunnabridge"
  };
  var contentB = {
    manifest_id: "MAN-FOX-002",
    contents: ["fox tags x12", "course chalk, 3 boxes", "repair twine"],
    net_weight_kg: 9.75,
    route: "Princetown -> Fox Tor"
  };
  var contentC = {
    manifest_id: "MAN-BEAR-003",
    contents: ["beardown feed, 2 sacks", "farrier nails, 1 lb", "storm lantern oil"],
    net_weight_kg: 33,
    route: "Princetown -> Beardown"
  };
  var contentC_original = {
    manifest_id: "MAN-BEAR-003",
    contents: ["beardown feed, 2 sacks", "farrier nails, 1 lb", "storm lantern oil", "medicinal flask"],
    net_weight_kg: 34.5,
    route: "Princetown -> Beardown"
  };

  /* Packet A: chain valid, content committed by the chain. */
  var chainA = buildPacketChain("run-pkt-a", canonDigest(contentA));
  /* Packet B: chain tampered post-hoc (seq 4 edited, stored hash kept). */
  var chainB = buildPacketChain("run-pkt-b", canonDigest(contentB));
  chainB[4].evaluation.observed = "crate re-checked at Postbridge relay (contents re-packed in transit)";
  /* Packet C: chain intact — but it committed DIFFERENT content. */
  var chainC = buildPacketChain("run-pkt-c", canonDigest(contentC_original));

  var packets = [
    { packet_id: "PKT-A", label: "Dartmoor Haul", content: contentA, committed_digest: canonDigest(contentA), chain: chainA },
    { packet_id: "PKT-B", label: "Fox Tor Packet", content: contentB, committed_digest: canonDigest(contentB), chain: chainB },
    { packet_id: "PKT-C", label: "Beardown Bundle", content: contentC, committed_digest: canonDigest(contentC_original), chain: chainC }
  ];
  return packets;
}

/* ---------- apex bundle (stage 4 artifact) ---------- */

function buildApexBundle() {
  var roster = ["morden", "trevane", "halsey"];
  var required_evidence_keys = ["state_hash", "sealed_by"];
  function digestOf(r) { return canonDigest({ actor: r.actor, action: r.action, sequence: r.sequence, nonce: r.nonce }); }
  var records = [
    { record_id: "DX-201", actor: "morden", action: "seal dispatch crate 7", sequence: 1, nonce: "n-201-77a", claimed_status: "PASS", state_evidence: { state_hash: "ev-201-a1", sealed_by: "morden" } },
    { record_id: "DX-202", actor: "trevane", action: "seal dispatch crate 9", sequence: 2, nonce: "n-201-77a", claimed_status: "PASS", state_evidence: { state_hash: "ev-202-b2", sealed_by: "trevane" } },
    { record_id: "DX-203", actor: "calder", action: "seal dispatch crate 11", sequence: 3, nonce: "n-203-31c", claimed_status: "FAIL", state_evidence: { state_hash: "ev-203-c3", sealed_by: "calder" } },
    { record_id: "DX-204", actor: "halsey", action: "seal dispatch crate 13 and its manifest", sequence: 4, nonce: "n-204-42d", claimed_status: "PASS", state_evidence: { state_hash: "ev-204-d4", sealed_by: "halsey" } },
    { record_id: "DX-205", actor: "morden", action: "seal dispatch crate 15", sequence: 7, nonce: "n-205-53e", claimed_status: "PASS", state_evidence: { state_hash: "ev-205-e5", sealed_by: "morden" } }
  ];
  records.forEach(function (r) { r.digest = digestOf(r); });
  /* DX-204 lies about its provenance: its digest commits the ORIGINAL action
   * wording, but the record was amended afterwards. */
  var originalCore204 = { actor: "halsey", action: "seal dispatch crate 13", sequence: 4, nonce: "n-204-42d" };
  records[3].digest = canonDigest(originalCore204);
  return { roster: roster, required_evidence_keys: required_evidence_keys, records: records };
}

/* ---------- assemble, self-verify, write ---------- */

function buildFixtures() {
  var fixtures = {
    generated_by: "cli/make-fixtures.js",
    namespace: "kinetigor.game-run/1",
    cache_chain: buildCacheChain(),
    delivery_packets: buildDeliveryPackets(),
    apex_bundle: buildApexBundle()
  };

  /* fixture self-verification — the generator refuses to emit broken data */
  var V = require("../core/validator.js");
  var K = require("../core/kernel.js");
  var rep = V.validateChain(fixtures.cache_chain.chain, {});
  var firstBad = null;
  rep.reasons.forEach(function (r) { if (!firstBad && r.codes.indexOf("INVALID_HASH") !== -1) firstBad = r; });
  if (!firstBad || firstBad.seq !== 3) fail("cache chain: expected first INVALID_HASH at seq 3, got " + JSON.stringify(firstBad));
  if (firstBad.receipt_id !== fixtures.cache_chain.chain[3].receipt_id) fail("cache chain: first bad receipt is not seq 3");

  var okPackets = 0;
  fixtures.delivery_packets.forEach(function (p) {
    var chainOk = V.validateChain(p.chain, {}).valid;
    var contentOk = canonDigest(p.content) === p.committed_digest;
    if (chainOk && contentOk) okPackets++;
  });
  if (okPackets !== 1) fail("delivery packets: expected exactly one acceptable packet, got " + okPackets);
  if (okPackets === 1) {
    var good = fixtures.delivery_packets.filter(function (p) {
      return V.validateChain(p.chain, {}).valid && canonDigest(p.content) === p.committed_digest;
    })[0];
    if (good.packet_id !== "PKT-A") fail("delivery packets: acceptable packet is not PKT-A");
  }

  var res = K.verifyRecords(fixtures.apex_bundle);
  var q = res.filter(function (r) { return r.verdict === "QUARANTINE"; });
  var d = res.filter(function (r) { return r.verdict === "PASS"; });
  var l = res.filter(function (r) { return r.claimed_status === "PASS" && r.verdict === "FAIL"; }).map(function (r) { return r.record_id; }).sort();
  if (q.length !== 1 || q[0].record_id !== "DX-202") fail("apex bundle: expected exactly DX-202 quarantined");
  if (d.length !== 1 || d[0].record_id !== "DX-201") fail("apex bundle: expected exactly DX-201 deliverable");
  if (JSON.stringify(l) !== JSON.stringify(["DX-204", "DX-205"])) fail("apex bundle: expected liars [DX-204, DX-205], got " + JSON.stringify(l));

  return fixtures;
}

function main() {
  var fs = require("fs");
  var path = require("path");
  var fixtures = buildFixtures();
  var body = JSON.stringify(fixtures, null, 2);
  var out = [
    "/*",
    " * kinetigor-game fixtures — GENERATED by cli/make-fixtures.js. Do not edit.",
    " * Deterministic: regenerate with `node cli/make-fixtures.js`.",
    " * Stage 2 artifact: cache_chain · Stage 3: delivery_packets · Stage 4: apex_bundle.",
    " */",
    "(function (root) {",
    "  \"use strict\";",
    "  root.KIN = root.KIN || {};",
    "  root.KIN.FIXTURES = " + body + ";",
    "  if (typeof module !== \"undefined\" && module.exports) module.exports = root.KIN.FIXTURES;",
    "})(typeof globalThis !== \"undefined\" ? globalThis : this);",
    ""
  ].join("\n");
  var dest = path.join(__dirname, "..", "www", "fixtures.js");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  console.log("fixtures written: " + dest + " (" + out.length + " bytes)");
}

if (typeof require !== "undefined" && require.main === module) { main(); }
if (typeof module !== "undefined") { module.exports = { buildFixtures: buildFixtures }; }

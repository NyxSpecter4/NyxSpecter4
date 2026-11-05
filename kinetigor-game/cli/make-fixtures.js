#!/usr/bin/env node
/*
 * kinetigor-game — deterministic fixture generator.
 * Regenerates www/fixtures.js (the stage 2/3/4 artifacts).
 * Run: node cli/make-fixtures.js
 * Deterministic: fixed timestamps, fixed run ids, fixed payloads —
 * re-running produces byte-identical output (asserted by cli/selftest.js).
 *
 * Stage 3 (Delivery — MOORPOST relay): two relay logs built with the
 * VENDORED estate kernel (vendor/moorpost-kernel.js, byte-identical).
 * Exactly one path preserves trustworthy state through the relay.
 * Stage 4 (Apex — Mission Control): a board of 19 records (6 lane cards,
 * 5 dispatch records, 8 evidence cards) resolved against the player's
 * own chain at judge time, never against narrated claims.
 */
"use strict";

var T = require("../www/core/trust.js");
var MK = require("../www/vendor/moorpost-kernel.js");

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
    { v: "PASS", rc: "SEAL_MISMATCH", o: "crate 22 recomputes to a different digest than its recorded seal" },
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

/* ---------- relay paths (stage 3 artifact — MOORPOST machinery) ----------
 *
 * Built with the vendored estate kernel itself: issuePacket + validatePacket
 * + stampIfValid with FIXED timestamps and event ids (determinism).
 * The packet snapshots in each log entry are the bytes AS PRESENTED at that
 * hop; the claimed code is the courier's narration. The judge recomputes
 * every hop with the same kernel — narration can never carry a packet.
 */

var RELAY_OWNER_R = "courier-rowcroft";
var RELAY_OWNER_M = "courier-vane";
var RELAY_STATIONS_R = [
  { id: "R1", name: "Three Stallions" },
  { id: "R2", name: "King Tor" },
  { id: "R3", name: "Beardown Gate" },
  { id: "R4", name: "Two Bridges Bank" }
];
var RELAY_STATIONS_M = [
  { id: "M1", name: "Three Stallions" },
  { id: "M2", name: "King Tor" },
  { id: "M3", name: "Beardown Gate" },
  { id: "M4", name: "Two Bridges Bank" }
];

function baseRelayClaim() {
  return "the Princetown haul manifest is sealed and unchanged from issue to the Two Bridges Bank";
}

function buildRelayPathR() {
  var packet = MK.issuePacket({
    origin: "Postbridge Depot",
    destination: "Two Bridges Bank",
    owner: RELAY_OWNER_R,
    sequence: 1,
    event_id: "EVT-RELAY-R-01",
    station_id: "R1",
    claim: baseRelayClaim(),
    falsifier: "any hop amends the claim after sealing, skips a station, or lands the same station stamp twice",
    evidence: ["warrant WRNT-2077-A17", "waybill PB-77-004 amendment report", "cache quarantine order"],
    issued_at: "2026-10-30T10:00:00Z",
    expires_at: null
  });
  var seen = {};
  var entries = [];
  for (var hop = 1; hop <= 4; hop++) {
    var st = RELAY_STATIONS_R[hop - 1];
    packet.station_id = st.id;
    packet.sequence = hop;
    packet.integrity_hash = MK.hexHash(MK.canonicalPayload(packet)); /* honest re-seal per hop */
    var presented = MK.clonePacket(packet); /* as presented at the station (pre-stamp) */
    var res = MK.stampIfValid(packet, {
      expectedOwner: RELAY_OWNER_R,
      expectedSequence: hop,
      requireFalsifier: true,
      seenStampKeys: seen,
      now: "2026-10-30T10:0" + hop + ":00Z"
    });
    if (!res.ok) fail("relay R: hop " + hop + " unexpectedly refused: " + res.validation.code);
    entries.push({
      hop: hop,
      station_id: st.id,
      station_name: st.name,
      claimed_code: "ACCEPTED",
      presented_packet: presented,
      recomputed_code: res.validation.code
    });
  }
  return {
    path_id: "PATH-R",
    label: "Ridgeway Relay",
    owner: RELAY_OWNER_R,
    note: "Four stations, four stamps, one continuous seal. The bank ledger row commits only if the whole relay survives.",
    entries: entries,
    bank_committed: true
  };
}

function buildRelayPathM() {
  var packet = MK.issuePacket({
    origin: "Postbridge Depot",
    destination: "Two Bridges Bank",
    owner: RELAY_OWNER_M,
    sequence: 1,
    event_id: "EVT-RELAY-M-01",
    station_id: "M1",
    claim: baseRelayClaim(),
    falsifier: "any hop amends the claim after sealing, skips a station, or lands the same station stamp twice",
    evidence: ["warrant WRNT-2077-A17", "waybill PB-77-004 amendment report"],
    issued_at: "2026-10-30T10:00:00Z",
    expires_at: null
  });
  var seen = {};
  var entries = [];

  /* hop 1 — clean accept at Three Stallions */
  packet.station_id = "M1";
  packet.sequence = 1;
  packet.integrity_hash = MK.hexHash(MK.canonicalPayload(packet));
  var p1 = MK.clonePacket(packet);
  var r1 = MK.stampIfValid(packet, { expectedOwner: RELAY_OWNER_M, expectedSequence: 1, requireFalsifier: true, seenStampKeys: seen, now: "2026-10-30T10:01:00Z" });
  if (!r1.ok) fail("relay M: hop 1 unexpectedly refused");
  entries.push({ hop: 1, station_id: "M1", station_name: "Three Stallions", claimed_code: "ACCEPTED", presented_packet: p1, recomputed_code: r1.validation.code });

  /* hop 2 — the courier AMENDS the claim after sealing but keeps the old
   * integrity hash: the seal no longer covers the words. The log still
   * narrates ACCEPTED. The kernel refuses: broken seal (provenance). */
  var sealed = MK.clonePacket(packet); /* state as stamped at hop 1 */
  var amended = MK.clonePacket(packet);
  amended.station_id = "M2";
  amended.sequence = 2;
  amended.claim = "the Princetown haul manifest is sealed, unchanged, and cleared of the quarantine flag";
  /* integrity_hash deliberately NOT recomputed — the amendment happens after sealing */
  var v2 = MK.validatePacket(amended, { expectedOwner: RELAY_OWNER_M, expectedSequence: 2, requireFalsifier: true, seenStampKeys: seen });
  if (v2.code !== "REFUSED_PROVENANCE") fail("relay M: hop 2 expected REFUSED_PROVENANCE, got " + v2.code);
  entries.push({ hop: 2, station_id: "M2", station_name: "King Tor", claimed_code: "ACCEPTED", presented_packet: amended, recomputed_code: v2.code });
  /* refused — nothing stamps; the working packet stays as it was at hop 1 */
  packet = sealed;

  /* hop 3 — the courier quietly reverts to the ORIGINAL packet and presents
   * it at Beardown Gate: the seal covers it again, and the gate accepts.
   * The stamps carried forward are [M1, M3] — M2 never happened. */
  packet.station_id = "M3";
  packet.sequence = 3;
  packet.integrity_hash = MK.hexHash(MK.canonicalPayload(packet));
  var p3 = MK.clonePacket(packet);
  var r3 = MK.stampIfValid(packet, { expectedOwner: RELAY_OWNER_M, expectedSequence: 3, requireFalsifier: true, seenStampKeys: seen, now: "2026-10-30T10:03:00Z" });
  if (!r3.ok) fail("relay M: hop 3 unexpectedly refused: " + r3.validation.code);
  entries.push({ hop: 3, station_id: "M3", station_name: "Beardown Gate", claimed_code: "ACCEPTED", presented_packet: p3, recomputed_code: r3.validation.code });

  /* hop 4 — the courier claims the bank, but the packet presented carries
   * station M3 again with a fresh re-seal over the bumped sequence. The
   * M3 stamp is already in the packet: the kernel refuses the replay. */
  var replayAttempt = MK.clonePacket(packet);
  replayAttempt.station_id = "M3";
  replayAttempt.sequence = 4;
  replayAttempt.integrity_hash = MK.hexHash(MK.canonicalPayload(replayAttempt));
  var v4 = MK.validatePacket(replayAttempt, { expectedOwner: RELAY_OWNER_M, expectedSequence: 4, requireFalsifier: true, seenStampKeys: seen });
  if (v4.code !== "REFUSED_REPLAY") fail("relay M: hop 4 expected REFUSED_REPLAY, got " + v4.code);
  entries.push({
    hop: 4,
    station_id: "M3",
    station_name: "Beardown Gate (log claims Two Bridges Bank)",
    claimed_code: "ACCEPTED",
    presented_packet: replayAttempt,
    recomputed_code: v4.code
  });

  return {
    path_id: "PATH-M",
    label: "Moorland Cutoff",
    owner: RELAY_OWNER_M,
    note: "The courier's log narrates four accepts. The kernel narrates none of the last three.",
    entries: entries,
    bank_committed: false
  };
}

function buildRelayPaths() {
  return [buildRelayPathR(), buildRelayPathM()];
}

/* ---------- apex bundle (the dispatch rack on the Mission Control board) ---------- */

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

/* ---------- mission board (stage 4 artifact — Mission Control) ----------
 *
 * 19 records arrive at Mission Control:
 *   - 6 lane cards  (each lane advances only on authority resolved against
 *                    the run's own PASS receipts — claimed_go is narration)
 *   - 5 dispatch records (the DX rack, five-checked by the Athelgard kernel)
 *   - 8 evidence cards (each claims "verified"; actionable only if it cites
 *                    an existing PASS receipt in this run's chain)
 * Lane and card citations are resolved DYNAMICALLY against ctx.receipts at
 * judge time — never against the claimed_status text.
 */

function buildMissionBoard() {
  return {
    board_id: "MC-PRINCETOWN-APEX",
    label: "Mission Control — Princetown Apex",
    note: "19 records on the board. Every card narrates a status. The ledger decides.",
    lanes: [
      { lane_id: "LANE-A", name: "Warrant Lane", claimed_go: true, authorities: [{ challenge: "arrival-00", verdict: "PASS" }] },
      { lane_id: "LANE-B", name: "Waybill Lane", claimed_go: true, authorities: [{ challenge: "postbridge-01", verdict: "PASS" }] },
      { lane_id: "LANE-C", name: "Cache Lane", claimed_go: true, authorities: [{ challenge: "cache-02", verdict: "PASS" }] },
      { lane_id: "LANE-D", name: "Relay Lane", claimed_go: true, authorities: [{ challenge: "cache-02", verdict: "PASS" }, { challenge: "delivery-03", verdict: "PASS" }] },
      { lane_id: "LANE-E", name: "Appeal Lane", claimed_go: true, authorities: [{ challenge: "delivery-03", verdict: "FAIL" }] },
      { lane_id: "LANE-F", name: "Rider Lane", claimed_go: true, authorities: [{ receipt_id: "rcpt-0000000000000000" }] }
    ],
    evidence_cards: [
      { card_id: "EC-301", claimed: "verified", cites: { challenge: "arrival-00", verdict: "PASS" } },
      { card_id: "EC-302", claimed: "verified", cites: { challenge: "postbridge-01", verdict: "FAIL" } },
      { card_id: "EC-303", claimed: "verified", cites: { challenge: "postbridge-01", verdict: "PASS" } },
      { card_id: "EC-304", claimed: "verified", cites: { challenge: "cache-02", verdict: "PASS" } },
      { card_id: "EC-305", claimed: "verified", cites: { challenge: "delivery-03", verdict: "QUARANTINE" } },
      { card_id: "EC-306", claimed: "verified", cites: { receipt_id: "rcpt-deadbeefdeadbeef" } },
      { card_id: "EC-307", claimed: "verified", cites: { challenge: "delivery-03", verdict: "PASS" } },
      { card_id: "EC-308", claimed: "verified", cites: { challenge: "arrival-00", verdict: "FAIL" } }
    ]
  };
}

/* ---------- assemble, self-verify, write ---------- */

function walkRelayPath(path) {
  /* same walk the judge performs: recompute every hop with the vendored kernel */
  var seen = {};
  var workingStamps = [];
  var firstRefusal = null;
  var allAccepted = true;
  var walked = path.entries.map(function (e) {
    /* the carried stamp trail must be exactly the prior accepted hops, in order */
    var priorIds = workingStamps.map(function (s) { return s.station_id; });
    var presentedIds = (e.presented_packet.stamps || []).map(function (s) { return s.station_id; });
    var stampsOk = JSON.stringify(presentedIds) === JSON.stringify(priorIds);
    var v = MK.validatePacket(e.presented_packet, {
      expectedOwner: path.owner,
      expectedSequence: e.hop,
      requireFalsifier: true,
      seenStampKeys: seen
    });
    var code = v.code;
    if (code === "ACCEPTED" && !stampsOk) code = "REFUSED_REPLAY"; /* ledger state not preserved */
    if (code !== "ACCEPTED") {
      allAccepted = false;
      if (!firstRefusal) firstRefusal = { hop: e.hop, code: code, station_id: e.station_id };
    } else {
      workingStamps.push({ station_id: e.station_id });
      seen["stub|" + e.hop] = true; /* per-hop sequence keys differ; kernel stamps check carries the load */
    }
    return { hop: e.hop, claimed_code: e.claimed_code, recomputed_code: code };
  });
  return { walked: walked, all_accepted: allAccepted, first_refusal: firstRefusal };
}

function buildFixtures() {
  var fixtures = {
    generated_by: "cli/make-fixtures.js",
    namespace: "kinetigor.game-run/1",
    cache_chain: buildCacheChain(),
    relay_paths: buildRelayPaths(),
    apex_bundle: buildApexBundle(),
    mission_board: buildMissionBoard()
  };

  /* fixture self-verification — the generator refuses to emit broken data */
  var V = require("../www/core/validator.js");
  var K = require("../www/core/kernel.js");
  var rep = V.validateChain(fixtures.cache_chain.chain, {});
  var firstBad = null;
  rep.reasons.forEach(function (r) { if (!firstBad && r.codes.indexOf("INVALID_HASH") !== -1) firstBad = r; });
  if (!firstBad || firstBad.seq !== 3) fail("cache chain: expected first INVALID_HASH at seq 3, got " + JSON.stringify(firstBad));
  if (firstBad.receipt_id !== fixtures.cache_chain.chain[3].receipt_id) fail("cache chain: first bad receipt is not seq 3");

  var validPaths = [];
  fixtures.relay_paths.forEach(function (p) {
    var w = walkRelayPath(p);
    if (w.all_accepted !== p.bank_committed) fail("relay " + p.path_id + ": bank_committed flag disagrees with fresh kernel walk");
    if (w.all_accepted) validPaths.push(p.path_id);
    p.entries.forEach(function (e, i) {
      var w2 = walkRelayPath(p);
      if (w2.walked[i].recomputed_code !== e.recomputed_code) fail("relay " + p.path_id + " hop " + e.hop + ": recorded code disagrees with fresh walk");
    });
  });
  if (JSON.stringify(validPaths) !== JSON.stringify(["PATH-R"])) fail("relay: expected exactly PATH-R to survive, got " + JSON.stringify(validPaths));
  var wm = walkRelayPath(fixtures.relay_paths[1]);
  if (!wm.first_refusal || wm.first_refusal.hop !== 2 || wm.first_refusal.code !== "REFUSED_PROVENANCE") {
    fail("relay PATH-M: expected first refusal hop 2 REFUSED_PROVENANCE, got " + JSON.stringify(wm.first_refusal));
  }
  var wLast = walkRelayPath(fixtures.relay_paths[1]).walked[3];
  if (wLast.recomputed_code !== "REFUSED_REPLAY") fail("relay PATH-M: hop 4 must recompute REFUSED_REPLAY, got " + wLast.recomputed_code);

  var res = K.verifyRecords(fixtures.apex_bundle);
  var q = res.filter(function (r) { return r.verdict === "QUARANTINE"; });
  var d = res.filter(function (r) { return r.verdict === "PASS"; });
  var l = res.filter(function (r) { return r.claimed_status === "PASS" && r.verdict === "FAIL"; }).map(function (r) { return r.record_id; }).sort();
  if (q.length !== 1 || q[0].record_id !== "DX-202") fail("apex bundle: expected exactly DX-202 quarantined");
  if (d.length !== 1 || d[0].record_id !== "DX-201") fail("apex bundle: expected exactly DX-201 deliverable");
  if (JSON.stringify(l) !== JSON.stringify(["DX-204", "DX-205"])) fail("apex bundle: expected liars [DX-204, DX-205], got " + JSON.stringify(l));

  var board = fixtures.mission_board;
  var boardCount = board.lanes.length + fixtures.apex_bundle.records.length + board.evidence_cards.length;
  if (boardCount !== 19) fail("mission board: expected 19 records, got " + boardCount);
  if (board.lanes.length !== 6 || board.evidence_cards.length !== 8) fail("mission board: expected 6 lanes and 8 evidence cards");

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
    " * Stage 2 artifact: cache_chain · Stage 3: relay_paths (MOORPOST kernel) · Stage 4: apex_bundle + mission_board.",
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
if (typeof module !== "undefined") { module.exports = { buildFixtures: buildFixtures, walkRelayPath: walkRelayPath }; }

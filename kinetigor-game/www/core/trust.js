/*
 * kinetigor-game — TRUST CORE
 * Namespace: kinetigor.trust-receipt/v1 (envelope) + kinetigor.game-run/1 (chain extension)
 *
 * The envelope is the canonical Kinetigor Trust Receipt v1, defined at
 * NyxSpecter4/NyxSpecter4 main, kin-trust-protocol/receipt.schema.json
 * (see CONTRACT.md for full citation and the chain-extension ruling).
 *
 * The chain layer (canonicalization, SHA-256 receipt hashing, prev_receipt
 * linkage) is an EXPLICIT EXTENSION of v1 — v1 does not define chaining.
 * This file is the ONE implementation of that contract (no duplicates).
 *
 * Zero dependencies. Runs in Node >= 16 and in browsers.
 */
(function (root) {
  "use strict";

  var SCHEMA_ID = "kinetigor.trust-receipt/v1";
  var CHAIN_NS = "kinetigor.game-run/1";
  var GENESIS = "GENESIS";         /* predecessor id + predecessor hash seed for seq 0 */
  var VERDICTS = ["PASS", "FAIL", "REFUSE", "QUARANTINE"]; /* Athelgard kernel algebra */

  /* ---------- canonicalization (frozen in CONTRACT.md) ---------- */

  function canon(v) {
    if (v === null) return "null";
    var t = typeof v;
    if (t === "boolean") return v ? "true" : "false";
    if (t === "number") {
      if (!isFinite(v)) throw new Error("non-finite number cannot be canonicalized");
      return JSON.stringify(v);
    }
    if (t === "string") return JSON.stringify(v);
    if (t === "undefined" || t === "function" || t === "symbol") {
      throw new Error(t + " value cannot be canonicalized");
    }
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length; i++) parts.push(canon(v[i]));
      return "[" + parts.join(",") + "]";
    }
    /* plain object: keys sorted by UTF-16 code unit (Array.prototype.sort default) */
    var keys = Object.keys(v).sort();
    var kvs = [];
    for (var k = 0; k < keys.length; k++) {
      kvs.push(JSON.stringify(keys[k]) + ":" + canon(v[keys[k]]));
    }
    return "{" + kvs.join(",") + "}";
  }

  /* ---------- SHA-256 (FIPS 180-4), pure JS, string input = UTF-8 bytes ---------- */

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c >= 0xD800 && c <= 0xDBFF) {
        var c2 = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          var cp = ((c - 0xD800) << 10) + (c2 - 0xDC00) + 0x10000;
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
          i++;
        } else {
          out.push(0xEF, 0xBF, 0xBD); /* lone surrogate -> U+FFFD */
        }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        out.push(0xEF, 0xBF, 0xBD);
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function hex8(n) {
    var h = (n >>> 0).toString(16);
    while (h.length < 8) h = "0" + h;
    return h;
  }

  function sha256hex(s) {
    var msg = utf8Bytes(s);
    var bitLen = msg.length * 8; /* safe below 2^53 */
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
             (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      var t;
      for (t = 0; t < 16; t++) {
        w[t] = ((msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) |
                (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3]) >>> 0;
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = "";
    for (var i = 0; i < 8; i++) out += hex8(H[i]);
    return out;
  }

  /* ---------- receipt formation (frozen in CONTRACT.md) ----------
   * entry_hash = sha256( ASCII(prev_entry_hash) || UTF8(canon(payload)) )
   *   where payload = receipt minus receipt_id, minus game.chain.entry_hash
   *   genesis predecessor hash input = ASCII "GENESIS"
   * receipt_id = "rcpt-" + first 16 hex chars of entry_hash
   */

  function stripForHash(r) {
    var c = JSON.parse(JSON.stringify(r));
    if (c && typeof c === "object") {
      delete c.receipt_id;
      if (c.game && c.game.chain) delete c.game.chain.entry_hash;
    }
    return c;
  }

  function evalVerdict(v) {
    /* kernel verdict -> v1 evaluation.verdict */
    if (v === "PASS") return "PASS";
    if (v === "FAIL") return "FAIL";
    return "INDETERMINATE"; /* REFUSE, QUARANTINE */
  }

  function transitionBlock(verdict, quarantine) {
    var t = { from: "MEASURED", to: "VERIFIED", status: null };
    if (verdict === "PASS") t.status = "ACCEPTED";
    else if (verdict === "QUARANTINE") {
      t.status = "QUARANTINED";
      t.quarantine = {
        reason: (quarantine && quarantine.reason) || "integrity condition",
        last_valid_state: (quarantine && quarantine.last_valid_state) || "MEASURED"
      };
    } else t.status = "REFUSED"; /* FAIL, REFUSE */
    return t;
  }

  /*
   * buildReceipt(p) — p:
   *   run_id, player, challenge_id, attempt, verdict, reason_code,
   *   subject_id, subject_version, claim {statement, falsifier},
   *   gate, expected, observed, submitted (evidence object as received),
   *   timestamp (ISO-8601), quarantine {reason, last_valid_state} | null,
   *   seq, prev {receipt_id, entry_hash} | null (null = genesis)
   */
  function buildReceipt(p) {
    if (VERDICTS.indexOf(p.verdict) === -1) throw new Error("unknown verdict " + p.verdict);
    var payload = {
      schema: SCHEMA_ID,
      subject: { kind: "challenge", id: p.subject_id, version: p.subject_version || "1.0.0" },
      claim: {
        statement: p.claim.statement,
        falsifier: p.claim.falsifier,
        previous_state: "MEASURED",
        requested_state: "VERIFIED"
      },
      evidence: [{
        type: "judge",
        locator: "kinetigor-game://run/" + p.run_id + "/challenge/" + p.challenge_id + "/attempt/" + p.attempt,
        observed_result: p.observed
      }],
      evaluation: {
        gate: p.gate,
        expected: p.expected,
        observed: p.observed,
        verdict: evalVerdict(p.verdict)
      },
      provenance: {
        actor: p.player,
        method: "deterministic challenge judge (" + CHAIN_NS + ")",
        timestamp: p.timestamp
      },
      transition: transitionBlock(p.verdict, p.quarantine),
      game: {
        run_id: p.run_id,
        challenge_id: p.challenge_id,
        attempt: p.attempt,
        verdict: p.verdict,
        reason_code: p.reason_code,
        chain: { seq: p.seq, prev_receipt: p.prev ? p.prev.receipt_id : GENESIS, entry_hash: null }
      }
    };
    var entry = sha256hex((p.prev ? p.prev.entry_hash : GENESIS) + canon(stripForHash(payload)));
    var receipt = JSON.parse(canon(payload));
    receipt.receipt_id = "rcpt-" + entry.slice(0, 16);
    receipt.game.chain.entry_hash = entry;
    return receipt;
  }

  var api = {
    SCHEMA_ID: SCHEMA_ID,
    CHAIN_NS: CHAIN_NS,
    GENESIS: GENESIS,
    VERDICTS: VERDICTS,
    canon: canon,
    sha256hex: sha256hex,
    utf8Bytes: utf8Bytes,
    stripForHash: stripForHash,
    buildReceipt: buildReceipt,
    evalVerdict: evalVerdict
  };

  root.KIN = root.KIN || {};
  root.KIN.Trust = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

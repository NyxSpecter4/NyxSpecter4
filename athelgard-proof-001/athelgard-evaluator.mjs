#!/usr/bin/env node
// ATHELGARD PROOF #001 — Evaluator v0.1
// Deterministic evaluation of an exported evidence envelope against a
// pre-committed rubric. Secret-free, dependency-free (Node >= 16, stdlib only).
//
// Commands:
//   node athelgard-evaluator.mjs rubric.json envelope.json [--expect-rubric-hash H] [--receipt] [--at ISO]
//   node athelgard-evaluator.mjs verify rubric.json envelope.json receipt.json
//   node athelgard-evaluator.mjs selftest
//
// Fail-closed on: missing required fields, evidence-hash mismatch,
// rubric-hash mismatch, unknown protocol version, challenge mismatch.
// Claims ONLY deterministic evaluation against the published rubric —
// NOT semantic correctness.

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

const EVALUATOR_VERSION = "athelgard-evaluator/0.1";
const PROTOCOL = "athelgard-envelope/1";

// ---------- pure SHA-256 (FIPS 180-4), no crypto import needed ----------
function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function sha256Hex(msg) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = utf8Bytes(msg);
  const l = bytes.length;
  const bitLenHi = Math.floor(l / 0x20000000), bitLenLo = (l << 3) >>> 0;
  const blocks = (((l + 8) >> 6) + 1) << 6;
  const padded = new Array(blocks).fill(0);
  for (let i = 0; i < l; i++) padded[i] = bytes[i];
  padded[l] = 0x80;
  padded[blocks-8]=(bitLenHi>>>24)&255; padded[blocks-7]=(bitLenHi>>>16)&255; padded[blocks-6]=(bitLenHi>>>8)&255; padded[blocks-5]=bitLenHi&255;
  padded[blocks-4]=(bitLenLo>>>24)&255; padded[blocks-3]=(bitLenLo>>>16)&255; padded[blocks-2]=(bitLenLo>>>8)&255; padded[blocks-1]=bitLenLo&255;
  const rotr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
  const w = new Array(64);
  for (let b = 0; b < blocks; b += 64) {
    for (let t = 0; t < 16; t++) w[t] = ((padded[b+t*4]<<24)|(padded[b+t*4+1]<<16)|(padded[b+t*4+2]<<8)|padded[b+t*4+3])>>>0;
    for (let t = 16; t < 64; t++) {
      const x = w[t-15], y = w[t-2];
      const s0 = rotr(x,7)^rotr(x,18)^(x>>>3);
      const s1 = rotr(y,17)^rotr(y,19)^(y>>>10);
      w[t] = (w[t-16]+s0+w[t-7]+s1)>>>0;
    }
    let [a,bb,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch = (e&f)^(~e&g);
      const t1 = (h+S1+ch+K[t]+w[t])>>>0;
      const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj = (a&bb)^(a&c)^(bb&c);
      const t2 = (S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=bb;bb=a;a=(t1+t2)>>>0;
    }
    const upd=(i,v)=>H[i]=(H[i]+v)>>>0;
    upd(0,a);upd(1,bb);upd(2,c);upd(3,d);upd(4,e);upd(5,f);upd(6,g);upd(7,h);
  }
  return H.map(x=>x.toString(16).padStart(8,"0")).join("");
}

// ---------- canonical hashing (sorted keys, stable) ----------
function sortedReplacer(_k, v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.keys(v).sort().reduce((acc, ky) => (acc[ky] = v[ky], acc), {});
  }
  return v;
}
const hashObj = (o) => sha256Hex(JSON.stringify(o, sortedReplacer));

// ---------- fail-closed validation ----------
function validate(envelope, rubric, expectRubricHash) {
  if (!envelope || typeof envelope !== "object") return { ok: false, reason: "malformed envelope" };
  if (envelope.protocol !== PROTOCOL) return { ok: false, reason: `unknown protocol version: ${envelope.protocol}` };
  if (envelope.challenge_id !== rubric.challenge_id)
    return { ok: false, reason: `challenge mismatch: envelope '${envelope.challenge_id}' vs rubric '${rubric.challenge_id}'` };
  const rubricHash = hashObj(rubric);
  if (expectRubricHash && rubricHash !== expectRubricHash)
    return { ok: false, reason: `rubric hash mismatch: expected ${expectRubricHash}, computed ${rubricHash}` };
  for (const k of ["protocol","challenge_id","actor_id","action","evidence","captured_at","evidence_hash"])
    if (envelope[k] === undefined || envelope[k] === null || envelope[k] === "")
      return { ok: false, reason: `missing required field: ${k}` };
  if (hashObj(envelope.evidence) !== envelope.evidence_hash)
    return { ok: false, reason: `evidence hash mismatch: declared ${envelope.evidence_hash}, computed ${hashObj(envelope.evidence)}` };
  return { ok: true };
}

// ---------- deterministic evaluation ----------
function evaluate(envelope, rubric, expectRubricHash, evaluatedAt) {
  const v = validate(envelope, rubric, expectRubricHash);
  if (!v.ok) return { status: "rejected", reason: v.reason, evaluator_version: EVALUATOR_VERSION };
  const ev = envelope.evidence;
  const checks = {
    cwe_match: ev.cwe === rubric.cwe,
    replay_step_present: typeof ev.replay_step === "string" && ev.replay_step.length >= 12,
    outcome_shows_success: typeof ev.outcome === "string" && ev.outcome.length >= 8,
    policy_respected: ev.watchword_named === false,
    finding_stated: typeof ev.finding === "string" && ev.finding.length >= 8,
  };
  const field_results = Object.entries(rubric.fields).map(([name, spec]) => {
    const passed = checks[name] === true;
    return { field: name, points: passed ? spec.points : 0, max: spec.points, passed, check: spec.check };
  });
  const total = field_results.reduce((s, r) => s + r.points, 0);
  const max = field_results.reduce((s, r) => s + r.max, 0);
  return { status: "evaluated", protocol_version: PROTOCOL, challenge_id: envelope.challenge_id,
    actor_id: envelope.actor_id, evidence_hash: envelope.evidence_hash, rubric_hash: hashObj(rubric),
    evaluator_version: EVALUATOR_VERSION, field_results, total_score: total, max_score: max,
    verdict: total >= rubric.pass_threshold ? "PASS" : "FAIL", evaluated_at: evaluatedAt };
}

// ---------- receipt ----------
function makeReceipt(verdict) {
  const { receipt_id, ...payload } = verdict;
  return { ...verdict, receipt_id: hashObj(payload) };
}
function verifyReceipt(receipt, envelope, rubric) {
  const { receipt_id, ...payload } = receipt;
  const recomputed = evaluate(envelope, rubric, undefined, receipt.evaluated_at);
  const checks = {
    receipt_id_matches: receipt_id === hashObj(payload),
    score_reproduces: recomputed.total_score === receipt.total_score,
    verdict_reproduces: recomputed.verdict === receipt.verdict,
    evidence_hash_matches: recomputed.evidence_hash === receipt.evidence_hash,
    rubric_hash_matches: recomputed.rubric_hash === receipt.rubric_hash,
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}

// ---------- selftest (embedded fixtures: pass, fail, malformed, tampered, wrong-challenge, unknown-protocol) ----------
function selftest() {
  const rubric = JSON.parse(readFileSync(new URL("./rubric.json", import.meta.url), "utf8"));
  const RH = hashObj(rubric);
  const goodEvidence = { finding: "Reused credential accepted by secondary endpoint", cwe: "CWE-287",
    replay_step: "curl -s -H 'Authorization: Bearer REUSED' https://moorpost.internal/secondary",
    outcome: "HTTP 200, account data returned without re-authentication", watchword_named: false };
  const passEnvelope = { protocol: PROTOCOL, challenge_id: "moorpost-credential-reuse-001", actor_id: "participant-7f3a",
    action: "Flew the Moorpost range; attempted credential reuse on the secondary endpoint under policy.",
    evidence: goodEvidence, captured_at: "2026-10-15T19:20:00Z", evidence_hash: hashObj(goodEvidence) };
  const failEvidence = { finding: "Maybe something", cwe: "CWE-79", replay_step: "curl", outcome: "idk", watchword_named: true };
  const failEnvelope = { ...passEnvelope, actor_id: "participant-bad01", evidence: failEvidence, evidence_hash: hashObj(failEvidence) };
  const malformed = { ...passEnvelope, actor_id: "participant-mal10", evidence: { finding: "incomplete" }, evidence_hash: "0".repeat(64) };
  const tampered = JSON.parse(JSON.stringify(passEnvelope));
  tampered.evidence.outcome = "HTTP 200, FULL ACCOUNT DATA + watchword leak";
  const wrongChallenge = JSON.parse(JSON.stringify(passEnvelope));
  wrongChallenge.challenge_id = "some-other-challenge-999";
  const unknownProto = JSON.parse(JSON.stringify(passEnvelope));
  unknownProto.protocol = "athelgard-envelope/9";

  const results = [];
  const t = (name, cond) => results.push({ name, result: cond ? "PASS" : "FAIL" });
  const at = "2026-10-15T20:00:00Z";
  const r1 = evaluate(passEnvelope, rubric, RH, at);
  t("fixture-pass: PASS, 100/100", r1.status === "evaluated" && r1.verdict === "PASS" && r1.total_score === 100);
  const r2 = evaluate(failEnvelope, rubric, RH, at);
  t("fixture-fail: FAIL, deficient score", r2.status === "evaluated" && r2.verdict === "FAIL" && r2.total_score < 80);
  const r3 = evaluate(malformed, rubric, RH);
  t("fixture-malformed: fail-closed rejection", r3.status === "rejected");
  const r4 = evaluate(tampered, rubric, RH);
  t("fixture-tampered: evidence-hash mismatch detected", r4.status === "rejected" && r4.reason.includes("evidence hash mismatch"));
  const r5 = evaluate(wrongChallenge, rubric, RH);
  t("fixture-wrong-challenge: challenge mismatch rejection", r5.status === "rejected" && r5.reason.includes("challenge mismatch"));
  const r7 = evaluate(unknownProto, rubric, RH);
  t("fixture-unknown-protocol: protocol rejection", r7.status === "rejected" && r7.reason.includes("unknown protocol"));
  const r6 = evaluate(passEnvelope, rubric, "deadbeef" + RH.slice(8));
  t("rubric-hash precommitment enforced", r6.status === "rejected" && r6.reason.includes("rubric hash mismatch"));
  const receipt = makeReceipt(r1);
  t("receipt id = sha256 of canonical verdict payload", receipt.receipt_id.length === 64);
  const vr = verifyReceipt(receipt, passEnvelope, rubric);
  t("verify: clean receipt validates, all checks true", vr.valid === true);
  const forged = JSON.parse(JSON.stringify(receipt)); forged.total_score = 40; forged.verdict = "FAIL";
  const vr2 = verifyReceipt(forged, passEnvelope, rubric);
  t("verify: forged receipt rejected", vr2.valid === false);
  const again = evaluate(passEnvelope, rubric, RH, at);
  t("determinism: identical inputs -> identical verdict", again.total_score === r1.total_score && again.verdict === r1.verdict);
  t("sha256 matches FIPS test vectors",
    sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" &&
    sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const passed = results.filter(r => r.result === "PASS").length;
  console.log(`rubric sha-256: ${RH}`);
  for (const r of results) console.log(`${r.result === "PASS" ? "✔" : "✘"} ${r.name}`);
  console.log(`${passed}/${results.length} PASS`);
  return passed === results.length ? 0 : 1;
}

// ---------- CLI ----------
function main() {
  const args = argv.slice(2);
  if (args[0] === "selftest") return selftest();
  if (args[0] === "verify") {
    const rubric = JSON.parse(readFileSync(args[1], "utf8"));
    const envelope = JSON.parse(readFileSync(args[2], "utf8"));
    const receipt = JSON.parse(readFileSync(args[3], "utf8"));
    const out = verifyReceipt(receipt, envelope, rubric);
    console.log(JSON.stringify(out, null, 2));
    return out.valid ? 0 : 1;
  }
  const rubricPath = args.find((_, i) => args[i - 1] !== "--expect-rubric-hash" && args[i - 1] !== "--at" && !_.endsWith(".json")) || args[0];
  const jsonArgs = args.filter(a => a.endsWith(".json"));
  if (jsonArgs.length < 2) { console.error("usage: evaluator rubric.json envelope.json [--receipt] [--expect-rubric-hash H] | verify r.json e.json receipt.json | selftest"); return 2; }
  const rubric = JSON.parse(readFileSync(jsonArgs[0], "utf8"));
  const envelope = JSON.parse(readFileSync(jsonArgs[1], "utf8"));
  const expectHashIdx = args.indexOf("--expect-rubric-hash");
  const expectHash = expectHashIdx >= 0 ? args[expectHashIdx + 1] : undefined;
  const atIdx = args.indexOf("--at");
  const at = atIdx >= 0 ? args[atIdx + 1] : new Date().toISOString();
  const verdict = evaluate(envelope, rubric, expectHash, at);
  const final = args.includes("--receipt") && verdict.status === "evaluated" ? makeReceipt(verdict) : verdict;
  console.log(JSON.stringify(final, null, 2));
  return final.status === "evaluated" && final.verdict === "PASS" ? 0 : 1;
}
exit(main());

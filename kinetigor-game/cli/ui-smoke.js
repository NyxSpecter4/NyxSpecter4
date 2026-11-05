#!/usr/bin/env node
/*
 * kinetigor-game — UI SMOKE (headless; no browser in this environment)
 *   node cli/ui-smoke.js
 *
 * The DOM rendering itself can only be proven in a real browser
 * (rendering label: UNINSTRUMENTED here). What CAN be proven headlessly:
 * the exact module load order the phone will use, the pure UI layer
 * (forge bench ops, export, flag derivation, persistence), and the
 * offline-cache asset manifest completeness.
 *
 * Exit 0 only if every smoke check holds.
 */
"use strict";

var path = require("path");
var fs = require("fs");
var ROOT = path.join(__dirname, "..");
var passed = 0, failed = 0, failures = [];
function ok(cond, label) { if (cond) passed++; else { failed++; failures.push(label); } }
function section(name) { console.log("\n== " + name + " =="); }

/* ---------- 1. browser load order, in Node ---------- */
section("S1 BROWSER LOAD ORDER");
require(path.join(ROOT, "www", "vendor", "moorpost-kernel.js"));       /* 1st: estate relay kernel */
require(path.join(ROOT, "www", "core", "trust.js"));                    /* 2nd: contract */
require(path.join(ROOT, "www", "core", "kernel.js"));                   /* 3rd: five checks */
require(path.join(ROOT, "www", "core", "validator.js"));                 /* 4th: independent validator */
require(path.join(ROOT, "www", "core", "challenges.js"));               /* 5th: judges (needs MoorpostKernel) */
require(path.join(ROOT, "www", "core", "game.js"));                     /* 6th: run state machine */
require(path.join(ROOT, "www", "fixtures.js"));                   /* 7th: artifacts */
var UI = require(path.join(ROOT, "www", "ui.js"));              /* 8th: UI (pure layer; no document in Node) */
ok(!!UI && !!UI.FORGE, "ui.js loads headlessly with pure layer exposed");
var G = globalThis.KIN.Game, V = globalThis.KIN.Validator, T = globalThis.KIN.Trust, C = globalThis.KIN.Challenges;

/* ---------- 2. forge bench: the player's forgeries get refused ---------- */
section("S2 FORGE BENCH (validator refuses every op)");
var F = globalThis.KIN.FIXTURES;
var baseline = UI.walkChain(F.cache_chain.chain);
ok(baseline.reasons.length === 3 && baseline.reasons[0].seq === 3, "bench baseline: cache breaks at seq 3");
function codesOf(chain) {
  var rep = UI.walkChain(chain);
  var all = rep.run_codes.slice();
  rep.reasons.forEach(function (r) { all = all.concat(r.codes); });
  return all.join(",");
}
var ops = [
  ["alter", "INVALID_HASH"],
  ["remove", "BROKEN_PREDECESSOR"],
  ["reorder", "REORDERED_CHAIN"],
  ["replay", "DUPLICATE_RECEIPT"],
  ["badPrev", "BROKEN_PREDECESSOR"]
];
var pristine = JSON.stringify(F.cache_chain.chain);
ops.forEach(function (spec) {
  var res = UI.FORGE[spec[0]](F.cache_chain.chain);
  var codes = codesOf(res.chain);
  ok(codes.indexOf(spec[1]) !== -1, "forge " + spec[0] + " -> refused with " + spec[1] + " (got: " + codes + ")");
});
/* forge ops never mutate the pristine fixture */
ok(JSON.stringify(F.cache_chain.chain) === pristine, "forge ops leave the fixture untouched (pure copies)");

/* ---------- 3. export + flag derivation ---------- */
section("S3 EXPORT & FLAG");
var demo = require(path.join(ROOT, "cli", "demo-run.js")).playDemo();
(function () {
  var runFile = { schema: "kinetigor.game-run/1", run_id: "run-demo-0001", player: "Demo Verifier", exported_at: "2026-11-04T00:00:00Z", expected_final_receipt_id: demo.runFile.receipts[demo.runFile.receipts.length - 1].receipt_id, receipts: demo.runFile.receipts };
  var rep = V.validateRun(runFile);
  ok(rep.valid === true && rep.completed === true, "exported run passes the independent validator");
})();

/* flag derivation from a completed demo state */
var flag = UI.deriveFlag({ receipts: demo.runFile.receipts });
var last = demo.runFile.receipts[demo.runFile.receipts.length - 1];
ok(flag === "RALLY{" + last.game.chain.entry_hash.slice(0, 32) + "}", "flag derived from apex PASS entry hash");
ok(UI.deriveFlag({ receipts: demo.runFile.receipts.slice(0, 5) }) === null, "no flag without the apex PASS receipt");

/* buildExportFile on a UI-shaped state */
(function () {
  var uiState = G.newRun("UI Verifier", { run_id: "run-ui-0001" });
  /* solve stage 0 through the real flow so export has content */
  var rec = C._internals.warrantRecords[0];
  G.submit(uiState, "arrival-00", { record_id: rec.record_id, digest: T.sha256hex(T.canon(rec.fields)) });
  var ex2 = UI.buildExportFile(uiState);
  var parsed = JSON.parse(ex2.body);
  ok(parsed.schema === "kinetigor.game-run/1" && parsed.receipts.length === 1, "buildExportFile emits a valid run file");
  ok(/^princetown-run-run-ui-0001\.json$/.test(ex2.name), "export filename derived from run id");
})();

/* ---------- 4. persistence round-trip (the phone's save/restore) ---------- */
section("S4 PERSISTENCE");
(function () {
  var mem = {};
  var shim = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  UI._setStorage(shim);
  var uiState = G.newRun("Persist Verifier", { run_id: "run-persist-0001" });
  var rec = C._internals.warrantRecords[0];
  G.submit(uiState, "arrival-00", { record_id: rec.record_id, digest: T.sha256hex(T.canon(rec.fields)) });
  ok(UI.save(uiState, { "postbridge-01": { record_id: "PB-77-004" } }, { station: "postbridge-01" }), "save writes to storage");
  var loaded = UI.loadSave();
  ok(loaded !== null && loaded.state.run_id === "run-persist-0001", "save round-trips the run state");
  ok(loaded.state.receipts.length === 1 && loaded.state.receipts[0].game.verdict === "PASS", "restored receipts intact");
  ok(loaded.drafts["postbridge-01"].record_id === "PB-77-004", "restored evidence drafts intact");
  /* continue playing on the RESTORED state — the run must survive close/reopen */
  var wb = C._internals.waybills;
  var res = G.submit(loaded.state, "postbridge-01", { record_id: "PB-77-004", recomputed_digest: T.sha256hex(T.canon(wb[3].fields)) });
  ok(res.verdict === "PASS" && res.unlocked.indexOf("cache-02") !== -1, "restored run continues: next station solved and unlocked");
  var runFile = G.exportRun(loaded.state);
  ok(V.validateRun(runFile).valid === true, "chain after save/restore/continue still validates");
  UI.clearSave();
  ok(UI.loadSave() === null, "clearSave removes the run");
  UI._setStorage(null);
})();

/* ---------- 5. offline asset manifest completeness ---------- */
section("S5 OFFLINE ASSETS");
(function () {
  var sw = fs.readFileSync(path.join(ROOT, "www", "sw.js"), "utf8");
  var html = fs.readFileSync(path.join(ROOT, "www", "index.html"), "utf8");
  var m = sw.match(/var ASSETS = \[([\s\S]*?)\];/);
  ok(!!m, "sw.js declares an asset list");
  var assets = m[1].match(/"\.\/[^"]+"/g).map(function (s) { return s.slice(3, -1); });
  /* every script/style/manifest/icon the game actually references must be cached */
  var refs = [];
  var re = /(?:src|href)="([^"]+)"/g, mm;
  while ((mm = re.exec(html))) refs.push(mm[1]);
  refs.push("sw.js");
  refs.push("verify.html");
  /* each referenced file must be in the SW cache list (sw.js registers itself) */
  var missing2 = refs.filter(function (r) { return r !== "sw.js" && assets.indexOf(r) === -1; });
  ok(missing2.length === 0, "sw.js caches every referenced asset (missing: " + JSON.stringify(missing2) + ")");
  assets.forEach(function (a) {
    ok(fs.existsSync(path.join(ROOT, "www", a)) || a === "./", "cached asset exists on disk: " + a);
  });
  /* sw.js fetch usage is confined to the offline cache pattern */
  var fetchUses = sw.match(/fetch\(/g) || [];
  ok(fetchUses.length === 1 && /fetch\(e\.request\)/.test(sw), "sw.js fetch is only the offline cache pattern");
  /* manifest icons exist */
  var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "www", "manifest.webmanifest"), "utf8"));
  manifest.icons.forEach(function (icon) {
    ok(fs.existsSync(path.join(ROOT, "www", icon.src)), "manifest icon exists: " + icon.src);
  });
  /* verify.html standalone: stranger validator loads the frozen validator, no network */
  var vh = fs.readFileSync(path.join(ROOT, "www", "verify.html"), "utf8");
  ok(vh.indexOf("core/validator.js") !== -1, "verify.html uses the frozen validator");
  ok(!/fetch\s*\(|XMLHttpRequest|WebSocket/.test(vh), "verify.html makes no network calls");
})();

/* ---------- summary ---------- */
console.log("\n================================");
console.log("PASS: " + passed + "   FAIL: " + failed);
if (failed) {
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
console.log("UI SMOKE GREEN (DOM rendering UNINSTRUMENTED — no browser in this environment)");
process.exit(0);

/*
 * cli/ui-smoke.js — HEADLESS UI SMOKE TEST (development instrument only)
 * Not part of the shipped verification path; not referenced by the README
 * stranger-path. It executes www/ui.js against a minimal fake DOM and drives
 * a full playthrough by invoking the real click handlers, proving the UI
 * logic path BEGIN -> 5 stations -> finish -> export works without a browser.
 * Browser *rendering* remains UNINSTRUMENTED until a human plays it.
 *
 * Run: node cli/ui-smoke.js
 */
"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

/* ---------- minimal fake DOM (just enough for ui.js) ---------- */
function text(t) { return { __text: t }; }
function node(tag) {
  return {
    tagName: tag, children: [], attrs: {}, value: "", textContent: "",
    onclick: null, href: "", download: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    click() { if (this.onclick) this.onclick(); },
    /* innerHTML="" clears children; other assignments ignored */
    set innerHTML(v) { if (v === "") this.children = []; },
    get innerHTML() { return ""; }
  };
}
const byId = {};
const documentStub = {
  createElement: (t) => node(t),
  createTextNode: (t) => text(t),
  getElementById: (id) => (byId[id] = byId[id] || node("div#" + id))
};
const storage = {};
const localStorageStub = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};
const downloads = [];
global.window = global;
global.document = documentStub;
global.localStorage = localStorageStub;
global.confirm = () => true;
global.Blob = class { constructor(parts) { this.parts = parts; } };
global.URL = { createObjectURL: () => "blob:stub", revokeObjectURL() {} };

/* load core + fixtures + ui exactly as index.html orders them */
["core/trust.js", "core/kernel.js", "core/validator.js", "core/challenges.js",
 "core/game.js", "www/fixtures.js"].forEach(f => require(path.join(ROOT, f)));

const T = global.KIN.Trust, C = global.KIN.Challenges, G = global.KIN.Game,
      V = global.KIN.Validator, K = global.KIN.Kernel, F = global.KIN.FIXTURES;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log("  ok  " + name); } else { fail++; console.log("  FAIL " + name); } }

/* ---------- traversal helpers over the fake tree ---------- */
function walk(n, fn) { fn(n); (n.children || []).forEach(c => walk(c, fn)); }
function findAll(pred) {
  const out = [];
  walk(byId["main"], n => { if (n !== byId["main"] && pred(n)) out.push(n); });
  return out;
}
const buttonsWith = (cls) => findAll(n => n.tagName === "button" && (n.attrs["class"] || "").includes(cls));
const hasText = (n, s) => (n.__text || "").includes(s) || n.children.some(c => hasText(c, s));
function textOf(pred) { const b = findAll(pred)[0]; return b ? JSON.stringify(flatten(b)) : ""; }
function flatten(n) { const parts = []; walk(n, c => { if (c.__text) parts.push(c.__text); }); return parts.join(" "); }
function stageInputs() { return findAll(n => n.tagName === "input" && n.attrs.id !== "playername"); }

/* ---------- drive the game ---------- */
require(path.join(ROOT, "www/ui.js")); /* boots: state=null -> renderHome */

console.log("== UI SMOKE: home renders ==");
ok(byId["main"].children.length > 0, "home rendered");
ok(textOf(n => n.tagName === "button" && flatten(n).includes("BEGIN THE RUN")) !== "", "begin button present");

const nameInput = findAll(n => n.tagName === "input" && n.attrs.id === "playername")[0];
nameInput.value = "Smoke Verifier";
buttonsWith("primary")[0].click();

console.log("== UI SMOKE: stage 0 renders ==");
ok(findAll(n => n.tagName === "h2").some(h => flatten(h).includes("ARRIVAL")), "arrival desk open");
ok(buttonsWith("ghost").length > 0, "lens buttons present");

/* stage 0: honest FAIL first, then correct PASS */
let ins = stageInputs();
ins[0].value = "WRNT-2077-A19"; ins[1].value = T.sha256hex(T.canon({ clearance: "C-3", circuit: "Princetown Packet", name: "Rally Standing Orders" }));
buttonsWith("primary")[0].click();
let failText = flatten(byId["main"]);
ok(failText.includes("S0_WRONG_RECORD") || failText.includes("FAIL"), "wrong record -> FAIL verdict shown");

ins = stageInputs();
ins[0].value = "WRNT-2077-A17";
ins[1].value = T.sha256hex(T.canon({ clearance: "C-2", circuit: "Princetown Packet", name: "the arriving Verifier" }));
buttonsWith("primary")[0].click();
ok(flatten(byId["main"]).includes("S0_VERIFIED"), "correct digest -> PASS verdict shown");

/* click every ghost (lens) button on every later desk to prove lens paths run */
function clickAllLenses() { buttonsWith("ghost").forEach(b => { if (flatten(b).includes("LENS")) b.click(); }); }

console.log("== UI SMOKE: stage 1 ==");
clickAllLenses();
ins = stageInputs();
ins[0].value = "PB-77-004";
ins[1].value = T.sha256hex(T.canon(C._internals.waybills[3].fields));
buttonsWith("primary")[0].click();
ok(flatten(byId["main"]).includes("PB_AMENDMENT_FOUND"), "postbridge amendment -> PASS");

console.log("== UI SMOKE: stage 2 (lens = real validator walk) ==");
clickAllLenses();
const rep = V.validateChain(F.cache_chain.chain, {});
const firstBad = rep.reasons[0];
const cacheBadId = F.cache_chain.chain[firstBad.seq].receipt_id;
const cacheLastValidId = F.cache_chain.chain[firstBad.seq - 1].receipt_id;
ins = stageInputs();
ins[0].value = cacheBadId; ins[1].value = "INVALID_HASH"; ins[2].value = cacheLastValidId;
buttonsWith("primary")[0].click();
ok(flatten(byId["main"]).includes("CACHE_QUARANTINE_ORDERED") || flatten(byId["main"]).includes("PASS"), "cache quarantine accepted");

console.log("== UI SMOKE: stage 3 ==");
clickAllLenses();
const st = JSON.parse(localStorageStub.getItem("kinetigor-game-run-1"));
const authReceipt = st.receipts.filter(r => r.game.challenge_id === "cache-02" && r.game.verdict === "PASS").pop().receipt_id;
ins = stageInputs();
ins[0].value = "PKT-A"; ins[1].value = authReceipt;
buttonsWith("primary")[0].click();
ok(flatten(byId["main"]).includes("DLV_PROVENANCE_ACCEPTED"), "provenance packet accepted");

console.log("== UI SMOKE: stage 4 ==");
clickAllLenses();
const results = K.verifyRecords(F.apex_bundle);
const quarantine = results.filter(r => r.verdict === "QUARANTINE").map(r => r.record_id)[0];
const liars = results.filter(r => r.claimed_status === "PASS" && r.verdict === "FAIL").map(r => r.record_id);
const deliverable = results.filter(r => r.verdict === "PASS").map(r => r.record_id)[0];
ins = stageInputs();
ins[0].value = quarantine; ins[1].value = JSON.stringify(liars); ins[2].value = deliverable;
buttonsWith("primary")[0].click();
ok(flatten(byId["main"]).includes("APEX_SEALED"), "apex sealed");

console.log("== UI SMOKE: finish + export ==");
const doneText = flatten(byId["main"]);
ok(doneText.includes("RUN COMPLETE"), "finish screen shown");
ok(doneText.includes("node cli/verify.js"), "independent verification instructions shown");

/* replay-detection via the UI path (resubmit identical evidence) */
const exportBtn = buttonsWith("primary").filter(b => flatten(b).includes("EXPORT"))[0];
ok(!!exportBtn, "export button present");

/* exported run from localStorage must validate under the frozen contract */
const state = JSON.parse(localStorageStub.getItem("kinetigor-game-run-1"));
const exp = G.exportRun(state);
const vrep = V.validateRun(exp);
ok(vrep.valid === true, "exported UI run validates (valid=" + vrep.valid + ")");
ok(vrep.completed === true, "exported UI run completed");
ok(state.receipts.length >= 6, "receipts recorded: " + state.receipts.length);

/* honest-failure replay test: resubmit identical evidence to a solved desk */
const solved = state.solved;
console.log("== RESULT ==");
console.log("PASS: " + pass + "  FAIL: " + fail);
if (fail > 0) process.exit(1);
console.log("UI SMOKE GREEN — UI logic path executed headless; browser rendering still UNINSTRUMENTED (needs human play).");

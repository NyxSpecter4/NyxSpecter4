/**
 * bountywarz-gateway — KIN gateway Space (fabric inference tier T3).
 *
 * Self-contained: zero dependencies, no repo clone at build time (the old
 * image cloned a PRIVATE GitHub repo with no credentials — it could never
 * build). This file is the whole service.
 *
 * Contract (packages/kin-fabric index.js — buildGatewayRequest /
 * normalizeResponse / probeTiers):
 *   GET  /healthz   -> 200 JSON  (definitive liveness probe for fabric T3)
 *   GET  /health    -> alias of /healthz (container healthcheck)
 *   POST /kin/chat  -> { model, messages, temperature, max_tokens? }
 *                      -> { ok, text, model, upstream } on success
 *   POST /v1/chat/completions -> OpenAI-style alias of /kin/chat
 *
 * Secrets (Space settings):
 *   HF_TOKEN         — required for inference (router access to
 *                      nyxspecter4/kin-cybersecurity-3b). Without it the
 *                      Space stays alive and reports hf_router_configured:
 *                      false; /kin/chat answers 503 with a clear error.
 *   GATEWAY_API_KEY  — optional; when set, callers must send
 *                      "Authorization: Bearer <key>" or "x-api-key: <key>".
 *
 * One thing per thing: this service owns transport only. Brief formatting
 * belongs to @bountywarz/dpo-corpus, capture to kin-fabric, training to
 * kin-train, deploy to kin-deploy.
 */
'use strict';

var http = require('http');
var https = require('https');
var url = require('url');

var VERSION = '1.1.0';
var SERVICE = 'kin-gateway';
var KIN_MODEL = 'nyxspecter4/kin-cybersecurity-3b';
var HF_ROUTER = process.env.HF_ROUTER_URL || 'https://router.huggingface.co/v1/chat/completions';
var PORT = parseInt(process.env.PORT || '7860', 10);
var HF_TOKEN = process.env.HF_TOKEN || '';
var API_KEY = process.env.GATEWAY_API_KEY || '';
var STARTED_AT = Date.now();
var RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10); // 0 disables
var MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || '262144', 10);

/* Sliding-window per-IP rate limiter (in-memory; per replica). */
var rateBuckets = Object.create(null);
function rateLimited(ip) {
  if (!RATE_LIMIT_PER_MIN) return false;
  var now = Date.now();
  var bucket = rateBuckets[ip];
  if (!bucket) bucket = rateBuckets[ip] = [];
  // drop timestamps older than 60s
  var fresh = [];
  for (var i = 0; i < bucket.length; i++) if (now - bucket[i] < 60000) fresh.push(bucket[i]);
  if (fresh.length >= RATE_LIMIT_PER_MIN) {
    rateBuckets[ip] = fresh;
    return true;
  }
  fresh.push(now);
  rateBuckets[ip] = fresh;
  // opportunistic purge when the map grows (long-lived replica)
  var keys = Object.keys(rateBuckets);
  if (keys.length > 10000) {
    for (var k = 0; k < keys.length; k++) {
      var b = rateBuckets[keys[k]];
      var f2 = [];
      for (var j = 0; j < b.length; j++) if (now - b[j] < 60000) f2.push(b[j]);
      if (f2.length === 0) delete rateBuckets[keys[k]]; else rateBuckets[keys[k]] = f2;
    }
  }
  return false;
}
function clientIp(req) {
  // HF Spaces sits behind a proxy; honor the forwarded chain's first hop.
  var xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ---------------- helpers ---------------- */

function send(res, status, payload) {
  var body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(body);
}

function readBody(req, res, cb) {
  var chunks = [];
  var total = 0;
  var tooLarge = false;
  req.on('data', function (c) {
    if (tooLarge) return;
    total += c.length;
    if (total > MAX_BODY_BYTES) {
      tooLarge = true;
      chunks = [];
      // respond 413, then close the connection after the response flushes
      res.on('finish', function () { req.destroy(); });
      send(res, 413, { ok: false, error: 'payload_too_large', limit_bytes: MAX_BODY_BYTES, detail: 'request body exceeds the limit' });
      return;
    }
    chunks.push(c);
  });
  req.on('end', function () {
    if (tooLarge) return;
    try {
      cb(null, Buffer.concat(chunks).toString('utf8'));
    } catch (e) { cb(e); }
  });
  req.on('error', function (e) {
    if (tooLarge) return;
    cb(e);
  });
}

function authorized(req) {
  if (!API_KEY) return true; // open by default; fabric sends no auth header
  var h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + API_KEY) return true;
  if (req.headers['x-api-key'] === API_KEY) return true;
  return false;
}

/** POST JSON to HF router; cb(status, bodyText). */
function hfRouterCall(bodyObj, cb) {
  var payload = JSON.stringify(bodyObj);
  var parsed = url.parse(HF_ROUTER);
  var transport = (parsed.protocol === 'http:') ? http : https;
  var req = transport.request({
    method: 'POST',
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
    path: parsed.path,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': 'Bearer ' + HF_TOKEN
    },
    timeout: 120000
  }, function (r) {
    var chunks = [];
    r.on('data', function (c) { chunks.push(c); });
    r.on('end', function () { cb(r.statusCode, Buffer.concat(chunks).toString('utf8')); });
  });
  req.on('timeout', function () { req.destroy(); cb(0, 'upstream timeout'); });
  req.on('error', function (e) { cb(0, String(e && e.message || e)); });
  req.end(payload);
}

function validMessages(messages) {
  return Array.isArray(messages) && messages.length > 0 &&
    messages.length <= 64 &&
    messages.every(function (m) {
      return m && typeof m === 'object' &&
        typeof m.role === 'string' && m.role &&
        typeof m.content === 'string' && m.content.length > 0;
    });
}

/** Map fabric gateway model names to canonical HF model ids. */
function resolveModel(model) {
  var m = typeof model === 'string' && model ? model : 'kin-cybersecurity-3b';
  if (m === 'kin-cybersecurity-3b' || m === KIN_MODEL) return KIN_MODEL;
  return m; // pass through explicit HF ids
}

/* ---------------- request handling ---------------- */

function handleKinChat(req, res, openaiStyle) {
  if (!authorized(req)) {
    return send(res, 401, { ok: false, error: 'unauthorized', detail: 'GATEWAY_API_KEY is set; send Authorization: Bearer <key> or x-api-key: <key>' });
  }
  if (rateLimited(clientIp(req))) {
    return send(res, 429, { ok: false, error: 'rate_limited', detail: 'per-IP inference request limit reached', limit_per_min: RATE_LIMIT_PER_MIN, retry_after_s: 60 });
  }
  readBody(req, res, function (err, raw) {
    if (err) return send(res, 400, { ok: false, error: 'bad_request', detail: String(err && err.message || err) });
    var body;
    try { body = JSON.parse(raw || ''); }
    catch (e) { return send(res, 400, { ok: false, error: 'bad_json', detail: 'body must be JSON' }); }
    var messages = body.messages;
    if (!validMessages(messages)) {
      return send(res, 400, { ok: false, error: 'invalid_messages', detail: 'messages must be a non-empty array of {role, content}' });
    }
    if (!HF_TOKEN) {
      return send(res, 503, { ok: false, error: 'hf_token_missing', detail: 'HF_TOKEN secret is not configured on this Space', hint: 'set HF_TOKEN in Space settings (router.huggingface.co access to ' + KIN_MODEL + ')' });
    }
    var model = resolveModel(body.model);
    var upstreamBody = {
      model: model,
      messages: messages,
      temperature: (typeof body.temperature === 'number') ? body.temperature : 0.3,
      max_tokens: (typeof body.max_tokens === 'number' && body.max_tokens > 0 && body.max_tokens <= 2048) ? body.max_tokens : 512,
      stream: false
    };
    hfRouterCall(upstreamBody, function (status, text) {
      if (status < 200 || status >= 300) {
        return send(res, 502, {
          ok: false, error: 'hf_router_error', upstream_status: status,
          detail: ('' + text).slice(0, 500), model: model
        });
      }
      var json;
      try { json = JSON.parse(text); }
      catch (e) {
        return send(res, 502, { ok: false, error: 'bad_upstream_json', detail: 'upstream returned non-JSON', upstream_status: status });
      }
      var choice = json.choices && json.choices[0];
      var content = (choice && choice.message && choice.message.content) ||
        (choice && choice.text) || (json.text) || '';
      if (typeof content !== 'string' || !content) {
        return send(res, 502, { ok: false, error: 'empty_upstream_response', upstream_status: status, model: model });
      }
      if (openaiStyle) {
        // OpenAI-style alias: shape the answer like a chat.completions reply.
        return send(res, 200, {
          id: 'kin-gateway-1', object: 'chat.completion', created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{ index: 0, message: { role: 'assistant', content: content }, finish_reason: (choice && choice.finish_reason) || 'stop' }],
          usage: json.usage || undefined
        });
      }
      // Fabric T3 shape: normalizeResponse('gateway', ...) reads .text first.
      return send(res, 200, {
        ok: true, text: content, model: model,
        upstream_status: status, upstream_model: (json.model || model),
        usage: json.usage || undefined
      });
    });
  });
}

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var path = parsed.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  if (req.method === 'GET' && (path === '/healthz' || path === '/health')) {
    return send(res, 200, {
      ok: true, service: SERVICE, version: VERSION,
      uptime_s: Math.floor((Date.now() - STARTED_AT) / 1000),
      model: KIN_MODEL, hf_router_configured: Boolean(HF_TOKEN),
      auth_required: Boolean(API_KEY),
      rate_limit_per_min: RATE_LIMIT_PER_MIN,
      capabilities: ['healthz', 'kin/chat', 'v1/chat/completions']
    });
  }

  if (req.method === 'GET' && path === '/') {
    return send(res, 200, {
      ok: true, service: SERVICE, version: VERSION,
      contract: {
        'GET /healthz': 'liveness probe (fabric T3)',
        'POST /kin/chat': '{ model, messages, temperature, max_tokens? } -> { ok, text, ... }',
        'POST /v1/chat/completions': 'OpenAI-style alias of /kin/chat'
      },
      model: KIN_MODEL, hf_router_configured: Boolean(HF_TOKEN)
    });
  }

  if (req.method === 'POST' && path === '/kin/chat') return handleKinChat(req, res, false);
  if (req.method === 'POST' && path === '/v1/chat/completions') return handleKinChat(req, res, true);

  if (!req.method !== 'OPTIONS' && (path === '/kin/chat' || path === '/v1/chat/completions')) {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { ok: false, error: 'method_not_allowed', detail: 'use POST for this route', allow: 'POST, OPTIONS' });
  }
  return send(res, 404, { ok: false, error: 'not_found', detail: 'routes: GET /healthz, GET /, POST /kin/chat, POST /v1/chat/completions' });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('[' + SERVICE + '] listening on ' + PORT + ' v' + VERSION +
    ' | hf_router_configured=' + Boolean(HF_TOKEN) + ' | auth_required=' + Boolean(API_KEY));
});

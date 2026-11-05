/**
 * Moorpost Canonical Relay Kernel (browser + node).
 * Historically agnostic. Skins may not change these semantics.
 *
 * Five invariants (not configurable by a course):
 *   identity     — owner must match issued owner
 *   provenance   — integrity hash must match canonical payload
 *   sequence     — destination/station order may not skip or invert
 *   uniqueness   — same packet+station stamp may land once
 *   atomicity    — concurrent first-stamp: at most one commit
 *
 * Refusal codes are frozen. Hash function is frozen. selfCheck proves both.
 */
(function (root) {
  'use strict';

  var INVARIANTS = Object.freeze([
    'identity',
    'provenance',
    'sequence',
    'uniqueness',
    'atomicity'
  ]);

  var REFUSAL = Object.freeze({
    identity: 'REFUSED_IDENTITY',
    provenance: 'REFUSED_PROVENANCE',
    sequence: 'REFUSED_SEQUENCE',
    uniqueness: 'REFUSED_REPLAY',
    atomicity: 'REFUSED_RACE',
    stale: 'REFUSED_STALE',
    no_falsifier: 'REFUSED_NO_FALSIFIER',
    ok: 'ACCEPTED'
  });

  function canonicalPayload(p) {
    return [
      p.origin || '',
      p.destination || '',
      p.owner || '',
      String(p.sequence == null ? '' : p.sequence),
      p.event_id || '',
      p.station_id || '',
      p.claim || '',
      p.falsifier || '',
      (p.evidence || []).join(','),
      p.issued_at || ''
    ].join('|');
  }

  function hexHash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function sameHex(a, b) {
    a = String(a || '');
    b = String(b || '');
    var n = Math.max(a.length, b.length);
    var diff = a.length === b.length ? 0 : 1;
    for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  }

  function issuePacket(fields) {
    fields = fields || {};
    if (!fields.origin || !fields.destination || !fields.owner) {
      return { ok: false, code: REFUSAL.identity, reasons: ['missing_identity'] };
    }
    var p = {
      origin: fields.origin,
      destination: fields.destination,
      owner: fields.owner,
      sequence: fields.sequence | 0,
      event_id: fields.event_id || ('EVT-' + Date.now()),
      station_id: fields.station_id || fields.origin,
      claim: fields.claim || '',
      falsifier: fields.falsifier || '',
      evidence: fields.evidence || [],
      issued_at: fields.issued_at || new Date().toISOString(),
      expires_at: fields.expires_at || null,
      stamps: []
    };
    p.integrity_hash = hexHash(canonicalPayload(p));
    return p;
  }

  function clonePacket(p) {
    return JSON.parse(JSON.stringify(p));
  }

  function validatePacket(packet, opts) {
    opts = opts || {};
    var reasons = [];
    if (!packet) {
      return { ok: false, code: REFUSAL.provenance, reasons: ['missing_packet'], invariant: 'provenance' };
    }
    if (opts.expectedOwner && !sameHex(packet.owner, opts.expectedOwner)) {
      reasons.push('wrong_owner');
      return { ok: false, code: REFUSAL.identity, reasons: reasons, invariant: 'identity' };
    }
    var expectedHash = hexHash(canonicalPayload(packet));
    if (!packet.integrity_hash || !sameHex(packet.integrity_hash, expectedHash)) {
      reasons.push('broken_seal');
      return { ok: false, code: REFUSAL.provenance, reasons: reasons, invariant: 'provenance' };
    }
    if (opts.expectedSequence != null && Number(packet.sequence) !== Number(opts.expectedSequence)) {
      reasons.push('stale_or_inverted_sequence');
      return { ok: false, code: REFUSAL.sequence, reasons: reasons, invariant: 'sequence' };
    }
    if (opts.requireFalsifier && !String(packet.falsifier || '').trim()) {
      return { ok: false, code: REFUSAL.no_falsifier, reasons: ['hypothesis_without_falsifier'], invariant: 'provenance' };
    }
    if (opts.now && packet.expires_at && new Date(opts.now) > new Date(packet.expires_at)) {
      return { ok: false, code: REFUSAL.stale, reasons: ['expired'], invariant: 'sequence' };
    }
    var stampKey = packet.event_id + '|' + packet.station_id + '|' + packet.sequence;
    var seen = opts.seenStampKeys || {};
    var prior = packet.stamps || [];
    for (var s = 0; s < prior.length; s++) {
      if (prior[s] && prior[s].station_id === packet.station_id) {
        return { ok: false, code: REFUSAL.uniqueness, reasons: ['already_entered'], invariant: 'uniqueness' };
      }
    }
    if (seen[stampKey]) {
      return { ok: false, code: REFUSAL.uniqueness, reasons: ['replay'], invariant: 'uniqueness' };
    }
    if (opts.raceLost) {
      return { ok: false, code: REFUSAL.atomicity, reasons: ['concurrent_commit_lost'], invariant: 'atomicity' };
    }
    return { ok: true, code: REFUSAL.ok, reasons: [], invariant: null, stampKey: stampKey };
  }

  function stampIfValid(packet, opts) {
    var v = validatePacket(packet, opts);
    if (!v.ok) return { ok: false, validation: v, packet: packet };
    packet.stamps = packet.stamps || [];
    packet.stamps.push({
      station_id: packet.station_id,
      at: (opts && opts.now) || new Date().toISOString(),
      code: REFUSAL.ok
    });
    if (opts && opts.seenStampKeys && v.stampKey) opts.seenStampKeys[v.stampKey] = true;
    return { ok: true, validation: v, packet: packet };
  }

  function selfCheck() {
    var good = issuePacket({ origin: 'A', destination: 'B', owner: 'courier', sequence: 1, event_id: 'E', station_id: 'A', issued_at: 't' });
    var badOwner = validatePacket(good, { expectedOwner: 'other' });
    var broken = clonePacket(good);
    broken.claim = 'tampered';
    var badSeal = validatePacket(broken, {});
    var badSeq = validatePacket(good, { expectedSequence: 2 });
    var seen = {};
    seen[good.event_id + '|' + good.station_id + '|' + good.sequence] = true;
    var replay = validatePacket(good, { seenStampKeys: seen });
    var race = validatePacket(good, { raceLost: true });
    var ok = validatePacket(good, { expectedOwner: 'courier', expectedSequence: 1 });
    return {
      ok: badOwner.code === REFUSAL.identity && badSeal.code === REFUSAL.provenance && badSeq.code === REFUSAL.sequence && replay.code === REFUSAL.uniqueness && race.code === REFUSAL.atomicity && ok.code === REFUSAL.ok,
      codes: [badOwner.code, badSeal.code, badSeq.code, replay.code, race.code, ok.code]
    };
  }

  var api = {
    INVARIANTS: INVARIANTS,
    REFUSAL: REFUSAL,
    canonicalPayload: canonicalPayload,
    hexHash: hexHash,
    issuePacket: issuePacket,
    clonePacket: clonePacket,
    validatePacket: validatePacket,
    stampIfValid: stampIfValid,
    selfCheck: selfCheck
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoorpostKernel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

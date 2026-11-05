#!/usr/bin/env node
/*
 * kinetigor-game — deterministic PNG icon generator (no dependencies).
 * Draws the Princetown seal (gold ring, cyan check) into PNG files with
 * Node's built-in zlib. Run once: node cli/make-icons.js
 */
"use strict";
var fs = require("fs");
var path = require("path");
var zlib = require("zlib");

function crc32(buf) {
  var table = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  var crc = 0xffffffff;
  for (var i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  var body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, draw) {
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  /* bit depth */
  ihdr[9] = 6;  /* RGBA */
  var raw = Buffer.alloc(0);
  for (var y = 0; y < size; y++) {
    var line = Buffer.alloc(1 + size * 4);
    line[0] = 0; /* filter none */
    for (var x = 0; x < size; x++) {
      var px = draw(x, y, size);
      var o = 1 + x * 4;
      line[o] = px[0]; line[o + 1] = px[1]; line[o + 2] = px[2]; line[o + 3] = px[3];
    }
    raw = Buffer.concat([raw, line]);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* the seal: dark tile, gold ring, cyan inner ring + check */
function sealPixel(x, y, s) {
  var cx = s / 2, cy = s / 2;
  var r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  var u = s / 512; /* normalize to the 512 viewBox */
  var BG = [14, 22, 32, 255], GOLD = [217, 164, 65, 255], CYAN = [55, 200, 195, 255];
  /* rounded-square backdrop */
  var corner = 96 * u;
  var min = 0, max = s - 1;
  var inRounded = true;
  if ((x < corner && y < corner && Math.sqrt((corner - x) * (corner - x) + (corner - y) * (corner - y)) > corner) ||
      (x > max - corner && y < corner && Math.sqrt((x - (max - corner)) * (x - (max - corner)) + (corner - y) * (corner - y)) > corner) ||
      (x < corner && y > max - corner && Math.sqrt((corner - x) * (corner - x) + (y - (max - corner)) * (y - (max - corner))) > corner) ||
      (x > max - corner && y > max - corner && Math.sqrt((x - (max - corner)) * (x - (max - corner)) + (y - (max - corner)) * (y - (max - corner))) > corner)) inRounded = false;
  if (!inRounded) return [0, 0, 0, 0];
  if (Math.abs(r - 168 * u) <= 14 * u) return GOLD;
  if (Math.abs(r - 96 * u) <= 10 * u) return CYAN;
  /* the check: two strokes */
  var seg = function (x1, y1, x2, y2, w) {
    var dx = x2 - x1, dy = y2 - y1;
    var t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    if (t < 0 || t > 1) return false;
    var px = x1 + t * dx, py = y1 + t * dy;
    return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) <= w;
  };
  if (seg(196 * u, 262 * u, 240 * u, 306 * u, 15 * u) || seg(240 * u, 306 * u, 324 * u, 210 * u, 15 * u)) return CYAN;
  return BG;
}

function main() {
  var dir = path.join(__dirname, "..", "www", "icons");
  fs.mkdirSync(dir, { recursive: true });
  [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180]
  ].forEach(function (spec) {
    var buf = png(spec[1], function (x, y, s) { return sealPixel(x, y, s); });
    fs.writeFileSync(path.join(dir, spec[0]), buf);
    console.log("icon written: " + spec[0] + " (" + buf.length + " bytes)");
  });
}
if (require.main === module) main();

// Minimal QR encoder — byte mode, error level M, versions 1-10 (up to 213
// characters, far more than a LAN URL needs). Written out longhand rather than
// pulled from a CDN because game day happens on a router with no internet.
(function () {
  'use strict';

  // ---------- GF(256) arithmetic (primitive polynomial 0x11d) ----------
  const EXP = new Array(512);
  const LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function mul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function genPoly(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = genPoly(ecLen);
    const res = new Array(ecLen).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      for (let j = 0; j < ecLen; j++) res[j] ^= mul(gen[j + 1], factor);
    }
    return res;
  }

  // ---------- Version tables (error level M only) ----------
  // [ecPerBlock, group1Blocks, group1Data, group2Blocks, group2Data]
  const VERSIONS = {
    1: [10, 1, 16, 0, 0],
    2: [16, 1, 28, 0, 0],
    3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0],
    8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44]
  };

  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function dataCapacity(version) {
    const [, b1, d1, b2, d2] = VERSIONS[version];
    return b1 * d1 + b2 * d2;
  }

  function utf8Bytes(str) {
    const out = [];
    for (const ch of str) {
      let cp = ch.codePointAt(0);
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return out;
  }

  // ---------- Bit stream -> final codewords ----------
  function buildCodewords(bytes, version) {
    const bits = [];
    const push = (value, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };

    push(0b0100, 4);                       // byte mode
    push(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(b => push(b, 8));

    const capacityBits = dataCapacity(version) * 8;
    for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    const pads = [0xec, 0x11];
    for (let i = 0; data.length < dataCapacity(version); i++) data.push(pads[i % 2]);

    // Split into blocks, compute EC, then interleave both sets.
    const [ecLen, b1, d1, b2, d2] = VERSIONS[version];
    const blocks = [];
    let at = 0;
    for (let i = 0; i < b1; i++) { blocks.push(data.slice(at, at + d1)); at += d1; }
    for (let i = 0; i < b2; i++) { blocks.push(data.slice(at, at + d2)); at += d2; }
    const ecBlocks = blocks.map(b => rsEncode(b, ecLen));

    const out = [];
    const maxData = Math.max(d1, d2);
    for (let i = 0; i < maxData; i++) {
      blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    }
    for (let i = 0; i < ecLen; i++) ecBlocks.forEach(b => out.push(b[i]));
    return out;
  }

  // ---------- Matrix ----------
  function makeMatrix(version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

    const set = (r, c, v) => { modules[r][c] = v; reserved[r][c] = true; };

    function finder(row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r, cc = col + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                         (c >= 0 && c <= 6 && (r === 0 || r === 6));
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          set(rr, cc, inRing || inCore ? 1 : 0);
        }
      }
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      set(6, i, i % 2 === 0 ? 1 : 0);
      set(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Alignment patterns (skipped where they would collide with a finder)
    const centers = ALIGN[version];
    centers.forEach(r => centers.forEach(c => {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) return;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          set(r + dr, c + dc, ring === 1 ? 0 : 1);
        }
      }
    }));

    // Dark module + reserved format areas
    set(size - 8, 8, 1);
    for (let i = 0; i < 9; i++) {
      if (modules[8][i] === null) { modules[8][i] = 0; reserved[8][i] = true; }
      if (modules[i][8] === null) { modules[i][8] = 0; reserved[i][8] = true; }
    }
    for (let i = 0; i < 8; i++) {
      if (modules[8][size - 1 - i] === null) { modules[8][size - 1 - i] = 0; reserved[8][size - 1 - i] = true; }
      if (modules[size - 1 - i][8] === null) { modules[size - 1 - i][8] = 0; reserved[size - 1 - i][8] = true; }
    }

    // Version information blocks (version 7 and up)
    if (version >= 7) {
      let d = version << 12;
      for (let i = 0; i < 6; i++) {
        if (d >> (17 - i) & 1) d ^= 0x1f25 << (5 - i);
      }
      const info = (version << 12) | d;
      for (let i = 0; i < 18; i++) {
        const bit = (info >> i) & 1;
        set(Math.floor(i / 3), size - 11 + (i % 3), bit);
        set(size - 11 + (i % 3), Math.floor(i / 3), bit);
      }
    }

    return { size, modules, reserved };
  }

  function placeData(m, codewords) {
    const { size, modules, reserved } = m;
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right = 5; // the vertical timing column is not a data column
      for (let step = 0; step < size; step++) {
        const row = upward ? size - 1 - step : step;
        for (let k = 0; k < 2; k++) {
          const col = right - k;
          if (reserved[row][col]) continue;
          let bit = 0;
          if (bitIndex < codewords.length * 8) {
            bit = (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
          }
          modules[row][col] = bit;
          bitIndex++;
        }
      }
      upward = !upward;
    }
  }

  function maskFn(id, r, c) {
    switch (id) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  function applyFormat(m, maskId) {
    const { size, modules } = m;
    // Error level M = 0b00; BCH(15,5) with generator 0x537, masked with 0x5412.
    let data = (0b00 << 3) | maskId;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    // Low bits (0-7) run down the top-left finder's column and along the
    // top-right finder's row; high bits (7-14) run along the top-left
    // finder's row and down the bottom-left finder's column. Getting the
    // low/high split backwards here still LOOKS like a QR code but no
    // scanner can read it, since they all expect this exact placement.
    let voffset = 0, hoffset = 0;
    for (let i = 0; i < 8; i++) {
      const vbit = (bits >> i) & 1;
      const hbit = (bits >> (14 - i)) & 1;
      if (i === 6) { voffset = 1; hoffset = 1; } // skip the timing column/row
      modules[i + voffset][8] = vbit;
      modules[8][i + hoffset] = hbit;
      modules[8][size - 1 - i] = vbit;
      modules[size - 1 - i][8] = hbit;
    }
    modules[size - 8][8] = 1; // dark module
  }

  function penalty(modules, size) {
    let score = 0;

    // Rule 1: runs of five or more same-colour modules in a row or column.
    for (let i = 0; i < size; i++) {
      for (const horizontal of [true, false]) {
        let run = 1;
        for (let j = 1; j < size; j++) {
          const cur = horizontal ? modules[i][j] : modules[j][i];
          const prev = horizontal ? modules[i][j - 1] : modules[j - 1][i];
          if (cur === prev) run++;
          else { if (run >= 5) score += run - 2; run = 1; }
        }
        if (run >= 5) score += run - 2;
      }
    }

    // Rule 2: 2x2 blocks of one colour.
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
      }
    }

    // Rule 3: the 1:1:3:1:1 finder-lookalike pattern with four light modules.
    const a = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const b = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const matches = (get, start) => {
      let okA = true, okB = true;
      for (let k = 0; k < 11; k++) {
        const v = get(start + k);
        if (v !== a[k]) okA = false;
        if (v !== b[k]) okB = false;
      }
      return (okA ? 1 : 0) + (okB ? 1 : 0);
    };
    for (let i = 0; i < size; i++) {
      for (let j = 0; j + 11 <= size; j++) {
        score += 40 * matches(k => modules[i][k], j);
        score += 40 * matches(k => modules[k][i], j);
      }
    }

    // Rule 4: deviation from a 50/50 dark ratio.
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (modules[r][c]) dark++;
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  // Returns a size x size array of 0/1.
  function encode(text) {
    const bytes = utf8Bytes(text);
    let version = 0;
    for (let v = 1; v <= 10; v++) {
      const headerBytes = v < 10 ? 2 : 3; // mode + character count, rounded up
      if (bytes.length + headerBytes <= dataCapacity(v)) { version = v; break; }
    }
    if (!version) throw new Error('Text too long for a QR code (max ~200 characters)');

    const codewords = buildCodewords(bytes, version);

    let best = null;
    for (let maskId = 0; maskId < 8; maskId++) {
      const m = makeMatrix(version);
      placeData(m, codewords);
      for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
          if (!m.reserved[r][c] && maskFn(maskId, r, c)) m.modules[r][c] ^= 1;
        }
      }
      applyFormat(m, maskId);
      const score = penalty(m.modules, m.size);
      if (!best || score < best.score) best = { score, modules: m.modules, size: m.size };
    }
    return best.modules;
  }

  // Renders to an SVG string. Quiet zone is the spec-required 4 modules —
  // phone cameras fail to lock on without it.
  function toSvg(text, pixelSize) {
    const modules = encode(text);
    const n = modules.length;
    const quiet = 4;
    const total = n + quiet * 2;
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (modules[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
      }
    }
    const px = pixelSize || 160;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${text.replace(/[<>&"]/g, '')}">` +
      `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  window.QRCode = { encode, toSvg };
})();

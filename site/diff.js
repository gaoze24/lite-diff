// Text diff built on Myers' O(ND) algorithm (linear-space, middle-snake variant).
// Pure functions, no DOM: shared by the page and the Node tests.

/** Split text into lines, normalising CRLF/CR and remembering the final newline. */
export function splitLines(text) {
  const crlf = text.includes('\r');
  text = text.replace(/\r\n?/g, '\n');
  if (text === '') return { lines: [], noEOL: false, crlf };
  const noEOL = !text.endsWith('\n');
  return { lines: (noEOL ? text : text.slice(0, -1)).split('\n'), noEOL, crlf };
}

function lineKey({ ignoreWhitespace, ignoreCase }) {
  return (s) => {
    if (ignoreWhitespace) s = s.replace(/\s+/g, ' ').trim();
    if (ignoreCase) s = s.toLowerCase();
    return s;
  };
}

/** Map both sequences to small integers so comparisons are `===` on numbers. */
function intern(seqA, seqB, key) {
  const ids = new Map();
  const id = (s) => {
    const k = key(s);
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  return [Int32Array.from(seqA, id), Int32Array.from(seqB, id)];
}

/**
 * Diff two integer sequences. Returns flags marking deleted elements of `a`
 * and inserted elements of `b`; `exact` is false if the deadline cut it short.
 */
export function diffIds(a, b, deadline = Infinity) {
  const delA = new Uint8Array(a.length);
  const insB = new Uint8Array(b.length);
  // Elements that never occur on the other side can't be in any common
  // subsequence: mark them now and run Myers on what's left.
  const setA = new Set(a), setB = new Set(b);
  const keepA = [], keepB = [];
  for (let i = 0; i < a.length; i++) setB.has(a[i]) ? keepA.push(i) : (delA[i] = 1);
  for (let j = 0; j < b.length; j++) setA.has(b[j]) ? keepB.push(j) : (insB[j] = 1);
  const fa = Int32Array.from(keepA, (i) => a[i]);
  const fb = Int32Array.from(keepB, (j) => b[j]);
  const fdel = new Uint8Array(fa.length), fins = new Uint8Array(fb.length);
  const exact = compareSeq(fa, fb, fdel, fins, deadline);
  for (let i = 0; i < fa.length; i++) if (fdel[i]) delA[keepA[i]] = 1;
  for (let j = 0; j < fb.length; j++) if (fins[j]) insB[keepB[j]] = 1;
  return { delA, insB, exact };
}

function compareSeq(a, b, delA, insB, deadline) {
  const max = a.length + b.length;
  const off = max + 1;
  const vf = new Int32Array(2 * max + 3);
  const vb = new Int32Array(2 * max + 3);
  let exact = true;
  const stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    let [aLo, aHi, bLo, bHi] = stack.pop();
    while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) { aLo++; bLo++; }
    while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) { aHi--; bHi--; }
    if (aLo === aHi) { insB.fill(1, bLo, bHi); continue; }
    if (bLo === bHi) { delA.fill(1, aLo, aHi); continue; }
    const snake = middleSnake(a, aLo, aHi, b, bLo, bHi, vf, vb, off, deadline);
    const [x, y, u, v] = snake ?? [];
    // Out of time (or no progress, which shouldn't happen): call the rest a full replace.
    if (!snake || (x - aLo + y - bLo === 0 && aHi - u + bHi - v === 0) ||
        (x === aHi && y === bHi) || (u === aLo && v === bLo)) {
      exact = false;
      delA.fill(1, aLo, aHi);
      insB.fill(1, bLo, bHi);
      continue;
    }
    stack.push([u, aHi, v, bHi], [aLo, x, bLo, y]);
  }
  return exact;
}

// Find a snake [x,y]→[u,v] in the middle of an optimal edit path for
// a[aLo:aHi] vs b[bLo:bHi]. Forward and reverse searches meet in the middle.
function middleSnake(a, aLo, aHi, b, bLo, bHi, vf, vb, off, deadline) {
  const n = aHi - aLo, m = bHi - bLo;
  const delta = n - m, odd = (delta & 1) !== 0;
  const dMax = Math.ceil((n + m) / 2);
  vf[off + 1] = 0;
  vb[off + 1] = 0;
  for (let d = 0; d <= dMax; d++) {
    if ((d & 31) === 31 && Date.now() > deadline) return null;
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
      let y = x - k;
      const x0 = x, y0 = y;
      while (x < n && y < m && a[aLo + x] === b[bLo + y]) { x++; y++; }
      vf[off + k] = x;
      const c = delta - k;
      if (odd && c >= 1 - d && c <= d - 1 && x <= n && y <= m) {
        const rx = vb[off + c];
        if (rx <= n && rx - c <= m && x + rx >= n) return [aLo + x0, bLo + y0, aLo + x, bLo + y];
      }
    }
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
      let y = x - k;
      const x0 = x, y0 = y;
      while (x < n && y < m && a[aHi - 1 - x] === b[bHi - 1 - y]) { x++; y++; }
      vb[off + k] = x;
      const c = delta - k;
      if (!odd && c >= -d && c <= d && x <= n && y <= m) {
        const fx = vf[off + c];
        if (fx <= n && fx - c <= m && x + fx >= n) return [aHi - x, bHi - y, aHi - x0, bHi - y0];
      }
    }
  }
  return null;
}

/** Group flags into runs: {type:'eq', a, b, len} | {type:'chg', a, aLen, b, bLen}. */
function toBlocks(delA, insB) {
  const blocks = [];
  const n = delA.length, m = insB.length;
  let i = 0, j = 0;
  while (i < n || j < m) {
    const a0 = i, b0 = j;
    if (i < n && j < m && !delA[i] && !insB[j]) {
      while (i < n && j < m && !delA[i] && !insB[j]) { i++; j++; }
      blocks.push({ type: 'eq', a: a0, b: b0, len: i - a0 });
    } else {
      while ((i < n && delA[i]) || (j < m && insB[j])) {
        while (i < n && delA[i]) i++;
        while (j < m && insB[j]) j++;
      }
      blocks.push({ type: 'chg', a: a0, aLen: i - a0, b: b0, bLen: j - b0 });
    }
  }
  return blocks;
}

/** Line diff of two texts. */
export function diffTexts(aText, bText, opts = {}) {
  const A = splitLines(aText), B = splitLines(bText);
  const [ia, ib] = intern(A.lines, B.lines, lineKey(opts));
  // A missing final newline is a real difference (as in git), unless ignoring whitespace.
  if (!opts.ignoreWhitespace && A.noEOL !== B.noEOL) {
    if (A.noEOL && ia.length) ia[ia.length - 1] = -1;
    if (B.noEOL && ib.length) ib[ib.length - 1] = -2;
  }
  const { delA, insB, exact } = diffIds(ia, ib, Date.now() + (opts.timeoutMs ?? 2000));
  const blocks = toBlocks(delA, insB);
  let added = 0, removed = 0, changes = 0;
  for (const bl of blocks) {
    if (bl.type !== 'chg') continue;
    bl.index = changes++;
    added += bl.bLen;
    removed += bl.aLen;
  }
  return {
    a: A.lines, b: B.lines,
    aNoEOL: A.noEOL, bNoEOL: B.noEOL,
    crlfMismatch: A.crlf !== B.crlf && A.lines.length > 0 && B.lines.length > 0,
    blocks, exact, added, removed, changes,
  };
}

// Words are runs of letters/digits; CJK characters stand alone since they aren't space-separated.
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const WORD_RE = new RegExp(`\\s+|(?:(?![${CJK}])[\\p{L}\\p{N}\\p{M}_])+|.`, 'gsu');
const CHAR_RE = /./gsu;
const WS_RE = /^\s+$/;

export function tokenize(s, mode = 'word') {
  return s.match(mode === 'char' ? CHAR_RE : WORD_RE) ?? [];
}

/**
 * Intra-line diff of a changed line pair. Returns segments `[text, changed][]`
 * for each side, or null when the lines are too different to be worth marking.
 */
export function inlineDiff(aLine, bLine, opts = {}) {
  const ta = tokenize(aLine, opts.mode), tb = tokenize(bLine, opts.mode);
  const key = (s) => (opts.ignoreWhitespace && WS_RE.test(s) ? ' ' : opts.ignoreCase ? s.toLowerCase() : s);
  const [ia, ib] = intern(ta, tb, key);
  const { delA, insB, exact } = diffIds(ia, ib, Date.now() + (opts.timeoutMs ?? 50));
  if (!exact) return null;
  let same = 0;
  for (let i = 0; i < ta.length; i++) if (!delA[i] && !WS_RE.test(ta[i])) same += ta[i].length;
  const longest = Math.max(aLine.replace(/\s+/g, '').length, bLine.replace(/\s+/g, '').length);
  if (same < 0.4 * longest) return null;
  return { a: segments(ta, delA, opts), b: segments(tb, insB, opts) };
}

function segments(tokens, flags, opts) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    let changed = !!flags[i];
    if (WS_RE.test(tokens[i])) {
      // Whitespace between two changes reads better as part of one change.
      changed = opts.ignoreWhitespace ? false : changed || (!!flags[i - 1] && !!flags[i + 1]);
    }
    const last = out[out.length - 1];
    if (last && last[1] === changed) last[0] += tokens[i];
    else out.push([tokens[i], changed]);
  }
  return out;
}

/** Render a diffTexts() result as a unified diff (`diff -u` / `git diff` style). */
export function unifiedPatch(r, { context = 3, aName = 'a', bName = 'b' } = {}) {
  // [sign, a-lines before/at this op, b-lines before/at this op]
  const ops = [];
  for (const bl of r.blocks) {
    if (bl.type === 'eq') {
      for (let k = 0; k < bl.len; k++) ops.push([' ', bl.a + k, bl.b + k]);
    } else {
      for (let k = 0; k < bl.aLen; k++) ops.push(['-', bl.a + k, bl.b]);
      for (let k = 0; k < bl.bLen; k++) ops.push(['+', bl.a + bl.aLen, bl.b + k]);
    }
  }
  const out = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i][0] === ' ') { i++; continue; }
    const start = Math.max(0, i - context);
    let end = i;
    for (;;) {
      while (end < ops.length && ops[end][0] !== ' ') end++;
      let next = end;
      while (next < ops.length && ops[next][0] === ' ') next++;
      if (next < ops.length && next - end <= 2 * context) { end = next; continue; }
      end = Math.min(ops.length, end + context);
      break;
    }
    const hunk = ops.slice(start, end);
    const aCount = hunk.filter((o) => o[0] !== '+').length;
    const bCount = hunk.filter((o) => o[0] !== '-').length;
    out.push(`@@ -${hunk[0][1] + (aCount ? 1 : 0)},${aCount} +${hunk[0][2] + (bCount ? 1 : 0)},${bCount} @@`);
    for (const [sign, ai, bj] of hunk) {
      out.push(sign + (sign === '+' ? r.b[bj] : r.a[ai]));
      const lastA = sign !== '+' && r.aNoEOL && ai === r.a.length - 1;
      const lastB = sign === '+' && r.bNoEOL && bj === r.b.length - 1;
      if (lastA || lastB) out.push('\\ No newline at end of file');
    }
    i = end;
  }
  if (!out.length) return '';
  return [`--- ${aName}`, `+++ ${bName}`, ...out].join('\n') + '\n';
}

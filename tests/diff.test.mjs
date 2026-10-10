import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffIds, diffTexts, inlineDiff, splitLines, tokenize, unifiedPatch } from '../site/diff.js';

function lcsLength(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

test('diffIds yields a valid, minimal edit script', () => {
  const rand = rng(42);
  for (let iter = 0; iter < 3000; iter++) {
    const alpha = 1 + Math.floor(rand() * 6);
    const gen = (len) => Int32Array.from({ length: len }, () => Math.floor(rand() * alpha));
    const a = gen(Math.floor(rand() * 25)), b = gen(Math.floor(rand() * 25));
    const { delA, insB, exact } = diffIds(a, b);
    assert.ok(exact);
    const keptA = [...a].filter((_, i) => !delA[i]);
    const keptB = [...b].filter((_, j) => !insB[j]);
    assert.deepEqual(keptA, keptB, `kept elements differ for ${a} / ${b}`);
    assert.equal(keptA.length, lcsLength(a, b), `not minimal for ${a} / ${b}`);
  }
});

test('diffIds gives up gracefully past the deadline', () => {
  const a = Int32Array.from({ length: 4000 }, (_, i) => i % 7);
  const b = Int32Array.from({ length: 4000 }, (_, i) => (i * 3) % 7);
  const { delA, insB, exact } = diffIds(a, b, Date.now() - 1);
  assert.equal(exact, false);
  assert.deepEqual([...a].filter((_, i) => !delA[i]), [...b].filter((_, j) => !insB[j]));
});

test('splitLines', () => {
  assert.deepEqual(splitLines(''), { lines: [], noEOL: false, crlf: false });
  assert.deepEqual(splitLines('a\r\nb\r\n'), { lines: ['a', 'b'], noEOL: false, crlf: true });
  assert.deepEqual(splitLines('a\nb'), { lines: ['a', 'b'], noEOL: true, crlf: false });
  assert.deepEqual(splitLines('\n'), { lines: [''], noEOL: false, crlf: false });
});

test('diffTexts options', () => {
  assert.equal(diffTexts('a\n  b  \n', 'a\nb\n').changes, 1);
  assert.equal(diffTexts('a\n  b  \n', 'a\nb\n', { ignoreWhitespace: true }).changes, 0);
  assert.equal(diffTexts('Hello\n', 'hello\n', { ignoreCase: true }).changes, 0);
  assert.equal(diffTexts('a\nb', 'a\nb\n').changes, 1, 'missing final newline counts');
  assert.equal(diffTexts('a\r\nb\r\n', 'a\nb\n').crlfMismatch, true);
});

// Minimal unified-diff applier, to check that our patches round-trip.
function applyPatch(aText, patch) {
  const { lines: a } = splitLines(aText);
  const p = patch.split('\n');
  const out = [];
  let ai = 0, noEOL = false;
  for (let k = 2; k < p.length; k++) {
    const line = p[k];
    const h = /^@@ -(\d+),(\d+) \+\d+,\d+ @@$/.exec(line);
    if (h) {
      const start = +h[2] === 0 ? +h[1] : +h[1] - 1;
      while (ai < start) out.push(a[ai++]);
    } else if (line.startsWith(' ')) { assert.equal(a[ai], line.slice(1)); out.push(a[ai++]); noEOL = false; }
    else if (line.startsWith('-')) { assert.equal(a[ai], line.slice(1)); ai++; }
    else if (line.startsWith('+')) { out.push(line.slice(1)); noEOL = false; }
    else if (line.startsWith('\\')) { if (!p[k - 1].startsWith('-')) noEOL = true; }
  }
  while (ai < a.length) out.push(a[ai++]);
  return out.length ? out.join('\n') + (noEOL ? '' : '\n') : '';
}

test('unifiedPatch round-trips', () => {
  const rand = rng(7);
  const words = ['alpha', 'beta', 'gamma', 'delta', '', 'eps'];
  for (let iter = 0; iter < 500; iter++) {
    const gen = () => Array.from({ length: Math.floor(rand() * 30) }, () => words[Math.floor(rand() * words.length)]).join('\n') + '\n';
    const a = gen(), b = gen();
    const patch = unifiedPatch(diffTexts(a, b), { context: Math.floor(rand() * 4) });
    if (a === b) { assert.equal(patch, ''); continue; }
    assert.equal(applyPatch(a, patch), b);
  }
});

test('unifiedPatch header and no-newline marker', () => {
  const patch = unifiedPatch(diffTexts('one\ntwo\nthree', 'one\ntwo\nthree\nfour\n'), { aName: 'a/x', bName: 'b/x' });
  assert.equal(patch, [
    '--- a/x', '+++ b/x', '@@ -1,3 +1,4 @@', ' one', ' two',
    '-three', '\\ No newline at end of file', '+three', '+four', '',
  ].join('\n'));
  assert.equal(unifiedPatch(diffTexts('', 'x\n')), '--- a\n+++ b\n@@ -0,0 +1,1 @@\n+x\n');
});

test('tokenize splits CJK per character and keeps words whole', () => {
  assert.deepEqual(tokenize('let foo_1 = 你好world;'), ['let', ' ', 'foo_1', ' ', '=', ' ', '你', '好', 'world', ';']);
});

test('inlineDiff marks the changed word only', () => {
  const r = inlineDiff('const total = price * qty;', 'const total = price * quantity;');
  assert.deepEqual(r.a, [['const total = price * ', false], ['qty', true], [';', false]]);
  assert.deepEqual(r.b, [['const total = price * ', false], ['quantity', true], [';', false]]);
  assert.equal(inlineDiff('completely different', 'nothing alike here'), null);
});

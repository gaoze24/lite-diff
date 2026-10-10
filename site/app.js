import { diffTexts, inlineDiff, unifiedPatch } from './diff.js';
import { LANGS, applyStatic, getLang, setLang, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const text = { a: $('text-a'), b: $('text-b') };
const name = { a: $('name-a'), b: $('name-b') };
const output = $('output');
const toolbar = $('toolbar');

const CONTEXT = 3;
const AUTO_LIMIT = 1_000_000; // chars; above this, compare only on demand
const INLINE_MAX = 4000; // chars per line for intra-line highlighting

// ---------- storage (best effort: private mode etc. may throw) ----------
const store = {
  get(area, key) { try { return JSON.parse(window[area].getItem(key)); } catch { return null; } },
  set(area, key, value) { try { window[area].setItem(key, JSON.stringify(value)); } catch {} },
};

const prefs = {
  view: matchMedia('(max-width: 760px)').matches ? 'unified' : 'split',
  inline: 'word',
  ignoreWhitespace: false,
  ignoreCase: false,
  collapse: true,
  ...store.get('localStorage', 'litediff:prefs'),
};

const state = { result: null, expanded: new Set(), inline: new Map(), stale: false };

// ---------- diffing ----------
function compare() {
  state.result = diffTexts(text.a.value, text.b.value, {
    ignoreWhitespace: prefs.ignoreWhitespace,
    ignoreCase: prefs.ignoreCase,
  });
  state.expanded.clear();
  state.inline.clear();
  state.stale = false;
  render();
}

let timer;
function scheduleCompare() {
  clearTimeout(timer);
  saveSession();
  const size = text.a.value.length + text.b.value.length;
  if (size > AUTO_LIMIT) {
    state.stale = true;
    renderStats();
    return;
  }
  timer = setTimeout(compare, size > 200_000 ? 600 : 200);
}

function inlineFor(bl) {
  if (prefs.inline === 'off') return [];
  let segs = state.inline.get(bl.index);
  if (segs) return segs;
  const r = state.result;
  segs = [];
  for (let k = 0; k < Math.min(bl.aLen, bl.bLen); k++) {
    const a = r.a[bl.a + k], b = r.b[bl.b + k];
    segs.push(a.length + b.length > INLINE_MAX ? null : inlineDiff(a, b, {
      mode: prefs.inline, ignoreWhitespace: prefs.ignoreWhitespace, ignoreCase: prefs.ignoreCase,
    }));
  }
  state.inline.set(bl.index, segs);
  return segs;
}

// ---------- rendering ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);
const code = (s, segs) => (segs ? segs.map(([str, hl]) => (hl ? `<span class="hl">${esc(str)}</span>` : esc(str))).join('') : esc(s));

function labels() {
  return { a: name.a.value.trim() || t('nameA'), b: name.b.value.trim() || t('nameB') };
}

/** Turn blocks into visible parts, folding long unchanged runs. */
function parts(r) {
  const out = [];
  r.blocks.forEach((bl, bi) => {
    if (bl.type === 'chg') return out.push({ k: 'chg', bl });
    const head = bi === 0 ? 0 : CONTEXT;
    const tail = bi === r.blocks.length - 1 ? 0 : CONTEXT;
    if (!prefs.collapse || state.expanded.has(bi) || bl.len <= head + tail + 1) {
      return out.push({ k: 'eq', a: bl.a, b: bl.b, len: bl.len });
    }
    if (head) out.push({ k: 'eq', a: bl.a, b: bl.b, len: head });
    out.push({ k: 'fold', bi, len: bl.len - head - tail });
    if (tail) out.push({ k: 'eq', a: bl.a + bl.len - tail, b: bl.b + bl.len - tail, len: tail });
  });
  return out;
}

const foldRow = (p, cols) =>
  `<tr class="fold"><td colspan="${cols}"><button type="button" data-fold="${p.bi}">${esc(t('fold', p.len))}</button></td></tr>`;

function renderSplit(r) {
  const h = [];
  for (const p of parts(r)) {
    if (p.k === 'fold') { h.push(foldRow(p, 4)); continue; }
    if (p.k === 'eq') {
      for (let k = 0; k < p.len; k++) {
        const i = p.a + k, j = p.b + k;
        h.push(`<tr><td class="ln">${i + 1}</td><td class="code">${esc(r.a[i])}</td><td class="ln">${j + 1}</td><td class="code">${esc(r.b[j])}</td></tr>`);
      }
      continue;
    }
    const { bl } = p, segs = inlineFor(bl);
    for (let k = 0; k < Math.max(bl.aLen, bl.bLen); k++) {
      const i = bl.a + k, j = bl.b + k, s = segs[k];
      const left = k < bl.aLen
        ? `<td class="ln del">${i + 1}</td><td class="code del">${code(r.a[i], s?.a)}</td>`
        : '<td class="ln empty"></td><td class="code empty"></td>';
      const right = k < bl.bLen
        ? `<td class="ln ins">${j + 1}</td><td class="code ins">${code(r.b[j], s?.b)}</td>`
        : '<td class="ln empty"></td><td class="code empty"></td>';
      h.push(`<tr${k === 0 ? ` data-chg="${bl.index}"` : ''}>${left}${right}</tr>`);
    }
  }
  const l = labels();
  return `<div class="diff-head split"><div>${esc(l.a)}</div><div>${esc(l.b)}</div></div>
    <table class="diff split"><colgroup><col class="ln"><col><col class="ln"><col></colgroup><tbody>${h.join('')}</tbody></table>`;
}

function renderUnified(r) {
  const h = [];
  for (const p of parts(r)) {
    if (p.k === 'fold') { h.push(foldRow(p, 3)); continue; }
    if (p.k === 'eq') {
      for (let k = 0; k < p.len; k++) {
        const i = p.a + k, j = p.b + k;
        h.push(`<tr><td class="ln">${i + 1}</td><td class="ln">${j + 1}</td><td class="code">${esc(r.a[i])}</td></tr>`);
      }
      continue;
    }
    const { bl } = p, segs = inlineFor(bl);
    for (let k = 0; k < bl.aLen; k++) {
      const i = bl.a + k;
      h.push(`<tr${k === 0 ? ` data-chg="${bl.index}"` : ''}><td class="ln del">${i + 1}</td><td class="ln del"></td><td class="code del">${code(r.a[i], segs[k]?.a)}</td></tr>`);
    }
    for (let k = 0; k < bl.bLen; k++) {
      const j = bl.b + k;
      h.push(`<tr${k === 0 && !bl.aLen ? ` data-chg="${bl.index}"` : ''}><td class="ln ins"></td><td class="ln ins">${j + 1}</td><td class="code ins">${code(r.b[j], segs[k]?.b)}</td></tr>`);
    }
  }
  const l = labels();
  return `<div class="diff-head"><div>${esc(l.a)} → ${esc(l.b)}</div></div>
    <table class="diff unified"><colgroup><col class="ln"><col class="ln"><col></colgroup><tbody>${h.join('')}</tbody></table>`;
}

function notes(r) {
  const n = [];
  if (!r.exact) n.push(t('noteTimeout'));
  if (r.crlfMismatch) n.push(t('noteCrlf'));
  if (r.aNoEOL !== r.bNoEOL && !prefs.ignoreWhitespace) n.push(t('noteNoEOL', r.aNoEOL));
  return n;
}

function renderStats() {
  const r = state.result;
  const el = $('stats');
  if (state.stale) { el.innerHTML = t('stale', '<b>⌘/Ctrl + Enter</b>'); return; }
  if (!r || !r.changes) { el.textContent = ''; return; }
  const note = notes(r).map((s) => `<span class="note"> · ${esc(s)}</span>`).join('');
  el.innerHTML = `<b class="ins">+${r.added}</b> <b class="del">−${r.removed}</b> · ${t('changes', r.changes)}${note}`;
}

function render() {
  const r = state.result;
  renderStats();
  for (const id of ['prev-btn', 'next-btn', 'copy-btn', 'download-btn']) $(id).disabled = !r?.changes;
  output.style.setProperty('--ln-w', `${String(Math.max(r.a.length, r.b.length)).length + 2}ch`);
  if (!r.a.length && !r.b.length) {
    output.innerHTML = `<div class="placeholder">${t('empty')}</div>`;
  } else if (!r.changes) {
    const extra = notes(r).join(t('noteSep'));
    output.innerHTML = `<div class="same">${t('same')}${extra ? `<small>${esc(extra)}</small>` : ''}</div>`;
  } else {
    output.innerHTML = `<div class="diff-wrap">${prefs.view === 'split' ? renderSplit(r) : renderUnified(r)}</div>`;
  }
}

output.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fold]');
  if (!btn) return;
  state.expanded.add(Number(btn.dataset.fold));
  render();
});

// ---------- navigation between changes ----------
function jump(dir) {
  const rows = [...output.querySelectorAll('tr[data-chg]')];
  if (!rows.length) return;
  const top = toolbar.getBoundingClientRect().bottom + 8;
  const target = dir > 0
    ? rows.find((tr) => tr.getBoundingClientRect().top > top + 2) ?? rows[0]
    : rows.findLast((tr) => tr.getBoundingClientRect().top < top - 2) ?? rows.at(-1);
  window.scrollBy({ top: target.getBoundingClientRect().top - top - 40, behavior: 'smooth' });
  for (let tr = target; tr?.querySelector('.del, .ins') && (tr === target || !tr.dataset.chg); tr = tr.nextElementSibling) {
    tr.classList.remove('flash');
    void tr.offsetWidth;
    tr.classList.add('flash');
  }
  toast(t('jumpPos', rows.indexOf(target) + 1, rows.length));
}
$('prev-btn').onclick = () => jump(-1);
$('next-btn').onclick = () => jump(1);

// ---------- patch / share ----------
function patchText() {
  const l = labels();
  return unifiedPatch(state.result, { aName: `a/${l.a}`, bName: `b/${l.b}` });
}

$('copy-btn').onclick = async () => {
  try {
    await navigator.clipboard.writeText(patchText());
    toast(t('copied'));
  } catch {
    toast(t('copyFailed'));
  }
};

$('download-btn').onclick = () => {
  const url = URL.createObjectURL(new Blob([patchText()], { type: 'text/x-diff' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${labels().b.replace(/[\\/:*?"<>|]/g, '_')}.patch` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function pack(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function unpack(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

$('share-btn').onclick = async () => {
  try {
    const data = await pack({ v: 1, a: text.a.value, b: text.b.value, na: name.a.value, nb: name.b.value });
    const url = `${location.origin}${location.pathname}#d=${data}`;
    await navigator.clipboard.writeText(url);
    const kb = (url.length / 1024).toFixed(1);
    toast(t(url.length > 100_000 ? 'shareLong' : 'shareCopied', kb));
  } catch {
    toast(t('shareFailed'));
  }
};

async function loadFromHash() {
  const m = /^#d=([\w-]+)$/.exec(location.hash);
  if (!m) return false;
  try {
    const d = await unpack(m[1]);
    text.a.value = d.a ?? '';
    text.b.value = d.b ?? '';
    name.a.value = d.na ?? '';
    name.b.value = d.nb ?? '';
    // Edits shouldn't be undone by a reload, so drop the hash once loaded.
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch {
    toast(t('badLink'));
    return false;
  }
}

// ---------- files ----------
async function readFile(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 8000));
  if (head.includes(0)) throw new Error('binary');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf); // common for Chinese Windows files
  }
}

async function loadFile(side, file) {
  if (!file) return;
  try {
    text[side].value = await readFile(file);
    name[side].value = file.name;
    compareNowOrLater();
  } catch (e) {
    toast(t(e.message === 'binary' ? 'binary' : 'unreadable', file.name));
  }
}

function compareNowOrLater() {
  saveSession();
  if (text.a.value.length + text.b.value.length > AUTO_LIMIT) {
    state.stale = true;
    renderStats();
  } else {
    compare();
  }
}

for (const side of ['a', 'b']) {
  $(`file-${side}`).onchange = (e) => { loadFile(side, e.target.files[0]); e.target.value = ''; };
  text[side].addEventListener('input', scheduleCompare);
  name[side].addEventListener('input', () => { saveSession(); if (state.result?.changes) render(); });
}

const dropHint = $('drop-hint');
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer?.types.includes('Files');
document.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; dropHint.classList.add('show'); } });
document.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; dropHint.classList.remove('show'); } });
document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropHint.classList.remove('show');
  const files = [...e.dataTransfer.files];
  if (files.length >= 2) {
    await loadFile('a', files[0]);
    await loadFile('b', files[1]);
  } else {
    // A single file goes to the pane it was dropped on; elsewhere, to the first empty side.
    const pane = e.target.closest?.('.pane')?.dataset.side;
    await loadFile(pane ?? (text.a.value && !text.b.value ? 'b' : 'a'), files[0]);
  }
});

// ---------- other controls ----------
document.querySelectorAll('[data-clear]').forEach((btn) => {
  btn.onclick = () => {
    const side = btn.dataset.clear;
    text[side].value = '';
    name[side].value = '';
    compare();
    saveSession();
    text[side].focus();
  };
});

$('swap-btn').onclick = () => {
  [text.a.value, text.b.value] = [text.b.value, text.a.value];
  [name.a.value, name.b.value] = [name.b.value, name.a.value];
  compareNowOrLater();
};

function syncControls() {
  document.querySelector(`input[name=view][value=${prefs.view}]`).checked = true;
  document.querySelector(`input[name=inline][value=${prefs.inline}]`).checked = true;
  $('opt-ws').checked = prefs.ignoreWhitespace;
  $('opt-case').checked = prefs.ignoreCase;
  $('opt-collapse').checked = prefs.collapse;
}

function setPref(key, value, recompute) {
  prefs[key] = value;
  store.set('localStorage', 'litediff:prefs', prefs);
  if (recompute) compareNowOrLater();
  else { state.inline.clear(); render(); }
}

document.querySelectorAll('input[name=view]').forEach((el) => (el.onchange = () => setPref('view', el.value)));
document.querySelectorAll('input[name=inline]').forEach((el) => (el.onchange = () => setPref('inline', el.value)));
$('opt-ws').onchange = (e) => setPref('ignoreWhitespace', e.target.checked, true);
$('opt-case').onchange = (e) => setPref('ignoreCase', e.target.checked, true);
$('opt-collapse').onchange = (e) => { state.expanded.clear(); setPref('collapse', e.target.checked); };

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); compare(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select')) return;
  if (e.key === 'j' || e.key === 'n') jump(1);
  else if (e.key === 'k' || e.key === 'p') jump(-1);
});

// Theme: auto → light → dark
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
const themeName = (th) => t({ auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' }[th]);
function applyTheme(th) {
  if (th === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = th;
  $('theme-btn').textContent = THEME_ICON[th];
  $('theme-btn').title = t('themeTitle', themeName(th));
  $('theme-btn').setAttribute('aria-label', $('theme-btn').title);
}
let theme = document.documentElement.dataset.theme ?? 'auto';
applyTheme(theme);
$('theme-btn').onclick = () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme(theme);
  try { theme === 'auto' ? localStorage.removeItem('litediff:theme') : localStorage.setItem('litediff:theme', theme); } catch {}
  toast(t('themeTitle', themeName(theme)));
};

const SAMPLE_A = `
function total(items) {
  let sum = 0;
  for (const item of items) {
    sum += item.price * item.qty;
  }
  return sum;
}

function format(n) {
  return "$" + n.toFixed(2);
}

export { total, format };
`;
const SAMPLE_B = `
function total(items, discount = 0) {
  let sum = 0;
  for (const item of items) {
    sum += item.price * item.quantity;
  }
  return sum * (1 - discount);
}

function format(n, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export { total, format };
`;
$('sample-btn').onclick = () => {
  text.a.value = t('sampleCommentA') + SAMPLE_A;
  text.b.value = t('sampleCommentB') + SAMPLE_B;
  name.a.value = t('sampleNameA');
  name.b.value = t('sampleNameB');
  compare();
  saveSession();
};

// ---------- session draft (survives reloads in this tab only) ----------
function saveSession() {
  const d = { a: text.a.value, b: text.b.value, na: name.a.value, nb: name.b.value };
  if (d.a.length + d.b.length < 2_000_000) store.set('sessionStorage', 'litediff:draft', d);
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- language ----------
$('lang-btn').onclick = () => {
  setLang(LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length]);
  applyTheme(theme);
  if (state.result) render();
};

// ---------- boot ----------
applyStatic();
document.documentElement.classList.remove('i18n-pending');
syncControls();
if (!(await loadFromHash())) {
  const d = store.get('sessionStorage', 'litediff:draft');
  if (d) {
    text.a.value = d.a ?? '';
    text.b.value = d.b ?? '';
    name.a.value = d.na ?? '';
    name.b.value = d.nb ?? '';
  }
}
compare();

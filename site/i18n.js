// UI strings. A value is either a string or a function of the call's arguments.
const STRINGS = {
  zh: {
    htmlLang: 'zh-CN',
    description: '轻量的在线文本对比工具，所有计算都在浏览器本地完成。',
    tagline: '文本对比，全部在本地完成',
    sample: '示例',
    langSwitch: 'EN',
    langSwitchTitle: 'Switch to English',
    themeTitle: (name) => `主题：${name}`,
    themeAuto: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    nameA: '原文本',
    nameB: '新文本',
    nameALabel: '左侧名称',
    nameBLabel: '右侧名称',
    open: '打开',
    clear: '清空',
    placeholderA: '粘贴原文本，或把文件拖到这里',
    placeholderB: '粘贴新文本，或把文件拖到这里',
    swap: '交换左右',
    view: '视图',
    split: '并排',
    unified: '合并',
    inline: '行内高亮',
    word: '按词',
    char: '按字符',
    off: '不高亮',
    ignoreWs: '忽略空白',
    ignoreCase: '忽略大小写',
    collapse: '折叠未改动',
    prev: '上一处 (k)',
    next: '下一处 (j)',
    copy: '复制 patch',
    download: '下载',
    share: '分享链接',
    footer: '数据只在你的浏览器里处理，不会上传。分享链接把内容压缩进 URL 的 # 部分，同样不经过服务器。',
    dropHint: '松开以载入文件（一次拖两个文件可分别放到左右两侧）',
    fold: (n) => `⋯ 展开 ${n} 行未改动的内容`,
    changes: (n) => `${n} 处改动`,
    stale: (key) => `内容较大，按 ${key} 对比`,
    empty: '在上方粘贴或拖入两段文本，差异会实时显示在这里',
    same: '两段文本完全相同',
    noteSep: '；',
    noteTimeout: '文本差异过大，计算超时，结果可能不是最精简的',
    noteCrlf: '两侧换行符不同（CRLF / LF），已忽略',
    noteNoEOL: (left) => `${left ? '左侧' : '右侧'}末尾缺少换行符`,
    jumpPos: (i, n) => `第 ${i} / ${n} 处`,
    copied: '已复制 unified diff',
    copyFailed: '复制失败，浏览器不允许访问剪贴板',
    shareCopied: (kb) => `链接已复制（${kb} KB），内容都在链接里`,
    shareLong: (kb) => `链接已复制（${kb} KB），较长，部分聊天软件可能截断`,
    shareFailed: '生成链接失败',
    badLink: '链接内容无法解析',
    binary: (f) => `${f} 看起来是二进制文件`,
    unreadable: (f) => `无法读取 ${f}`,
    sampleNameA: 'cart.js (旧)',
    sampleNameB: 'cart.js (新)',
    sampleCommentA: '// 计算购物车总价',
    sampleCommentB: '// 计算购物车总价（含折扣）',
  },
  en: {
    htmlLang: 'en',
    description: 'A lightweight text diff tool. Everything runs locally in your browser.',
    tagline: 'Text diff that never leaves your browser',
    sample: 'Example',
    langSwitch: '中文',
    langSwitchTitle: '切换到中文',
    themeTitle: (name) => `Theme: ${name}`,
    themeAuto: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    nameA: 'Original',
    nameB: 'Modified',
    nameALabel: 'Left name',
    nameBLabel: 'Right name',
    open: 'Open',
    clear: 'Clear',
    placeholderA: 'Paste the original text, or drop a file here',
    placeholderB: 'Paste the modified text, or drop a file here',
    swap: 'Swap sides',
    view: 'View',
    split: 'Split',
    unified: 'Unified',
    inline: 'Inline highlight',
    word: 'Words',
    char: 'Chars',
    off: 'Off',
    ignoreWs: 'Ignore whitespace',
    ignoreCase: 'Ignore case',
    collapse: 'Fold unchanged',
    prev: 'Previous change (k)',
    next: 'Next change (j)',
    copy: 'Copy patch',
    download: 'Download',
    share: 'Share link',
    footer: 'Your text is processed only in your browser and never uploaded. Share links pack the content into the URL fragment (#), which is not sent to any server either.',
    dropHint: 'Drop to load (drop two files at once to fill both sides)',
    fold: (n) => `⋯ Show ${n} unchanged ${n === 1 ? 'line' : 'lines'}`,
    changes: (n) => (n === 1 ? '1 change' : `${n} changes`),
    stale: (key) => `Large input — press ${key} to compare`,
    empty: 'Paste or drop two texts above; the diff shows up here as you type',
    same: 'The two texts are identical',
    noteSep: '; ',
    noteTimeout: 'Inputs differ too much; the diff timed out and may not be minimal',
    noteCrlf: 'Line endings differ (CRLF / LF) and were ignored',
    noteNoEOL: (left) => `${left ? 'Left' : 'Right'} side has no newline at end of file`,
    jumpPos: (i, n) => `Change ${i} of ${n}`,
    copied: 'Unified diff copied',
    copyFailed: 'Copy failed: clipboard access was blocked',
    shareCopied: (kb) => `Link copied (${kb} KB). The content lives in the link itself`,
    shareLong: (kb) => `Link copied (${kb} KB). It's long; some chat apps may truncate it`,
    shareFailed: "Couldn't create the link",
    badLink: "Couldn't read the content of this link",
    binary: (f) => `${f} looks like a binary file`,
    unreadable: (f) => `Couldn't read ${f}`,
    sampleNameA: 'cart.js (old)',
    sampleNameB: 'cart.js (new)',
    sampleCommentA: '// Cart total',
    sampleCommentB: '// Cart total (with discount)',
  },
};

export const LANGS = Object.keys(STRINGS);

// The inline script in <head> picks the language before first paint.
let lang = LANGS.includes(document.documentElement.dataset.lang) ? document.documentElement.dataset.lang : 'zh';

export const getLang = () => lang;

export function t(key, ...args) {
  const v = STRINGS[lang][key] ?? STRINGS.zh[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

/** Fill every element marked with data-i18n* attributes. */
export function applyStatic(root = document) {
  document.documentElement.lang = t('htmlLang');
  document.documentElement.dataset.lang = lang;
  document.querySelector('meta[name=description]')?.setAttribute('content', t('description'));
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

export function setLang(next) {
  lang = next;
  try { localStorage.setItem('litediff:lang', next); } catch {}
  // Keep an explicit ?lang= in the address bar in step with the choice.
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
  }
  applyStatic();
}

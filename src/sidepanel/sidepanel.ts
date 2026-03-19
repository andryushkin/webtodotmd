import { marked } from '../../vendor/marked.esm.js';
import DOMPurify from '../../vendor/purify.esm.mjs';
import katex from '../../vendor/katex.mjs';
import { isRestrictedUrl } from '../shared/restricted';
import { incrementCounter, getCounterToday } from '../shared/counter';
import { ensureContentScript } from '../shared/inject';
import { icon, setButtonContent } from '../shared/icons';
import { getSettings } from '../shared/settings-store';
import { initI18n, t, applyI18n } from '../shared/i18n';
import type { CaptureSelectionResponse, CaptureErrorResponse, PageMeta } from '../shared/messaging';

type CaptureResponse = CaptureSelectionResponse | CaptureErrorResponse;
type StatusType = 'default' | 'error' | 'success' | 'warning';

function isCaptureError(r: CaptureResponse): r is CaptureErrorResponse {
  return 'error' in r;
}

marked.setOptions({ breaks: true, gfm: true, html: true });

// ---- DOM refs ----

const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnHighlighter = document.getElementById('btn-highlighter') as HTMLButtonElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const previewRendered = document.getElementById('preview-rendered') as HTMLDivElement;
const previewSource = document.getElementById('preview-source') as HTMLTextAreaElement;
const btnPreviewTab = document.getElementById('btn-preview') as HTMLButtonElement;
const btnSourceTab = document.getElementById('btn-source') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const counterValue = document.getElementById('counter-value') as HTMLSpanElement;

// ---- State ----

let rawMd = '';
let lastMeta: PageMeta | null = null;
const mathMap = new Map<string, { latex: string; display: boolean }>();
let mathCounter = 0;
const MAX_HISTORY = 50;
let undoStack: string[] = [];
let redoStack: string[] = [];
let viewMode: 'preview' | 'source' = 'preview';
let highlighterEnabled = false;
let highlightCount = 0;
let autoMetadata = false;
let currentTabId: number | null = null;
let highlighterPort: chrome.runtime.Port | null = null;
let tabRestricted = false;

// ---- Status state ----

let baseStatusMsg = '';
let baseStatusType: 'default' | 'warning' = 'default';
let baseStatusIcon: string | undefined;
let revertTimer: ReturnType<typeof setTimeout> | null = null;

// ---- Utilities ----

function setStatus(msg: string, type: StatusType = 'default', iconName?: string) {
  const iconHtml = iconName ? icon(iconName, 12) : '';
  statusEl.innerHTML = iconHtml + (msg ? `<span>${escHtml(msg)}</span>` : '');
  statusEl.className = `status${type !== 'default' ? ` ${type}` : ''}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setBaseStatus(msg: string, type: 'default' | 'warning' = 'default', iconName?: string) {
  baseStatusMsg = msg;
  baseStatusType = type;
  baseStatusIcon = iconName;
  if (revertTimer === null) setStatus(msg, type, iconName);
}

function setTempStatus(msg: string, type: 'error' | 'success', iconName?: string, ms = 3000) {
  if (revertTimer) clearTimeout(revertTimer);
  setStatus(msg, type, iconName);
  revertTimer = setTimeout(() => {
    revertTimer = null;
    setStatus(baseStatusMsg, baseStatusType, baseStatusIcon);
  }, ms);
}

function getTabReadiness(tab: chrome.tabs.Tab): { type: 'default' | 'warning'; icon: string; message: string } {
  const url = tab.url ?? '';
  if (!url || url === 'about:blank' || url.startsWith('chrome://newtab')) {
    return { type: 'warning', icon: 'alertTriangle', message: t('statusEmpty') };
  }
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('devtools://') || url.startsWith('about:')) {
    return { type: 'warning', icon: 'alertTriangle', message: t('statusRestricted') };
  }
  if (url.startsWith('file://')) {
    return { type: 'warning', icon: 'alertTriangle', message: t('statusLocalFile') };
  }
  if (/\.pdf(\?|#|$)/i.test(url)) {
    return { type: 'warning', icon: 'alertTriangle', message: t('statusPdf') };
  }
  return { type: 'default', icon: 'crosshair', message: t('statusReady') };
}

async function updateReadinessStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const r = getTabReadiness(tab);
  tabRestricted = r.type === 'warning';
  btnCapture.disabled = tabRestricted;
  setBaseStatus(r.message, r.type, r.icon);
}

function shortUrl(url: string, maxLen = 55): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname.replace(/\/$/, '');
    return display.length > maxLen ? display.slice(0, maxLen - 1) + '…' : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 1) + '…' : url;
  }
}

function preprocessMath(text: string): string {
  mathMap.clear();
  mathCounter = 0;

  // Invisible Unicode math operators from MathML (U+2061–U+2064) — strip before KaTeX
  const INVISIBLE_MATH_CHARS = /[\u2061-\u2064]/g;

  // Block math: $$...$$ → placeholder div
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
    const id = String(mathCounter++);
    mathMap.set(id, { latex: latex.trim().replace(INVISIBLE_MATH_CHARS, ''), display: true });
    return `\n\n<div data-katex="${id}" data-display="1"></div>\n\n`;
  });

  // Inline math: $...$ → placeholder span
  text = text.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, latex) => {
    const id = String(mathCounter++);
    mathMap.set(id, { latex: latex.trim().replace(INVISIBLE_MATH_CHARS, ''), display: false });
    return `<span data-katex="${id}" data-display="0"></span>`;
  });

  return text;
}

function renderMathInDOM(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('[data-katex]').forEach(el => {
    const id = el.getAttribute('data-katex')!;
    const entry = mathMap.get(id);
    if (!entry) return;
    try {
      el.innerHTML = katex.renderToString(entry.latex, {
        displayMode: entry.display,
        throwOnError: false,
        output: 'html',
      });
      el.removeAttribute('data-katex');
    } catch {
      el.textContent = entry.display ? `$$${entry.latex}$$` : `$${entry.latex}$`;
    }
  });
}

const METADATA_RE = /---\ntitle: "([^"]*)"\nsource: ([^\n]+)\ndate: ([^\n]+)\n---/g;

function buildMetadata(meta: PageMeta): string {
  const escapedTitle = meta.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const dateStr = meta.date.slice(0, 10);
  return `---\ntitle: "${escapedTitle}"\nsource: ${meta.url}\ndate: ${dateStr}\n---`;
}

const ALLOWED_HTML_TAGS = new Set(['sub', 'sup', 'br']);

function escapeHtmlTagsInMarkdown(md: string): string {
  const parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code block — не трогать
      return part.replace(/<(\/?)(([a-zA-Z][a-zA-Z0-9]*))([^>]*)>/g, (_match, slash, tagName, _tn, attrs) => {
        if (ALLOWED_HTML_TAGS.has(tagName.toLowerCase())) return _match;
        return `&lt;${slash}${tagName}${attrs}&gt;`;
      });
    })
    .join('');
}

function renderMarkdown(md: string) {
  const processed = preprocessMath(escapeHtmlTagsInMarkdown(md))
    .replace(METADATA_RE, (_, title, source, date) => {
      const safeTitle = title.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return `\n\n<div class="metadata-block"><div class="metadata-field"><span class="metadata-icon">${icon('fileText', 12)}</span><span class="metadata-value">${escHtml(safeTitle)}</span></div><div class="metadata-field"><span class="metadata-icon">${icon('link', 12)}</span><a href="${escHtml(source)}" class="metadata-link" title="${escHtml(source)}">${escHtml(shortUrl(source))}</a></div><div class="metadata-field"><span class="metadata-icon">${icon('calendar', 12)}</span><span class="metadata-value">${escHtml(date)}</span></div></div>\n\n`;
    })
    .replace(/\n{3,}/g, '\n\n<div class="content-gap"></div>\n\n');
  const dirty = marked.parse(processed) as string;
  previewRendered.innerHTML = DOMPurify.sanitize(dirty);
  renderMathInDOM(previewRendered);
}

function applyContent(md: string) {
  rawMd = md;
  renderMarkdown(md);
  previewSource.value = md;
  updateButtonStates();
  updateUndoRedoButtons();
}

function setContent(md: string) {
  if (rawMd !== md) {
    undoStack.push(rawMd);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
  }
  applyContent(md);
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(rawMd);
  applyContent(undoStack.pop()!);
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(rawMd);
  applyContent(redoStack.pop()!);
}

function setViewMode(mode: 'preview' | 'source') {
  viewMode = mode;
  previewRendered.hidden = mode !== 'preview';
  previewSource.hidden = mode !== 'source';
  btnPreviewTab.classList.toggle('active', mode === 'preview');
  btnSourceTab.classList.toggle('active', mode === 'source');
  btnPreviewTab.setAttribute('aria-pressed', String(mode === 'preview'));
  btnSourceTab.setAttribute('aria-pressed', String(mode === 'source'));
}

function updateUndoRedoButtons() {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

function updateButtonStates() {
  const hasContent = rawMd.trim().length > 0;
  btnCopy.disabled = !hasContent;
  btnDownload.disabled = !hasContent;
  btnClear.disabled = !hasContent;
}

async function updateCounter() {
  const count = await getCounterToday();
  counterValue.textContent = String(count);
}

function sendMessageWithTimeout(
  tabId: number,
  message: unknown,
  timeoutMs: number,
): Promise<CaptureResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    chrome.tabs.sendMessage(tabId, message, (response: CaptureResponse) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ---- Highlighter logic ----

async function updateHighlighterUI() {
  btnHighlighter.classList.toggle('btn-highlighter-active', highlighterEnabled);
  setButtonContent(btnHighlighter, 'highlighter',
    t(highlighterEnabled ? 'highlighterOn' : 'highlighterOff'));

  if (highlighterEnabled && highlightCount > 0) {
    setBaseStatus(t('highlights', highlightCount), 'default', 'highlighter');
  } else if (highlighterEnabled) {
    setBaseStatus(t('statusHighlighterReady'), 'default', 'highlighter');
  } else {
    await updateReadinessStatus();
  }

  // Update capture button label
  if (highlighterEnabled && highlightCount > 0) {
    setButtonContent(btnCapture, 'crosshair', t('captureHighlights', highlightCount), 16);
  } else {
    setButtonContent(btnCapture, 'crosshair', t('captureSelection'), 16);
  }
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || isRestrictedUrl(tab.url)) return null;
  currentTabId = tab.id;
  return tab.id;
}

async function toggleHighlighter() {
  const tabId = await getActiveTabId();
  if (!tabId) {
    setTempStatus(t('errCannotAccess'), 'error', 'x');
    return;
  }

  const injected = await ensureContentScript(tabId);
  if (!injected) {
    setTempStatus(t('errCannotInject'), 'error', 'x');
    return;
  }

  highlighterEnabled = !highlighterEnabled;
  const settings = await getSettings();

  if (highlighterEnabled) {
    highlighterPort = chrome.tabs.connect(tabId, { name: 'highlighter' });
    highlighterPort.onDisconnect.addListener(() => {
      highlighterPort = null;
    });
  } else {
    highlighterPort?.disconnect();
    highlighterPort = null;
  }

  chrome.tabs.sendMessage(tabId, {
    type: 'TOGGLE_HIGHLIGHTER',
    active: highlighterEnabled,
    color: settings.highlighterColor,
  }, (response) => {
    if (chrome.runtime.lastError) {
      highlighterEnabled = false;
    } else if (response) {
      highlighterEnabled = response.active;
      highlightCount = response.count;
    }
    updateHighlighterUI();
  });
}

async function clearHighlights() {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, { type: 'CLEAR_HIGHLIGHTS' }, () => {
    highlightCount = 0;
    updateHighlighterUI();
  });
}

// ---- Capture logic ----

async function captureSelection(silent = false) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url) {
    if (!silent) setTempStatus(t('errCannotAccess'), 'error', 'x');
    return;
  }

  if (isRestrictedUrl(tab.url)) {
    if (!silent) setTempStatus(t('errRestrictedUrl'), 'error', 'x');
    return;
  }

  const injected = await ensureContentScript(tab.id);
  if (!injected) {
    if (!silent) setTempStatus(t('errCannotInject'), 'error', 'x');
    return;
  }

  // If highlighter has captures, use those instead
  const messageType = (highlighterEnabled && highlightCount > 0)
    ? 'CAPTURE_HIGHLIGHTS'
    : 'CAPTURE_SELECTION';

  let response: CaptureResponse;
  try {
    response = await sendMessageWithTimeout(tab.id, { type: messageType }, 3000);
  } catch (err) {
    if (silent) return;
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'TIMEOUT') {
      setTempStatus(t('errTimeout'), 'error', 'x');
    } else {
      setTempStatus(t('errConnect'), 'error', 'x');
    }
    return;
  }

  if (isCaptureError(response)) {
    if (response.error === 'NO_SELECTION') {
      if (!silent) {
        const hint = messageType === 'CAPTURE_HIGHLIGHTS'
          ? t('errNoHighlights')
          : t('errNoSelection');
        setTempStatus(hint, 'error', 'x');
      }
    } else {
      if (!silent) setTempStatus(t('errConvertFailed'), 'error', 'x');
    }
    return;
  }

  const { meta, md } = response;
  const prevUrl = lastMeta?.url ?? null;
  lastMeta = meta;

  if (rawMd.trim().length === 0) {
    const content = autoMetadata ? buildMetadata(meta) + '\n\n' + md : md;
    setContent(content);
  } else if (prevUrl === meta.url) {
    setContent(rawMd + '\n\n' + md);
  } else {
    if (autoMetadata) {
      setContent(rawMd + '\n\n' + buildMetadata(meta) + '\n\n' + md);
    } else {
      setContent(rawMd + '\n\n---\n\n' + md);
    }
  }
  setTempStatus(t('successCaptured'), 'success', 'check', 2000);
  if (messageType === 'CAPTURE_HIGHLIGHTS') {
    clearHighlights();
  }
}

// ---- Textarea editor ----

let sourceValueOnFocus = '';

previewSource.addEventListener('focus', () => {
  sourceValueOnFocus = rawMd;
});

previewSource.addEventListener('input', () => {
  rawMd = previewSource.value;
  renderMarkdown(rawMd);
  updateButtonStates();
  updateUndoRedoButtons();
});

previewSource.addEventListener('blur', () => {
  if (rawMd !== sourceValueOnFocus) {
    undoStack.push(sourceValueOnFocus);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }
});

// ---- Event handlers ----

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);

btnPreviewTab.addEventListener('click', () => setViewMode('preview'));
btnSourceTab.addEventListener('click', () => setViewMode('source'));

btnCapture.addEventListener('click', () => captureSelection(false));
btnHighlighter.addEventListener('click', () => toggleHighlighter());

btnSettings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Listen for highlight count updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'HIGHLIGHT_COUNT') {
    highlightCount = msg.count;
    updateHighlighterUI();
  }
});

// Auto-capture when icon is clicked (signal from service worker)
chrome.storage.session.onChanged.addListener((changes) => {
  if ('captureSignal' in changes) {
    captureSelection(true);
  }
});

// Update readiness status on tab switch / navigation
chrome.tabs.onActivated.addListener(() => updateReadinessStatus());
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) updateReadinessStatus();
});

btnCopy.addEventListener('click', async () => {
  if (!rawMd) return;
  await navigator.clipboard.writeText(rawMd);
  await incrementCounter();
  await updateCounter();
  setButtonContent(btnCopy, 'check', t('copied'));
  setTimeout(() => {
    setButtonContent(btnCopy, 'copy', t('copy'));
  }, 1500);
});

btnDownload.addEventListener('click', async () => {
  if (!rawMd) return;
  const filename = (lastMeta?.title ?? 'selection')
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 80) + '.md';
  const url = URL.createObjectURL(new Blob([rawMd], { type: 'text/markdown' }));
  await chrome.downloads.download({ url, filename, saveAs: false });
  URL.revokeObjectURL(url);
  await incrementCounter();
  await updateCounter();
});

btnClear.addEventListener('click', () => {
  setContent('');
  previewRendered.innerHTML = '';
  lastMeta = null;
});

// ---- Init ----

async function init() {
  const settings = await getSettings();
  await initI18n(settings.uiLanguage);
  applyI18n();

  // Init icons with translations
  btnUndo.innerHTML = icon('undo', 14);
  btnRedo.innerHTML = icon('redo', 14);
  setButtonContent(btnCapture, 'crosshair', t('captureSelection'), 16);
  setButtonContent(btnHighlighter, 'highlighter', t('highlighterOff'));
  setButtonContent(btnCopy, 'copy', t('copy'));
  setButtonContent(btnDownload, 'download', t('download'));
  setButtonContent(btnClear, 'trash', t('clear'));
  btnPreviewTab.innerHTML = icon('eye', 12) + `<span class="btn-label">${escHtml(t('preview'))}</span>`;
  btnSourceTab.innerHTML = icon('code', 12) + `<span class="btn-label">${escHtml(t('source'))}</span>`;
  btnSettings.innerHTML = icon('settings', 14);

  autoMetadata = settings.autoMetadata;
  setViewMode(settings.defaultViewMode);
  await updateCounter();
  updateButtonStates();
  updateUndoRedoButtons();
  updateHighlighterUI();

  // Check for a fresh captureSignal on startup (handles timing race when panel just opened)
  chrome.storage.session.get('captureSignal', ({ captureSignal }) => {
    if (captureSignal && Date.now() - captureSignal < 3000) {
      captureSelection(true);
    }
  });

  await updateReadinessStatus();
}

// React to settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    const s = changes.settings.newValue;
    if (s) {
      autoMetadata = s.autoMetadata ?? false;
    }
  }
});

init();

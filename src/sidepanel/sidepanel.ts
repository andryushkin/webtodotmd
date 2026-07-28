import { marked } from '../../vendor/marked.esm.js';
import DOMPurify from '../../vendor/purify.esm.mjs';
import katex from '../../vendor/katex.mjs';
import { isRestrictedUrl } from '../shared/restricted';
import { ensureContentScript } from '../shared/inject';
import { icon, setButtonContent } from '../shared/icons';
import { getSettings } from '../shared/settings-store';
import { initI18n, t, applyI18n } from '../shared/i18n';
import type { CaptureSelectionResponse, CaptureErrorResponse, PageMeta } from '../shared/messaging';
import { trackEvent } from '../shared/telemetry';
import { stripMarkdown } from '../shared/strip-markdown';
import { truncateGraphemes } from '../shared/truncate';
import { getRatingUrl } from '../shared/store-links';
import { markedHighlight } from './marked-highlight';

type CaptureResponse = CaptureSelectionResponse | CaptureErrorResponse;
type StatusType = 'default' | 'error' | 'success' | 'warning';

function isCaptureError(r: CaptureResponse): r is CaptureErrorResponse {
  return 'error' in r;
}

marked.setOptions({ breaks: true, gfm: true, html: true });
// The core writes `==highlight==`, which no standard defines and `marked` does
// not know: without this the panel showed the reader four `=` characters it had
// just put in their file.
marked.use({ extensions: [markedHighlight] });

// ---- DOM refs ----

const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnHighlighter = document.getElementById('btn-highlighter') as HTMLButtonElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
const btnTxtMenu = document.getElementById('btn-txt-menu') as HTMLButtonElement;
const txtMenu = document.getElementById('txt-menu') as HTMLDivElement;
const btnCopyTxt = document.getElementById('btn-copy-txt') as HTMLButtonElement;
const btnDownloadTxt = document.getElementById('btn-download-txt') as HTMLButtonElement;
const btnEditmd = document.getElementById('btn-editmd') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const previewRendered = document.getElementById('preview-rendered') as HTMLDivElement;
const previewSource = document.getElementById('preview-source') as HTMLTextAreaElement;
const previewHtml = document.getElementById('preview-html') as HTMLTextAreaElement;
const btnPreviewTab = document.getElementById('btn-preview') as HTMLButtonElement;
const btnSourceTab = document.getElementById('btn-source') as HTMLButtonElement;
const btnHtmlTab = document.getElementById('btn-html') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const ratingRow = document.getElementById('rating-row') as HTMLDivElement;
const toolbar = document.querySelector('.toolbar') as HTMLDivElement;

// EditMD is a macOS app; elsewhere nothing answers editmd://, so the button is
// hidden. Read the platform synchronously, before first paint: awaiting
// chrome.runtime.getPlatformInfo() would show the button and then take it away
// (or the reverse) on every panel open. The UA hint is a low-entropy value
// Chrome always exposes, and this is our own extension page, so it has no
// reason to lie; anything unrecognized hides the button.
const uaPlatform =
  (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform ?? navigator.platform;
btnEditmd.hidden = !/mac/i.test(uaPlatform ?? '');

// ---- State ----

let rawMd = '';
let lastMeta: PageMeta | null = null;
/**
 * The shallowest heading level seen so far in this page's captures, before any
 * shift — the smallest across every press.
 *
 * Each press is its own conversion in the content script, and on its own it puts
 * whatever it found at the top level: capture a section's `<h2>`, then the `<h3>`
 * under it, and both arrive as `##`. The panel is the only place that outlives a
 * press, so it carries the level from one to the next. Reset with the document,
 * and whenever the capture comes from a different page.
 */
let headingBase: number | null = null;

/** The shallower of two levels, either of which may be missing. */
function smallestLevel(kept: number | null, found: number | undefined): number | null {
  if (found === undefined) return kept;
  return kept === null ? found : Math.min(kept, found);
}
const mathMap = new Map<string, { latex: string; display: boolean }>();
let mathCounter = 0;
const MAX_HISTORY = 50;
let undoStack: string[] = [];
let redoStack: string[] = [];
/** The third view is a report, and only exists while the setting asks for it. */
type ViewMode = 'preview' | 'source' | 'html';

let viewMode: ViewMode = 'preview';
/**
 * The markup the last capture was given, when the reader asked to see it
 * (Settings.showHtmlView). It is not part of the document: `rawMd` is the source
 * of truth for everything the panel edits, saves and sends, and this is a report
 * about how the last one was produced — appending a capture leaves it showing
 * that capture alone, which is what makes it useful for a bug report.
 */
let rawHtml = '';
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

function setTempStatus(msg: string, type: StatusType, iconName?: string, ms = 3000) {
  if (revertTimer) clearTimeout(revertTimer);
  setStatus(msg, type, iconName);
  revertTimer = setTimeout(() => {
    revertTimer = null;
    setStatus(baseStatusMsg, baseStatusType, baseStatusIcon);
  }, ms);
}

function clearTempStatus() {
  if (revertTimer) {
    clearTimeout(revertTimer);
    revertTimer = null;
  }
  setStatus(baseStatusMsg, baseStatusType, baseStatusIcon);
}

function attachStatusTooltip(btn: HTMLButtonElement, i18nKey: string) {
  btn.addEventListener('mouseenter', () => {
    if (btn.disabled) return;
    if (revertTimer) clearTimeout(revertTimer);
    revertTimer = null;
    setStatus(t(i18nKey), 'default');
  });
  btn.addEventListener('mouseleave', () => {
    clearTempStatus();
  });
}

// ---- Rating ----

async function initRatingWidget() {
  const { actionCount = 0, ratingHiddenUntil = 0 } = await chrome.storage.local.get(['actionCount', 'ratingHiddenUntil']);
  if (actionCount >= 2 && ratingHiddenUntil < Date.now()) {
    ratingRow.classList.remove('hidden');
  }
}

function hideRatingRow(permanent = false) {
  const until = permanent ? Number.MAX_SAFE_INTEGER : Date.now() + 6 * 30 * 24 * 60 * 60 * 1000;
  chrome.storage.local.set({ ratingHiddenUntil: until });
  ratingRow.classList.add('hidden');
}

async function incrementActionCount() {
  const { actionCount = 0 } = await chrome.storage.local.get('actionCount');
  await chrome.storage.local.set({ actionCount: actionCount + 1 });
  initRatingWidget();
}

// Star interactions
{
  const stars = ratingRow.querySelectorAll('.star') as NodeListOf<HTMLButtonElement>;
  const btnRatingHide = document.getElementById('btn-rating-hide') as HTMLButtonElement;

  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.dataset.value!);
      stars.forEach(s => s.classList.toggle('highlighted', parseInt(s.dataset.value!) <= val));
    });
    star.addEventListener('click', () => {
      const val = parseInt(star.dataset.value!);
      trackEvent(`rating_${val}`);
      hideRatingRow(true);
      chrome.tabs.create({ url: getRatingUrl(val) });
    });
  });

  ratingRow.addEventListener('mouseleave', () => {
    stars.forEach(s => s.classList.remove('highlighted'));
  });

  btnRatingHide.addEventListener('click', () => {
    trackEvent('rating_hidden');
    hideRatingRow(false);
  });
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
    // A span, not a div: a block element would open an HTML block that swallows
    // the rest of the paragraph, and blank lines around it would end the HTML
    // block of a fallback table whose cell holds the formula. The span is styled
    // as a block in CSS.
    return `<span data-katex="${id}" data-display="1"></span>`;
  });

  // Inline math: $...$ → placeholder span
  //
  // A price is not a formula, and two of them in one paragraph are not a formula
  // either — which is the whole of what a bare pair of dollars looks like.
  // `**$129.00** ~~$159.00~~`, an ordinary product card, became
  // `**«129.00** ~~»159.00~~` and KaTeX drew the asterisks and tildes between the
  // two amounts as mathematics. `Costs $5 and $7 in total.` went the same way. The
  // file was never wrong — `rawMd` is the source of truth and this runs on the way
  // to the preview only — but the panel showed something the page never said,
  // which is the one thing the preview is for.
  //
  // The three conditions are Pandoc's, and they are about the dollars rather than
  // about the body — the body between two prices is `129.00** ~~`, which no test
  // for "looks like money" would ever catch. An opening dollar is not followed by
  // a blank, a closing one is not preceded by one, and a closing one is not
  // followed by a digit. That last is what parts two amounts: the dollar of
  // `$159.00` has a `1` behind it and so cannot close anything.
  text = text.replace(/(?<!\$)\$(?!\$)(?!\s)([^$\n]*?[^$\s])\$(?!\$)(?!\d)/g, (_, latex: string) => {
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

// Backward-compatible matcher: accepts both single- and double-quoted YAML
// values for title/source. Inner content stops at the matching quote.
const METADATA_RE = /---\ntitle: (?:"([^"]*)"|'((?:[^']|'')*)')\nsource: (?:"([^"\n]+)"|'((?:[^'\n]|'')+)')\ndate: ([^\n]+)\n---/g;

function buildMetadata(meta: PageMeta): string {
  // Use single-quoted YAML: only `'` needs doubling. Avoids ugly `\"` escapes
  // when og:title contains literal double quotes (e.g. Instagram captions).
  const escapedTitle = meta.title.replace(/'/g, "''");
  const escapedUrl = meta.url.replace(/'/g, "''");
  const dateStr = meta.date.slice(0, 10);
  return `---\ntitle: '${escapedTitle}'\nsource: '${escapedUrl}'\ndate: ${dateStr}\n---`;
}


function renderMarkdown(md: string) {
  const processed = preprocessMath(md)
    .replace(METADATA_RE, (_, titleDQ, titleSQ, sourceDQ, sourceSQ, date) => {
      const rawTitle = titleSQ != null ? titleSQ.replace(/''/g, "'") : titleDQ;
      const source = sourceSQ != null ? sourceSQ.replace(/''/g, "'") : sourceDQ;
      const safeTitle = rawTitle.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
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

function setViewMode(mode: ViewMode) {
  viewMode = mode;
  previewRendered.hidden = mode !== 'preview';
  previewSource.hidden = mode !== 'source';
  previewHtml.hidden = mode !== 'html';
  for (const [button, name] of [
    [btnPreviewTab, 'preview'],
    [btnSourceTab, 'source'],
    [btnHtmlTab, 'html'],
  ] as const) {
    button.classList.toggle('active', mode === name);
    button.setAttribute('aria-pressed', String(mode === name));
  }
}

/**
 * Whether the third view is offered at all.
 *
 * Turning it off while it is the view on screen leaves the panel showing a pane
 * with no way back to it, so the mode falls back to the source — the view whose
 * text this one explains.
 */
function showHtmlView(on: boolean) {
  btnHtmlTab.hidden = !on;
  if (!on && viewMode === 'html') setViewMode('source');
}

function updateUndoRedoButtons() {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

function updateButtonStates() {
  const hasContent = rawMd.trim().length > 0;
  btnCopy.disabled = !hasContent;
  btnDownload.disabled = !hasContent;
  btnTxtMenu.disabled = !hasContent;
  if (!hasContent) closeTxtMenu();
  btnEditmd.disabled = !hasContent;
  btnClear.disabled = !hasContent;
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

  // The base belongs to the document in the panel, so it may only go out to the
  // page that document came from. It was going out on every press and reset on
  // the way back, after the Markdown had already been written: capture a page
  // whose shallowest heading is an `<h3>`, move to another URL, capture a
  // section starting at `<h5>`, and the content script was handed a base of 3,
  // shifted the section by -1 and returned `####` — under nothing. The panel
  // then set the base to 5, having lost the only text that could have used it.
  const carries = rawMd.trim().length > 0 && lastMeta?.url === tab.url;

  let response: CaptureResponse;
  try {
    response = await sendMessageWithTimeout(
      tab.id,
      { type: messageType, headingBase: carries ? (headingBase ?? undefined) : undefined },
      3000,
    );
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
  // Replaced rather than appended: this is a report about the capture that just
  // happened, and a reader sending it on wants the fragment that produced the
  // paragraph they are looking at, not every fragment of the session.
  rawHtml = response.html ?? '';
  previewHtml.value = rawHtml;
  const prevUrl = lastMeta?.url ?? null;
  lastMeta = meta;

  // The base travels with the document: a capture of another page starts the
  // levels again, and so does an empty panel. Asked a second time against the
  // URL the page reports for itself, which is the authority — the tab's was all
  // there was to go on before the request, and a tab can navigate between the
  // two. Where they disagree the base is dropped rather than kept: no shift is
  // a heading at its own rank, while a shift against the wrong document is a
  // rank nothing above it holds.
  const continues = rawMd.trim().length > 0 && prevUrl === meta.url;
  headingBase = smallestLevel(continues && carries ? headingBase : null, response.topLevel);

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
btnHtmlTab.addEventListener('click', () => setViewMode('html'));

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
chrome.tabs.onActivated.addListener(() => {
  if (highlighterEnabled) {
    highlighterPort?.disconnect();
    highlighterPort = null;
    highlighterEnabled = false;
    highlightCount = 0;
    updateHighlighterUI();
  }
  updateReadinessStatus();
});
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) updateReadinessStatus();
});

function safeFilename(ext: string): string {
  // Grapheme truncation, not slice(): a title cut mid-emoji leaves a lone
  // surrogate, which encodeURIComponent() rejects with URIError on the
  // editmd:// hand-off and which reaches the download name intact.
  const name = (lastMeta?.title ?? 'selection').replace(/[\\/:*?"<>|]/g, '-');
  return truncateGraphemes(name, 80) + ext;
}

function closeTxtMenu() {
  txtMenu.hidden = true;
  btnTxtMenu.setAttribute('aria-expanded', 'false');
}

function openTxtMenu() {
  txtMenu.hidden = false;
  btnTxtMenu.setAttribute('aria-expanded', 'true');
}

// writeText rejects with NotAllowedError whenever the panel does not hold
// focus, which is routine — the user's last click is usually in the page. Left
// unhandled it produced an inert button and no message at all, so every copy
// path goes through here and reports the failure.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('clipboard write failed', err);
    setTempStatus(t('errClipboard'), 'error', 'x');
    return false;
  }
}

btnCopy.addEventListener('click', async () => {
  if (!rawMd) return;
  if (!await copyToClipboard(rawMd)) return;
  trackEvent('copy');
  incrementActionCount();
  setButtonContent(btnCopy, 'check', t('copied'));
  setTimeout(() => {
    setButtonContent(btnCopy, 'copy', t('copy'));
  }, 1500);
});

btnDownload.addEventListener('click', async () => {
  if (!rawMd) return;
  const url = URL.createObjectURL(new Blob([rawMd], { type: 'text/markdown' }));
  await chrome.downloads.download({ url, filename: safeFilename('.md'), saveAs: false });
  URL.revokeObjectURL(url);
  trackEvent('download_md');
  incrementActionCount();
});

btnTxtMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  if (txtMenu.hidden) openTxtMenu(); else closeTxtMenu();
});

document.addEventListener('click', (e) => {
  if (txtMenu.hidden) return;
  const target = e.target as Node;
  if (!txtMenu.contains(target) && target !== btnTxtMenu) closeTxtMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !txtMenu.hidden) closeTxtMenu();
});

btnCopyTxt.addEventListener('click', async () => {
  if (!rawMd) return;
  closeTxtMenu();
  const txt = stripMarkdown(rawMd);
  if (!await copyToClipboard(txt)) return;
  trackEvent('copy_txt');
  incrementActionCount();
  setTempStatus(t('copiedTxt'), 'success', 'check', 1500);
});

btnDownloadTxt.addEventListener('click', async () => {
  if (!rawMd) return;
  closeTxtMenu();
  const txt = stripMarkdown(rawMd);
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  await chrome.downloads.download({ url, filename: safeFilename('.txt'), saveAs: false });
  URL.revokeObjectURL(url);
  trackEvent('download_txt');
  incrementActionCount();
});

// Send to EditMD: clipboard carries the body (URL length is capped),
// the editmd://new URL carries only the file name — same handoff as
// the Obsidian Web Clipper's obsidian://new?...&clipboard.
btnEditmd.addEventListener('click', async () => {
  if (!rawMd) return;
  // The clipboard carries the note, so a refused write is a failed hand-off:
  // stop before opening EditMD on an empty clipboard.
  if (!await copyToClipboard(rawMd)) return;
  const url = `editmd://new?file=${encodeURIComponent(safeFilename(''))}&clipboard`;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('NO_TAB');
    await chrome.tabs.update(tab.id, { url });
  } catch {
    // A non-null return only means a browsing context was created — the URL is
    // loaded asynchronously, so it says nothing about whether editmd:// has a
    // handler. null mostly means the window was blocked outright; report that,
    // but don't read the other branch as "it arrived".
    if (!window.open(url)) {
      setTempStatus(t('errEditmdOpen'), 'error', 'x');
      return;
    }
  }
  trackEvent('send_editmd');
  incrementActionCount();
  // Chrome never tells us whether the scheme was handled, so the status claims
  // only what we know: the handoff was started.
  setTempStatus(t('openingEditmd'), 'default', 'send', 2000);
});

btnClear.addEventListener('click', () => {
  setContent('');
  previewRendered.innerHTML = '';
  lastMeta = null;
  headingBase = null;
});

// ---- Init ----

function applyButtonLabels() {
  setButtonContent(btnCapture, 'crosshair', t('captureSelection'), 16);
  setButtonContent(btnHighlighter, 'highlighter',
    t(highlighterEnabled ? 'highlighterOn' : 'highlighterOff'));
  setButtonContent(btnCopy, 'copy', t('copy'));
  setButtonContent(btnDownload, 'download', t('download'));
  btnTxtMenu.innerHTML =
    `<span class="btn-label">.txt</span>` + icon('chevronDown', 12);
  // ".txt" alone is not a name a screen reader can act on, and the chevron
  // disappears in compact mode — spell the action out for assistive tech.
  btnTxtMenu.setAttribute('aria-label', t('tooltipTxtMenu'));
  btnCopyTxt.innerHTML = icon('copy', 14) + `<span class="btn-label">${escHtml(t('tooltipCopyTxt'))}</span>`;
  btnDownloadTxt.innerHTML = icon('download', 14) + `<span class="btn-label">${escHtml(t('tooltipDownloadTxt'))}</span>`;
  setButtonContent(btnEditmd, 'send', 'EditMD');
  // The visible label is the brand alone; name the action for assistive tech.
  btnEditmd.setAttribute('aria-label', t('tooltipSendEditmd'));
  setButtonContent(btnClear, 'trash', t('clear'));
  btnPreviewTab.innerHTML = icon('eye', 12) + `<span class="btn-label">${escHtml(t('preview'))}</span>`;
  btnSourceTab.innerHTML = icon('code', 12) + `<span class="btn-label">${escHtml(t('source'))}</span>`;
  // "HTML" is the name of the format in every language this ships in, so the
  // label is the word itself rather than a fifty-second string to translate.
  btnHtmlTab.innerHTML = icon('fileText', 12) + '<span class="btn-label">HTML</span>';
  updateToolbarDensity();
}

// Labels stay while the toolbar fits on one row; a narrow panel or a long
// locale (de "Herunterladen") makes it wrap, and then we drop to icons. Always
// measure with the labels on, so the two states can't oscillate.
function updateToolbarDensity() {
  toolbar.classList.remove('compact');
  // Hidden children (the EditMD button off macOS) report offsetTop 0 and would
  // read as the top row, making every visible button look wrapped.
  const items = ([...toolbar.children] as HTMLElement[])
    .filter(el => el.offsetParent !== null);
  if (items.some(el => el.offsetTop > items[0].offsetTop)) {
    toolbar.classList.add('compact');
  }
}

async function init() {
  const settings = await getSettings();
  await initI18n(settings.uiLanguage);
  applyI18n();

  btnUndo.innerHTML = icon('undo', 14);
  btnRedo.innerHTML = icon('redo', 14);
  btnSettings.innerHTML = icon('settings', 14);
  applyButtonLabels();

  // The side panel sits next to the page and the user can drag it narrower.
  // Observe body — its width tracks the panel and, unlike the toolbar's own,
  // is unaffected by the compact class we toggle.
  new ResizeObserver(updateToolbarDensity).observe(document.body);
  // Inter arrives after first paint and changes how wide the labels are.
  document.fonts.ready.then(updateToolbarDensity);

  attachStatusTooltip(btnCopy, 'tooltipCopyMd');
  attachStatusTooltip(btnDownload, 'tooltipDownloadMd');
  attachStatusTooltip(btnTxtMenu, 'tooltipTxtMenu');
  attachStatusTooltip(btnEditmd, 'tooltipSendEditmd');

  autoMetadata = settings.autoMetadata;
  showHtmlView(settings.showHtmlView);
  setViewMode(settings.defaultViewMode);
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
  await initRatingWidget();
}

// React to settings changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    const s = changes.settings.newValue;
    if (s) {
      autoMetadata = s.autoMetadata ?? false;
      showHtmlView(s.showHtmlView === true);
      const newLang = s.uiLanguage ?? 'en';
      const oldLang = changes.settings.oldValue?.uiLanguage ?? 'en';
      if (newLang !== oldLang) {
        await initI18n(newLang);
        applyI18n();
        applyButtonLabels();
        await updateReadinessStatus();
      }
    }
  }
});

// init() awaits storage and the locale files; anything that rejects there stops
// the rest of the startup — labels, view mode, readiness — and used to do it
// without a trace. It cannot be recovered from here, but it can be findable.
init().catch(err => console.error('side panel init failed', err));

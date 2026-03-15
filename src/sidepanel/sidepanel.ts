import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { isRestrictedUrl } from '../shared/restricted';
import { incrementCounter, getCounterToday } from '../shared/counter';
import type { CaptureSelectionResponse, CaptureErrorResponse, PageMeta } from '../shared/messaging';

type CaptureResponse = CaptureSelectionResponse | CaptureErrorResponse;

function isCaptureError(r: CaptureResponse): r is CaptureErrorResponse {
  return 'error' in r;
}

marked.setOptions({ breaks: true, gfm: true });

// ---- DOM refs ----

const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnMetadata = document.getElementById('btn-metadata') as HTMLButtonElement;
const btnAppend = document.getElementById('btn-append') as HTMLButtonElement;
const btnReplace = document.getElementById('btn-replace') as HTMLButtonElement;
const btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement;
const previewRendered = document.getElementById('preview-rendered') as HTMLDivElement;
const previewSource = document.getElementById('preview-source') as HTMLTextAreaElement;
const btnPreviewTab = document.getElementById('btn-preview') as HTMLButtonElement;
const btnSourceTab = document.getElementById('btn-source') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const dialogEl = document.getElementById('dialog-append-replace') as HTMLDivElement;
const counterValue = document.getElementById('counter-value') as HTMLSpanElement;

// ---- State ----

let rawMd = '';
let pendingMd = '';
let lastMeta: PageMeta | null = null;
let viewMode: 'preview' | 'source' = 'preview';

// ---- Utilities ----

function setStatus(msg: string, type: 'default' | 'error' | 'success' = 'default') {
  statusEl.textContent = msg;
  statusEl.className = `status${type !== 'default' ? ` ${type}` : ''}`;
}

function renderMarkdown(md: string) {
  const dirty = marked.parse(md) as string;
  previewRendered.innerHTML = DOMPurify.sanitize(dirty);
}

function setContent(md: string) {
  rawMd = md;
  renderMarkdown(md);
  previewSource.value = md;
  updateButtonStates();
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

function updateButtonStates() {
  const hasContent = rawMd.trim().length > 0;
  btnCopy.disabled = !hasContent;
  btnClear.disabled = !hasContent;
  btnMetadata.disabled = !hasContent || lastMeta === null;
}

function showDialog() {
  dialogEl.hidden = false;
}

function hideDialog() {
  dialogEl.hidden = true;
  pendingMd = '';
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

// ---- Event handlers ----

btnPreviewTab.addEventListener('click', () => setViewMode('preview'));
btnSourceTab.addEventListener('click', () => setViewMode('source'));

btnCapture.addEventListener('click', async () => {
  setStatus('');
  hideDialog();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url) {
    setStatus('Cannot access this tab.', 'error');
    return;
  }

  if (isRestrictedUrl(tab.url)) {
    setStatus('Cannot capture from this page (restricted URL).', 'error');
    return;
  }

  let response: CaptureResponse;
  try {
    response = await sendMessageWithTimeout(tab.id, { type: 'CAPTURE_SELECTION' }, 3000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'TIMEOUT') {
      setStatus('Request timed out. Try again.', 'error');
    } else {
      setStatus('Could not connect to page. Reload and try again.', 'error');
    }
    return;
  }

  if (isCaptureError(response)) {
    if (response.error === 'NO_SELECTION') {
      setStatus('No text selected. Select text on the page first.', 'error');
    } else {
      setStatus('Could not convert selection.', 'error');
    }
    return;
  }

  const { md, meta } = response;
  lastMeta = meta;

  if (rawMd.trim().length === 0) {
    setContent(md);
    setStatus('Captured.', 'success');
  } else {
    pendingMd = md;
    showDialog();
  }
});

btnAppend.addEventListener('click', () => {
  setContent(rawMd + '\n\n---\n\n' + pendingMd);
  hideDialog();
  setStatus('Appended.', 'success');
});

btnReplace.addEventListener('click', () => {
  setContent(pendingMd);
  hideDialog();
  setStatus('Replaced.', 'success');
});

btnCancel.addEventListener('click', () => {
  hideDialog();
  setStatus('');
});

btnCopy.addEventListener('click', async () => {
  if (!rawMd) return;
  await navigator.clipboard.writeText(rawMd);
  await incrementCounter();
  await updateCounter();
  const original = btnCopy.textContent;
  btnCopy.textContent = 'Copied ✓';
  setTimeout(() => {
    btnCopy.textContent = original;
  }, 1500);
});

btnClear.addEventListener('click', () => {
  rawMd = '';
  previewRendered.innerHTML = '';
  previewSource.value = '';
  lastMeta = null;
  setStatus('');
  updateButtonStates();
});

btnMetadata.addEventListener('click', () => {
  if (!lastMeta) return;

  const escapedTitle = lastMeta.title.replace(/"/g, '\\"');
  const frontmatter = `---\ntitle: "${escapedTitle}"\nurl: ${lastMeta.url}\ndate: ${lastMeta.date}\n---\n\n`;

  let newValue: string;
  if (rawMd.startsWith('---\n')) {
    const endIdx = rawMd.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      const body = rawMd.slice(endIdx + 5).replace(/^\n+/, '');
      newValue = frontmatter + body;
    } else {
      newValue = frontmatter + rawMd;
    }
  } else {
    newValue = frontmatter + rawMd;
  }

  setContent(newValue);
  setStatus('Metadata added.', 'success');
});

// ---- Init ----

setViewMode('preview');
updateCounter();
updateButtonStates();

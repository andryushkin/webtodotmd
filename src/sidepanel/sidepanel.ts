import { isRestrictedUrl } from '../shared/restricted';
import { incrementCounter, getCounterToday } from '../shared/counter';
import type { CaptureSelectionResponse, CaptureErrorResponse, PageMeta } from '../shared/messaging';

type CaptureResponse = CaptureSelectionResponse | CaptureErrorResponse;

function isCaptureError(r: CaptureResponse): r is CaptureErrorResponse {
  return 'error' in r;
}

// ---- DOM refs ----

const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnMetadata = document.getElementById('btn-metadata') as HTMLButtonElement;
const btnAppend = document.getElementById('btn-append') as HTMLButtonElement;
const btnReplace = document.getElementById('btn-replace') as HTMLButtonElement;
const btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement;
const preview = document.getElementById('preview') as HTMLTextAreaElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const dialogEl = document.getElementById('dialog-append-replace') as HTMLDivElement;
const counterValue = document.getElementById('counter-value') as HTMLSpanElement;

// ---- State ----

let pendingMd = '';
let lastMeta: PageMeta | null = null;

// ---- Utilities ----

function setStatus(msg: string, type: 'default' | 'error' | 'success' = 'default') {
  statusEl.textContent = msg;
  statusEl.className = `status${type !== 'default' ? ` ${type}` : ''}`;
}

function updateButtonStates() {
  const hasContent = preview.value.trim().length > 0;
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

  if (preview.value.trim().length === 0) {
    preview.value = md;
    setStatus('Captured.', 'success');
    updateButtonStates();
  } else {
    pendingMd = md;
    showDialog();
  }
});

btnAppend.addEventListener('click', () => {
  preview.value += '\n\n---\n\n' + pendingMd;
  hideDialog();
  setStatus('Appended.', 'success');
  updateButtonStates();
});

btnReplace.addEventListener('click', () => {
  preview.value = pendingMd;
  hideDialog();
  setStatus('Replaced.', 'success');
  updateButtonStates();
});

btnCancel.addEventListener('click', () => {
  hideDialog();
  setStatus('');
});

btnCopy.addEventListener('click', async () => {
  if (!preview.value) return;
  await navigator.clipboard.writeText(preview.value);
  await incrementCounter();
  await updateCounter();
  const original = btnCopy.textContent;
  btnCopy.textContent = 'Copied ✓';
  setTimeout(() => {
    btnCopy.textContent = original;
  }, 1500);
});

btnClear.addEventListener('click', () => {
  preview.value = '';
  lastMeta = null;
  setStatus('');
  updateButtonStates();
});

btnMetadata.addEventListener('click', () => {
  if (!lastMeta) return;

  const escapedTitle = lastMeta.title.replace(/"/g, '\\"');
  const frontmatter = `---\ntitle: "${escapedTitle}"\nurl: ${lastMeta.url}\ndate: ${lastMeta.date}\n---\n\n`;

  if (preview.value.startsWith('---\n')) {
    // Replace existing frontmatter block
    const endIdx = preview.value.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      const body = preview.value.slice(endIdx + 5).replace(/^\n+/, '');
      preview.value = frontmatter + body;
    } else {
      preview.value = frontmatter + preview.value;
    }
  } else {
    preview.value = frontmatter + preview.value;
  }

  setStatus('Metadata added.', 'success');
  updateButtonStates();
});

// ---- Init ----

updateCounter();
updateButtonStates();

document.getElementById('capture')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;

  const { md } = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_SELECTION' });
  if (md) {
    await navigator.clipboard.writeText(md);
    window.close();
  }
});

# Service worker — invariants

Chrome restarts this process whenever it likes, and some of its state survives
the restart while some does not. Both of these are that.

- Call `setPanelBehavior({ openPanelOnActionClick: false })` explicitly on every
  service worker start. Chrome persists `true` across reloads, and then
  `chrome.action.onClicked` never fires.
- Do not add `host_permissions: ["*://*/*"]`; store review flags it.
  `content_scripts.matches` plus `scripting`/`activeTab` already cover both
  injection paths.
- The worker owns `contentI18n` in `chrome.storage.local` — the content script
  cannot fetch locale files itself, and `chrome.runtime.sendMessage` is not a
  route to it because the panel listens on the same channel. See
  `src/content/CLAUDE.md`.

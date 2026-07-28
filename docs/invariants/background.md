# Service worker — invariants

Chrome restarts this process whenever it likes, and some of its state survives
the restart while some does not. Most of what follows is that. The subsystem is
one file, `src/background/service-worker.ts`.

Each rule names the failure it prevents.

## What a restart takes away

- Call `setPanelBehavior({ openPanelOnActionClick: false })` explicitly on every
  service worker start. Chrome persists `true` across reloads, and then
  `chrome.action.onClicked` never fires.
- Build the context menu on `onInstalled` **and** on `onStartup`. Chrome keeps a
  registered item for the browser session and no longer, while `onInstalled`
  fires only when the extension is installed or updated — so a menu created
  there alone is present on the day it was installed and gone the next morning.
  Both paths remove before they create — creating an id that already exists
  throws, and the settings listener builds the item a third time whenever the UI
  language changes.
- The menu is built by `createContextMenu()`, which awaits `initI18n()` and
  `writeContentTranslations()` first. Those two calls are why the item is
  translated at all, and the second is also the only thing that ever writes
  `contentI18n` — the strings the floating bubble shows. Rebuilding the menu is
  therefore how the content script's language is refreshed as well; the settings
  listener repeats both calls for the same reason. Move one without the other
  and the bubble goes on speaking the language of the last browser start. The
  content script cannot fetch locale files itself, and
  `chrome.runtime.sendMessage` is no route to it either — see
  `docs/invariants/content.md`.

## Permissions and injection

- Do not add `host_permissions: ["*://*/*"]`; store review flags it.
  `content_scripts.matches` plus `scripting`/`activeTab` already cover both
  injection paths.
- On `install` and on `update`, re-inject the content script into every open
  http(s) tab. `content_scripts.matches` injects on navigation only, so a tab
  the user already had open holds a script belonging to the previous version,
  whose extension context is dead — it answers no message and the first capture
  in that tab fails until the page is reloaded. Injection failures are
  swallowed on purpose: `chrome://`, the Web Store and `file://` refuse, and
  there is nothing to do about it.
- That loop names the *built* file (`src/content/content-script.js`), not the
  source `.ts` the manifest carries — `build.sh` rewrites the manifest and this
  path is already written as the output. A second content script added to the
  manifest and not to that loop reaches old tabs only after a reload.

## Opening the panel

- `chrome.sidePanel.open()` needs a user-gesture context and, called from
  `onMessage`, can throw *synchronously* as well as reject — both are caught,
  or a failed open takes the whole listener down with it. The capture survives
  either way: every path that opens the panel also writes
  `{ captureSignal: Date.now() }` to `chrome.storage.session`, which is what the
  panel captures on (`docs/architecture.md` describes the signal). A lost
  gesture costs the opening, never the text.

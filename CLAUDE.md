Chrome Extension для захвата выделений со страниц в Markdown.
Ядро конвертации — внешняя библиотека `@markitdown/core`.

## Разработка

- **Сборка:** `bash build.sh` — без `bun install`, без `node_modules`
- **Транспайлер:** Bun (встроенный, глобально установлен) — компилирует `.ts` без npm-пакетов
- **GitHub:** https://github.com/andryushkin/todotmd (private), ветка `main`

### Vendored зависимости (нет node_modules)
- `vendor/marked.esm.js` — ESM бандл marked (скопирован из node_modules)
- `vendor/purify.esm.mjs` — ESM бандл DOMPurify
- `types/chrome/` — типы Chrome API (скопированы из @types/chrome)
- `@markitdown/core` — импортируется напрямую: `../../../markitdown/src/browser.ts`

## Архитектура

- **Content script** — захватывает `window.getSelection()` через `selectionToMarkdown()`; поддерживает `rangeCount > 1` (объединение через `\n\n`); Shadow DOM flattening перед конвертацией; после успешного `CAPTURE_SELECTION` вызывает `removeAllRanges()` чтобы повторный capture без выделения давал NO_SELECTION
- **Content script injection** — **lazy** (on-demand): `content_scripts` убран из manifest; скрипт инжектится через `chrome.scripting.executeScript()` только при capture; `ensureContentScript()` сначала шлёт PING, и только при отсутствии ответа инжектит
- **Side Panel** — основной UI (не Popup); кнопка "Capture Selection" + rendered Markdown preview; слушает `chrome.storage.session.onChanged` для auto-capture; Lucide-style SVG-иконки на всех кнопках
- **Background (service worker)** — координация; `chrome.action.onClicked` открывает панель + пишет `captureSignal: Date.now()` в `chrome.storage.session`

Подробности интеграции с библиотекой: [docs/CHROME_EXTENSION.md]

## Ключевые зависимости

- `@markitdown/core` — HTML→Markdown
- `marked` + `DOMPurify` — rendered Markdown preview в Side Panel
- Manifest V3, permission `scripting` для on-demand injection

## Side Panel — ключевые паттерны

- State `rawMd: string` — единый источник истины для содержимого (не `textarea.value`)
- `setContent(md)` — всегда использовать для обновления: обновляет rawMd, rendered div и source textarea
- `setViewMode('preview'|'source')` — управляет видимостью и aria-pressed
- Copy всегда читает `rawMd` (сырой Markdown, не HTML)
- `DOMPurify.sanitize()` обязателен перед присвоением `innerHTML`
- Toggle-кнопки Preview/Source находятся в `<header>`, не в toolbar
- `captureSelection(silent: boolean)` — единая функция capture для кнопки и auto-capture; `silent=true` подавляет NO_SELECTION ошибку
- **KaTeX + MathML:** `preprocessMath` очищает U+2061–U+2064 (невидимые MathML-операторы) из latex-строк перед `mathMap.set()` — иначе KaTeX выдаёт `unknownSymbol` warnings

## Иконки (Lucide-style SVG)

- `src/shared/icons.ts` — SVG-пути для всех иконок (24×24 viewBox, stroke-based)
- `icon(name, size)` — генерирует inline SVG строку
- `setButtonContent(btn, iconName, label)` — устанавливает иконку + текст в кнопку
- Иконки инициализируются в JS при старте панели (не в HTML)
- При смене состояния кнопки (Copy → Copied) — вызывать `setButtonContent` с новой иконкой

## Floating Bubble

- `showBubble()` / `hideBubble()` в `content-script.ts` — управление видимостью только через `style.display`
- ⚠️ **Не использовать `element.hidden`** — `style.cssText` с `display:inline-flex` перебивает UA-стиль `[hidden]{display:none}`, элемент остаётся видимым
- Иконка crosshair через `icon('crosshair', 12)` из `src/shared/icons.ts`; `bubble.innerHTML = icon(...) + ' add to .md'`
- После клика: `hideBubble()` + `removeAllRanges()` через 400ms (очищает выделение после отправки capture-сигнала)
- `mousedown` listener проверяет `bubble.style.display !== 'none'` (не `!bubble.hidden`)

## Shadow DOM Flattening

- `expandShadowRoots()` в `content-script.ts` — перед capture временно инжектит содержимое shadow roots как `<s2md-shadow>` элементы
- Возвращает cleanup-функцию, которую нужно вызвать после capture
- Обёрнуто в try/finally для гарантии очистки

## Lazy Content Script Injection

- `src/shared/inject.ts` — `ensureContentScript(tabId)`: PING → если нет ответа → `scripting.executeScript()`
- Используется и в sidepanel (перед `CAPTURE_SELECTION`), и в service-worker (перед `CAPTURE_AND_COPY`)
- Floating bubble появляется только после первой инъекции скрипта (не на каждой странице)

## Highlighter Mode

- Альтернативный режим захвата: кликами выделяются блочные элементы страницы (P, H1-H6, LI, BLOCKQUOTE, PRE, TABLE и др.)
- Toggle-кнопка в Side Panel рядом с Capture; при включении — блокирует обычные клики на странице
- Hover: dashed-overlay на элементе под курсором; Click: фиксирует/снимает highlight (outline + background)
- Capture button автоматически переключается на `CAPTURE_HIGHLIGHTS` при наличии highlights
- `captureHighlightsMd()` — создаёт fake Selection для каждого highlighted-элемента, конвертирует через markitdown, объединяет через `\n\n`
- `HIGHLIGHT_COUNT` сообщения из content script → side panel для обновления badge
- Clear highlights: удаляет CSS-классы и сбрасывает Set
- **Auto-clear после capture:** `captureSelection()` вызывает `clearHighlights()` сразу после успешного `CAPTURE_HIGHLIGHTS`
- `findHighlightTarget(el)` — поднимается по DOM до ближайшего блочного элемента
- **Auto-disable при закрытии панели (port-based):** Side Panel открывает `chrome.runtime.connect()` порт при старте; Content Script получает `port.onDisconnect` событие и автоматически деактивирует highlighter mode — без явного сообщения от панели

## Settings Page

- `src/settings/settings.html` + `.ts` + `.css` — Options page (зарегистрирована в manifest как `options_page`)
- `src/shared/settings-store.ts` — `getSettings()` / `saveSettings()` через `chrome.storage.local`
- Настройки: `autoMetadata` (bool), `showBubble` (bool), `defaultViewMode` (preview|source), `highlighterColor` (hex)
- Side Panel и Content Script слушают `chrome.storage.onChanged` для реактивного обновления
- Кнопка-шестерёнка в header Side Panel → `chrome.runtime.openOptionsPage()`

## Auto-capture паттерн (US-1)

- Service worker пишет `{ captureSignal: Date.now() }` в `chrome.storage.session` при клике на иконку
- Side panel слушает `chrome.storage.session.onChanged` и вызывает `captureSelection(true)`
- При `silent=true`: NO_SELECTION → молчим (панель просто пустая), прочие ошибки тоже подавляются
- Side panel при старте читает `captureSignal` (startup check) — нужен для race condition когда панель только открылась

## ⚠️ Chrome Side Panel: setPanelBehavior кешируется

- `openPanelOnActionClick: true` передаёт клик Chrome-у → `chrome.action.onClicked` **не срабатывает**
- Chrome **сохраняет** это значение между перезагрузками расширения
- **Правило:** всегда явно вызывать `setPanelBehavior({ openPanelOnActionClick: false })` при старте service worker
- Без явного `false` старое `true` останется активным даже если убрать вызов из кода

## i18n (v1.0)

- `public/_locales/<code>/messages.json` — 52 языка; ключи `appName` + `appDescription`
- `manifest.json` использует `__MSG_appName__` / `__MSG_appDescription__` + `"default_locale": "en"`
- **`_locales/` ДОЛЖЕН быть в `public/`** — `build.sh` делает `cp -r public/* dist/`; корневой `_locales/` не попадёт в dist
- **CWS Store Listing переводы — через Developer Dashboard, НЕ через `_locales/`**
- `_locales/` влияет только на отображение в Chrome UI (тултип, страница расширений)
- При добавлении `default_locale`: поля `name` и `description` в manifest ОБЯЗАНЫ использовать `__MSG_*` синтаксис

## Публикация (v1.0)

- `privacy-policy.html` — Privacy Policy страница; хостить публично перед сабмитом в CWS
- `docs/permissions-justification.md` — обоснование каждого permission для Google review
- Версия `1.0.0` в `manifest.json`
- Иконки: `icon16.png`, `icon48.png`, `icon128.png` в корне + `public/`

## Документация

- `PRD.md` — основной источник истины по требованиям и архитектуре; читать перед реализацией

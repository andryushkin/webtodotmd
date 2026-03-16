Chrome Extension для захвата выделений со страниц в Markdown.
Ядро конвертации — внешняя библиотека `@markitdown/core`.

## Разработка

- **Пакетный менеджер:** Bun (`bun install`, `bun run build`)
- **Сборщик:** Vite (`vite.config.ts` — три точки входа: background, content, sidepanel)
- **GitHub:** https://github.com/andryushkin/select2md (private), ветка `main`

## Архитектура

- **Content script** — захватывает `window.getSelection()` через `selectionToMarkdown()`; поддерживает `rangeCount > 1` (объединение через `\n\n`)
- **Side Panel** — основной UI (не Popup); кнопка "Capture Selection" + rendered Markdown preview; слушает `chrome.storage.session.onChanged` для auto-capture
- **Background (service worker)** — координация; `chrome.action.onClicked` открывает панель + пишет `captureSignal: Date.now()` в `chrome.storage.session`

Подробности интеграции с библиотекой: [docs/CHROME_EXTENSION.md]

## Ключевые зависимости

- `@markitdown/core` — HTML→Markdown
- `marked` + `DOMPurify` — rendered Markdown preview в Side Panel
- Manifest V3

## Side Panel — ключевые паттерны

- State `rawMd: string` — единый источник истины для содержимого (не `textarea.value`)
- `setContent(md)` — всегда использовать для обновления: обновляет rawMd, rendered div и source textarea
- `setViewMode('preview'|'source')` — управляет видимостью и aria-pressed
- Copy всегда читает `rawMd` (сырой Markdown, не HTML)
- `DOMPurify.sanitize()` обязателен перед присвоением `innerHTML`
- Toggle-кнопки Preview/Source находятся в `<header>`, не в toolbar
- `captureSelection(silent: boolean)` — единая функция capture для кнопки и auto-capture; `silent=true` подавляет NO_SELECTION ошибку

## Auto-capture паттерн (US-1)

- Service worker пишет `{ captureSignal: Date.now() }` в `chrome.storage.session` при клике на иконку
- Side panel слушает `chrome.storage.session.onChanged` и вызывает `captureSelection(true)`
- При `silent=true`: NO_SELECTION → молчим (панель просто пустая), прочие ошибки тоже подавляются

## i18n (v1.0)

- `public/_locales/<code>/messages.json` — 52 языка; ключи `appName` + `appDescription`
- `manifest.json` использует `__MSG_appName__` / `__MSG_appDescription__` + `"default_locale": "en"`
- **`_locales/` ДОЛЖЕН быть в `public/`** — Vite копирует только `public/` в `dist/`; корневой `_locales/` даёт ошибку "Default locale was specified, but _locales subtree is missing"
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

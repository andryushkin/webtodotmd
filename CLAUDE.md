Chrome Extension для захвата выделений со страниц в Markdown.
Ядро конвертации — внешняя библиотека `@markitdown/core`.

## Разработка

- **Пакетный менеджер:** Bun (`bun install`, `bun run build`)
- **Сборщик:** Vite (`vite.config.ts` — три точки входа: background, content, sidepanel)
- **GitHub:** https://github.com/andryushkin/select2md (private), ветка `main`

## Архитектура

- **Content script** — захватывает `window.getSelection()` через `selectionToMarkdown()`
- **Side Panel** — основной UI (не Popup); кнопка "Capture Selection" + rendered Markdown preview
- **Background (service worker)** — координация; `chrome.action.onClicked` открывает панель + trigger capture

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

## Документация

- `PRD.md` — основной источник истины по требованиям и архитектуре; читать перед реализацией

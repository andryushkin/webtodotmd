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

## Документация

- `PRD.md` — основной источник истины по требованиям и архитектуре; читать перед реализацией

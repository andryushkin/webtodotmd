# PRD: select2md — Chrome Extension

## 1. Overview

### Проблема

Скопировать фрагмент веб-страницы в чистом Markdown сложно: обычный `Ctrl+C` даёт либо plain text (теряется форматирование), либо сырой HTML (грязный, непригодный для использования в документах). Разработчики, исследователи и авторы тратят время на ручное форматирование.

### Решение

select2md — расширение для Chrome, которое конвертирует HTML-выделение в Markdown одним кликом. Пользователь выделяет текст на любой странице, нажимает кнопку в боковой панели (или пункт контекстного меню, или горячую клавишу) — и получает чистый Markdown в буфере обмена или как `.md`-файл.

### Vision

Стать стандартным инструментом для всех, кто работает с документацией, заметками и контентом в Markdown, — незаметным, мгновенным, надёжным.

---

## 2. Goals & Non-Goals

### Goals

- **Лёгкость использования:** одно действие от выделения до Markdown в clipboard
- **Side Panel как основной UI:** preview результата + действия в постоянной боковой панели
- **Точная конвертация:** сохранять заголовки, жирный/курсив, списки, ссылки, код, таблицы
- **Множественные точки входа:** side panel, контекстное меню, горячие клавиши
- **Публикация в Chrome Web Store:** соответствие MV3 и политике Google
- **Подготовка к монетизации:** счётчик действий и gate-функция встроены с первой версии

### Non-Goals

- Захват всей страницы целиком (full-page capture)
- Синхронизация с облаком или хранилище истории
- Встроенный редактор Markdown (preview — readonly)
- Поддержка браузеров помимо Chrome (на первом этапе)

---

## 3. Target Users (Personas)

### Developer / Tech Writer (основной)

Пишет документацию, README, внутренние гайды. Часто копирует фрагменты из docs.\*, Stack Overflow, GitHub Issues. Хочет получить готовый Markdown-блок без ручного форматирования.

### Researcher / Student

Сохраняет цитаты и выдержки из статей в Obsidian, Notion, Roam. Ценит сохранение структуры (заголовки, курсив, ссылки). Использует расширение десятки раз в день.

### Content Creator

Готовит черновики постов и статей из веб-материалов. Важна скорость и отсутствие мусорного HTML.

---

## 4. User Stories

### US-1: Capture via Side Panel (MVP — v0.1) ✅

**As a** пользователь,
**I want to** выделить текст на странице, открыть боковую панель и нажать "Capture",
**so that** Markdown появится в панели и я смогу скопировать его.

**Acceptance Criteria:**

- Клик по иконке расширения в toolbar:
  - Если панель закрыта → открывает Side Panel **и немедленно выполняет Capture** (как нажатие кнопки)
  - Если панель уже открыта → выполняет Capture (панель не закрывается)
- При отсутствии выделения в момент клика на иконку → панель открывается пустой, без сообщения об ошибке
- Кнопка "Capture Selection" внутри панели также выполняет capture вручную
- Результат отображается в preview-области панели
- Кнопка "Copy" записывает сырой Markdown в clipboard
- Относительные ссылки и изображения резолвятся в абсолютные URL

### US-2: Feedback при ошибках (v0.1)

**As a** пользователь,
**I want to** получить понятное сообщение при ошибке,
**so that** понимаю, что пошло не так.

**Acceptance Criteria:**

- Пустое выделение → панель показывает "Select text on the page first"
- Restricted page (chrome://, file://, Web Store) → "This page is not supported"
- Ошибка конвертации → "Something went wrong"

### US-3: Capture via Context Menu (v0.2)

**As a** пользователь,
**I want to** нажать ПКМ на выделенном тексте и выбрать "Copy as Markdown",
**so that** не нужно открывать панель — Markdown сразу в clipboard.

**Acceptance Criteria:**

- Пункт "Copy as Markdown" в контекстном меню при наличии выделения
- Конвертация + запись в clipboard минуя Side Panel
- Toast-уведомление на странице подтверждает успех

### US-4: Capture via Keyboard Shortcut (v0.2)

**As a** пользователь,
**I want to** нажать `Alt+M` для моментального копирования,
**so that** весь процесс — в одном жесте без отрыва от клавиатуры.

**Acceptance Criteria:**

- `Alt+M` (macOS: `Option+M`) конвертирует выделение → clipboard
- Toast-уведомление подтверждает успех
- При пустом выделении — toast с сообщением об ошибке

### US-5: Download as .md file (v0.2)

**As a** пользователь,
**I want to** скачать конвертированный Markdown как `.md`-файл из боковой панели,
**so that** могу сохранить его в свой проект без промежуточных шагов.

**Acceptance Criteria:**

- Кнопка "Download" в Side Panel, рядом с "Copy"
- Имя файла генерируется из `document.title` (sanitized)
- Файл сохраняется через `chrome.downloads`

### US-6: Append или Replace при повторном Capture (v0.1)

**As a** пользователь,
**I want to** при повторном захвате выбрать — заменить текущий результат или дополнить его,
**so that** могу собирать Markdown-документ из нескольких фрагментов с разных мест страницы (или разных вкладок).

**Acceptance Criteria:**

- Если preview пуст → Capture сразу заполняет preview (без вопросов)
- Если preview уже содержит текст → появляется выбор: "Replace" или "Append"
- Append добавляет новый фрагмент через разделитель `\n\n---\n\n` в конец текущего содержимого
- Replace полностью заменяет preview новым результатом
- Кнопка "Clear" позволяет вручную очистить preview
- Copy / Download всегда работают с полным содержимым preview (один или несколько фрагментов)

### US-7: Множественное выделение (v0.1) ✅

**As a** пользователь,
**I want to** выделить несколько фрагментов через Ctrl+Click (Cmd+Click на macOS) и захватить их одним Capture,
**so that** получаю единый Markdown-блок без необходимости делать Append вручную.

**Acceptance Criteria:**

- Если `selection.rangeCount > 1` — все ranges конвертируются и объединяются через `\n\n`
- Результат выглядит как единый документ, а не отдельные фрагменты с разделителями
- Если `rangeCount === 1` — поведение не меняется (обычный capture)
- Работает в Firefox-стиле (множественные ranges); в Chrome множественный selection ограничен — фиксируем ограничение в документации

### US-9: Rendered Markdown Preview (v0.1) ✅

**As a** пользователь,
**I want to** видеть rendered Markdown в панели вместо сырого текста,
**so that** сразу понимаю, как будет выглядеть результат, и легче проверять корректность конвертации.

**Acceptance Criteria:**

- Preview показывает рендеренный HTML: заголовки, жирный/курсив, ссылки, блоки кода, списки
- Переключатель **Preview / Source** позволяет увидеть сырой Markdown
- Кнопка "Copy" всегда копирует **сырой Markdown** (не HTML)
- "Add Metadata" вставляет frontmatter в сырой Markdown, rendered view обновляется
- Sanitization: HTML из рендерера не содержит `<script>`, `onclick` и пр.

### US-8: Добавление YAML frontmatter (v0.1)

**As a** пользователь,
**I want to** нажать кнопку в Side Panel, чтобы добавить YAML frontmatter к собранному Markdown,
**so that** документ содержит метаданные (заголовок, источник, дату) — готов для Obsidian / Jekyll / Hugo.

**Acceptance Criteria:**

- Кнопка "Add Metadata" (или toggle) в Side Panel
- Нажатие добавляет / обновляет YAML frontmatter **в начало** preview:
  ```yaml
  ---
  title: "Page Title"
  source: "https://example.com/article"
  date: "2026-03-16"
  ---
  ```
- `title` — берётся из `document.title` вкладки-источника
- `source` — URL вкладки-источника
- `date` — текущая дата в ISO формате (YYYY-MM-DD)
- Если frontmatter уже есть — кнопка обновляет его (не дублирует)
- Если preview пуст — кнопка неактивна
- Повторный Capture + Append не дублирует frontmatter (он всегда один, в начале)

---

## 5. Feature Specifications

### F1: Side Panel UI + Capture (v0.1)

**Почему Side Panel, а не Popup:**

| Аспект              | Popup                                  | Side Panel                                         |
| ------------------- | -------------------------------------- | -------------------------------------------------- |
| Selection           | Теряется при открытии (фокус уходит)  | Сохраняется (панель не крадёт фокус)               |
| Пространство        | ~300px, скролл                         | Полная высота окна                                 |
| Персистентность     | Закрывается при клике вне              | Открыта, пока пользователь не закроет              |
| Повторное использование | Каждый раз открывать заново        | Capture → Copy → Capture → Copy (rapid workflow)   |

**UI Side Panel (v0.1):**

```
┌───────────────────────────────────────┐
│  select2md       [◻ Preview] [≡ Source] │
├───────────────────────────────────────┤
│                                       │
│  [ 📋 Capture Selection ]             │  ← основная кнопка
│                                       │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐   │
│ │ Heading                         │   │  ← rendered HTML (Preview, default)
│ │                                 │   │
│ │ Paragraph with bold             │   │  или raw Markdown (Source)
│ │ and link                        │   │
│ │                                 │   │
│ │ ─────────────────────────────── │   │  ← разделитель (после Append)
│ │                                 │   │
│ │ Second fragment                 │   │
│ │ More text from another          │   │
│ │ selection...                    │   │
│ └─────────────────────────────────┘   │
│                                       │
│  [ Copy ]  [ Download ]  [×]          │  ← действия (Download — v0.2, × = Clear)
│  [ 📎 Add Metadata ]                  │  ← toggle: вставляет/обновляет YAML frontmatter
│                                       │
│  ✓ Copied!                            │  ← feedback (1.5 с)
│                                       │
├───────────────────────────────────────┤
│  Actions today: 12                    │  ← счётчик (подготовка к paywall)
└───────────────────────────────────────┘
```

**Append / Replace flow (при повторном Capture):**

```
┌───────────────────────────────┐
│  Preview already has content. │
│                               │
│  [ ＋ Append ]  [ ↻ Replace ] │
└───────────────────────────────┘
```

Инлайн-диалог появляется между кнопкой Capture и preview. Исчезает после выбора.

**Flow:**

1. Пользователь кликает иконку расширения → background вызывает `chrome.sidePanel.open()` (если закрыта) **и немедленно отправляет сигнал capture** (через `chrome.storage.session` или `sendMessage` после open); если панель уже открыта — отправляет только сигнал capture
2. Пользователь также может выделить текст на странице (панель не мешает) и кликнуть кнопку "Capture Selection" внутри панели
3. Сигнал capture → side panel отправляет `CAPTURE_SELECTION` через `chrome.tabs.sendMessage`; если выделения нет в момент клика на иконку → панель открывается пустой (без ошибки)
4. Content script извлекает HTML через `Selection API`:
   - Если `selection.rangeCount === 1` → один `cloneContents()` → `selectionToMarkdown()`
   - Если `selection.rangeCount > 1` → каждый range конвертируется отдельно, результаты объединяются через `\n\n` в единый блок
5. Content script возвращает Markdown + мета-информацию (page title, URL) → side panel получает результат
6. **Если preview пуст** → сразу отображает в rendered preview (режим Preview по умолчанию)
7. **Если preview уже содержит текст** → показывает inline-выбор: "Append" / "Replace"
   - Append → добавляет `\n\n---\n\n` + новый фрагмент к текущему содержимому
   - Replace → полностью заменяет preview
8. Кнопка "Copy" → `navigator.clipboard.writeText()` (весь контент preview, включая frontmatter если есть)
9. Кнопка "Clear" (×) → очищает preview, возврат в idle-состояние
10. Кнопка "Add Metadata" → вставляет/обновляет YAML frontmatter в начало preview

| Атрибут           | Значение                                                      |
| ----------------- | ------------------------------------------------------------- |
| Открытие панели   | Клик по иконке в toolbar                                      |
| Триггер capture   | Кнопка иконки расширения (toolbar) ИЛИ кнопка "Capture Selection" в панели |
| Input             | `window.getSelection()` через content script (1 или N ranges) |
| Multi-selection   | `rangeCount > 1` → каждый range конвертируется, объединение через `\n\n` |
| Output            | Markdown в preview → Copy / Download                          |
| Preview mode      | Rendered HTML по умолчанию; переключатель Source для raw Markdown |
| Повторный capture | Preview пуст → заполнить; есть контент → Append / Replace     |
| Metadata          | Кнопка "Add Metadata" → YAML frontmatter (title, source, date) в начало preview |
| Success           | Preview обновляется, кнопки активируются                      |
| Error             | Сообщение вместо preview                                      |

### F2: Context Menu + Keyboard Shortcut (v0.2)

Быстрый путь: Markdown сразу в clipboard, минуя Side Panel.

| Атрибут  | Значение                                      |
| -------- | --------------------------------------------- |
| Триггер  | ПКМ → "Copy as Markdown" / `Alt+M`            |
| Input    | `window.getSelection()` через content script   |
| Output   | Markdown в clipboard + toast на странице        |

**Flow (context menu):**

1. `chrome.contextMenus.create()` при `onInstalled` + `onStartup`
2. По клику → background отправляет `CAPTURE_SELECTION` в content script
3. Content script: конвертация → `navigator.clipboard.writeText()` → toast "Copied ✓"

**Flow (keyboard shortcut):**

1. `chrome.commands` ловит `Alt+M` → та же цепочка

**Примечание:** `info.selectionText` из contextMenus API даёт только plain text. Для сохранения форматирования обязателен запрос HTML через content script.

### F3: Monetization Scaffolding (встроено в v0.1)

Не влияет на UX, но закладывает инфраструктуру:

| Компонент     | Назначение                                                    | Где живёт      |
| ------------- | ------------------------------------------------------------- | -------------- |
| `counter.ts`  | Инкремент счётчика copy/download в `chrome.storage.local`     | `src/shared/`  |
| `gate.ts`     | `requestAction(type)` — сейчас `return true`, позже — paywall | `src/shared/` |
| `identity.ts` | UUID генерация при `onInstalled`, хранение в storage           | `src/shared/` |

Каждое действие (capture, copy, download) проходит через `requestAction()`. Счётчик отображается внизу Side Panel.

---

## 6. Edge Cases & Error Handling

### Restricted Pages

Content script не инжектится на:

- `chrome://` — системные страницы Chrome
- `chrome-extension://` — страницы других расширений
- `chrome.google.com/webstore` — Chrome Web Store
- `file://` — локальные файлы (требует отдельного permission)
- `about:` — служебные страницы

**Решение:** Side Panel проверяет URL активной вкладки через `chrome.tabs.query()` **до** отправки сообщения и показывает "This page is not supported".

```typescript
const RESTRICTED_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^file:\/\//,
  /^about:/,
  /^edge:\/\//,
];
```

### Service Worker засыпает (MV3)

Service Worker имеет ограниченный lifetime (~5 мин бездействия). Context menu и commands listener переживают перезапуск, но состояние в памяти теряется.

**Решение:** Не хранить состояние в service worker. Все данные — в `chrome.storage.local`. Context menu пересоздаётся в `onInstalled` + `onStartup`.

### Content Script не ответил

Timeout при отправке сообщения из side panel / background → content script.

**Решение:** Обернуть `chrome.tabs.sendMessage` в Promise с timeout (3 с). При timeout — показать "Unable to access this page. Try reloading."

### Пустое выделение

`selection.toString().trim() === ''`.

**Решение:** Content script возвращает `{ error: 'NO_SELECTION' }`. Side Panel показывает "Select text on the page first".

### Множественное выделение: ограничения Chrome

В отличие от Firefox, Chrome поддерживает только **один range** в Selection API (кроме `<input>` / `<textarea>`). `Ctrl+Click` в Chrome не создаёт дополнительные ranges, а заменяет текущий.

**Решение:**

- Код корректно обрабатывает `selection.rangeCount > 1` (Firefox, будущие изменения в Chrome)
- В Chrome `rangeCount` почти всегда `=== 1` — это штатное поведение, не ошибка
- Для сборки нескольких фрагментов в Chrome пользователь использует Append (повторный Capture)
- Не показывать предупреждение — просто конвертировать то, что есть

### Frontmatter: обновление при Append с другой вкладки

При Append фрагмента с другой вкладки `PageMeta` (title, url) отличается от первоначального.

**Решение:** Frontmatter содержит мета-данные **первого** capture. Кнопка "Add Metadata" всегда использует мета-данные последнего успешного capture. Если frontmatter уже существует — он обновляется на данные последнего capture. Пользователь сам решает, когда нажимать кнопку.

### Side Panel: навигация между вкладками

Side Panel привязан к окну, а не к вкладке. При переключении вкладки preview от предыдущей вкладки остаётся на экране.

**Решение:** Контент в preview **не очищается** при смене вкладки — пользователь может собирать фрагменты с разных вкладок через Append. Кнопка "Clear" (×) позволяет вручную сбросить preview. При нажатии Capture на новой вкладке — стандартная логика Append / Replace.

### Side Panel: вкладка закрыта или перезагружена

Content script на предыдущей вкладке недоступен.

**Решение:** При Capture — всегда запрашивать актуальную вкладку через `chrome.tabs.query({ active: true, currentWindow: true })`. Не кешировать tab ID.

---

## 7. Technical Requirements

| Параметр          | Требование                                                       |
| ----------------- | ---------------------------------------------------------------- |
| Manifest          | V3                                                               |
| Chrome            | 114+ (Side Panel API: Chrome 114+)                               |
| Permissions       | `sidePanel`, `activeTab`, `scripting`, `storage`                 |
| Optional perms    | `contextMenus` (v0.2), `downloads` (v0.2), `clipboardWrite`     |
| Bundle size       | < 500 KB total                                                   |
| Пакетный менеджер | Bun                                                              |
| Сборщик           | Vite (entry points: background, content, sidepanel)              |
| Язык              | TypeScript (strict mode)                                         |
| Ядро конвертации  | `@markitdown/core` — browser entry point                         |
| Markdown рендерер | `marked` (~3 KB gzip) + `DOMPurify` (~6 KB gzip) — rendered preview |

### Структура файлов

```
select2md/
├── src/
│   ├── background/
│   │   └── service-worker.ts       # onInstalled, context menu, commands, sidePanel config
│   ├── content/
│   │   └── content-script.ts       # Selection API → selectionToMarkdown(), toast
│   ├── sidepanel/
│   │   ├── sidepanel.html
│   │   ├── sidepanel.ts            # UI: capture, preview, copy, download, counter
│   │   └── sidepanel.css
│   └── shared/
│       ├── counter.ts              # Подсчёт использований
│       ├── gate.ts                 # requestAction() — paywall stub
│       ├── identity.ts             # UUID генерация + хранение
│       ├── messaging.ts            # Типизированные сообщения
│       └── restricted.ts           # Проверка restricted URLs
├── assets/
│   └── icons/                      # 16/48/128px
├── manifest.json
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### manifest.json (v0.1)

```json
{
  "manifest_version": 3,
  "name": "select2md",
  "version": "0.1.0",
  "description": "Convert selected text to clean Markdown",
  "permissions": ["sidePanel", "activeTab", "scripting", "storage"],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-script.js"]
    }
  ],
  "action": {
    "default_title": "select2md"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### Messaging Protocol

```typescript
// shared/messaging.ts

// Side Panel / Background → Content Script
type RequestMessage =
  | { type: 'CAPTURE_SELECTION' }
  | { type: 'COPY_TO_CLIPBOARD'; md: string };

// Content Script → Side Panel / Background
type ResponseMessage =
  | { type: 'SELECTION_RESULT'; md: string; meta: PageMeta }
  | { type: 'SELECTION_ERROR'; error: 'NO_SELECTION' | 'CONVERSION_FAILED' };

// Мета-данные страницы (для YAML frontmatter)
interface PageMeta {
  title: string;   // document.title
  url: string;     // window.location.href
  date: string;    // ISO date (YYYY-MM-DD)
}
```

---

## 8. Metrics (Success Criteria для Web Store)

| Метрика             | Цель                          |
| ------------------- | ----------------------------- |
| Install rate        | Органический рост, без оплаты |
| DAU / WAU           | Отслеживать с публикации      |
| 7-day retention     | ≥ 30%                         |
| Rating              | ≥ 4.5 ⭐                      |
| Crash-free sessions | ≥ 99%                         |
| Actions per user    | Трекать через `counter.ts`    |

---

## 9. Release Plan

### v0.1 — MVP: Side Panel + Capture + Copy

**Scope:** US-1, US-2, US-6, US-7, US-8, US-9, F1, F3

**Задачи:**

1. Настроить проект: `bun init`, Vite config с entry points (background, content, sidepanel)
2. `manifest.json` — permissions: `sidePanel`, `activeTab`, `scripting`, `storage`; секция `side_panel`; `content_scripts`
3. `service-worker.ts` — `chrome.action.onClicked`: открыть панель через `chrome.sidePanel.open()` + передать сигнал capture (через `chrome.storage.session` или `sendMessage` после open); при `onInstalled` — генерация UUID через `identity.ts`
4. `content-script.ts` — слушатель `CAPTURE_SELECTION`: извлечение HTML через `Selection API`, вызов `selectionToMarkdown()` из `@markitdown/core`, возврат markdown + `PageMeta` (title, url, date)
5. `content-script.ts` — поддержка множественного выделения: итерация по `selection.rangeCount`, конвертация каждого range, объединение через `\n\n`
6. `sidepanel.html` + `sidepanel.ts` — UI: кнопка "Capture Selection", rendered `<div>` для preview + hidden `<textarea>` для source, toggle-кнопка Preview/Source, кнопки "Copy", "Clear", "Add Metadata"
6a. `sidepanel.ts` — слушать сигнал capture от background (через `chrome.storage.session` onChanged или `chrome.runtime.onMessage`); обрабатывать как обычный capture (Append/Replace если preview не пуст)
7. `sidepanel.ts` — Append / Replace логика: если preview пуст → заполнить; если есть контент → inline-выбор "Append" / "Replace"; Append добавляет через `\n\n---\n\n`
8. `sidepanel.ts` — Copy: `navigator.clipboard.writeText()` (весь контент preview включая frontmatter), feedback "Copied ✓"
9. `sidepanel.ts` — Clear (×): очистка preview, возврат в idle
10. `sidepanel.ts` — Add Metadata: генерация YAML frontmatter из сохранённого `PageMeta`, вставка/обновление в начало preview; кнопка неактивна при пустом preview
11. `sidepanel.css` — минималистичный дизайн, тёмная/светлая тема (prefers-color-scheme)
12. `shared/restricted.ts` — детекция restricted URLs; side panel проверяет до отправки
13. `shared/counter.ts` — инкремент при copy; отображение "Actions today: N" внизу панели
14. `shared/gate.ts` — stub `requestAction()` → `return true`
15. `shared/identity.ts` — UUID при `onInstalled` в `chrome.storage.local`
16. `shared/messaging.ts` — типизированные request/response с `PageMeta`
17. `package.json` — добавить зависимости: `marked` (~3 KB gzipped), `dompurify` (~6 KB gzipped)
18. Ручное тестирование на 5+ сайтах: GitHub, Stack Overflow, MDN, Wikipedia, Medium

**Definition of Done:**

- Клик по иконке при закрытой панели → панель открывается И сразу выполняется Capture
- Клик по иконке при открытой панели → Capture выполняется (панель не закрывается)
- Клик по иконке без выделения → панель открывается пустой (без ошибки)
- Выделение → Capture → preview показывает рендеренный Markdown (режим Preview)
- Переключатель Preview/Source работает; Copy всегда копирует сырой Markdown
- Множественное выделение (Ctrl+Click) → один Capture → единый Markdown-блок (фрагменты через `\n\n`)
- Повторный Capture → выбор Append / Replace работает корректно
- Append собирает несколько фрагментов с разделителем `---`
- "Add Metadata" → YAML frontmatter появляется в начале preview; повторное нажатие обновляет, не дублирует
- Copy → весь контент preview (frontmatter + один или несколько фрагментов) в clipboard
- Clear → preview очищается
- Ошибки (restricted page, пустое выделение) — понятный фидбек
- Сбор фрагментов с разных вкладок работает (preview не очищается при смене вкладки)
- `counter.ts` инкрементирует при каждом copy

---

### v0.2 — Context Menu + Shortcut + Download

**Scope:** US-3, US-4, US-5, F2

**Задачи:**

1. `manifest.json` — добавить `contextMenus`, `downloads` в permissions; секцию `commands` с `Alt+M`
2. `service-worker.ts` — `chrome.contextMenus.create()` при `onInstalled` + `onStartup`
3. `service-worker.ts` — `chrome.commands.onCommand` для `Alt+M` → отправка `CAPTURE_SELECTION` в content script
4. `content-script.ts` — flow для context menu / shortcut: конвертация → `navigator.clipboard.writeText()` → toast (injected DOM-элемент, auto-dismiss 2 с)
5. `sidepanel.ts` — кнопка "Download": `Blob` + `chrome.downloads.download()`, имя файла из `document.title` (sanitize: спецсимволы, обрезка до 80 chars)
6. Тестирование: context menu, `Alt+M`, download, rapid-fire сценарии

**Definition of Done:**

- ПКМ → "Copy as Markdown" → clipboard + toast — работает
- `Alt+M` → clipboard + toast — работает
- Download сохраняет `.md` файл с осмысленным именем
- Все три пути (panel, context menu, shortcut) работают параллельно

---

### v1.0 — Chrome Web Store Release

**Scope:** Store listing, polish, legal

**Задачи:**

1. Иконки расширения: 16px, 48px, 128px (+ toolbar icon)
2. Промо-материалы: Store tile (440×280), скриншоты (1280×800) × 3-5 шт
3. Store listing: локализация на все 54 языка CWS (см. Приложение A)
4. Privacy Policy (hosted page) — данные не покидают браузер
5. Финальное тестирование на Chrome 114+, Windows / macOS / Linux
6. E2E тест: 10 популярных сайтов (GitHub, SO, MDN, Wikipedia, Medium, Dev.to, Habr, arXiv, Docs.\*, Notion public pages)
7. Минимизация permissions: проверить justification для каждого permission
8. Публикация в Chrome Web Store

**Definition of Done:**

- Расширение принято в Web Store
- Все permissions обоснованы
- Privacy Policy доступна по URL

---

### v2.0 — Post-Launch (планирование)

- **Настройки конвертации:** UI в Side Panel для math, footnotes, complexTableFallback
- **Notion / Obsidian коннекторы:** прямой экспорт в PKM-системы (модульные, платные)
- **Paywall:** активация `gate.ts` — лимит бесплатных действий в день
- **Статистика использования:** opt-in analytics
- **Full-page capture:** опция захвата `document.body`

---

## 10. Open Questions

| #   | Вопрос                                                                                                     | Влияние              | Когда решить |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------- | ------------ |
| 1   | `clipboardWrite` — нужен ли, или `navigator.clipboard.writeText()` работает из side panel без него?        | Permissions          | До v0.1      |
| 2   | `content_scripts` с `<all_urls>` или inject через `chrome.scripting.executeScript` по запросу?              | Permissions, ревью   | До v0.1      |
| 3   | Toast-уведомление (v0.2) — inject в DOM страницы или `chrome.notifications`?                               | UX                   | До v0.2      |
| 4   | `chrome.downloads.download()` — можно ли скачать без диалога выбора пути?                                  | UX                   | До v0.2      |
| 5   | Side Panel: `chrome.sidePanel.setOptions` per-tab или global? Влияет на поведение при смене вкладок        | Архитектура          | До v0.1      |
| 6   | Frontmatter при Append с нескольких источников: хранить все sources как массив, или только последний?       | UX metadata          | До v0.1      |

---

## Приложение A: Языки CWS Listing

Локализация Store listing (name, short description, detailed description) на все поддерживаемые языки Chrome Web Store:

| Код      | Язык                    |
| -------- | ----------------------- |
| en       | English (reference)     |
| am       | Amharic                 |
| ar       | Arabic                  |
| bg       | Bulgarian               |
| bn       | Bengali                 |
| ca       | Catalan                 |
| cs       | Czech                   |
| da       | Danish                  |
| de       | German                  |
| el       | Greek                   |
| es       | Spanish                 |
| es_419   | Spanish (Latin America) |
| et       | Estonian                |
| fa       | Persian                 |
| fi       | Finnish                 |
| fil      | Filipino                |
| fr       | French                  |
| gu       | Gujarati                |
| he       | Hebrew                  |
| hi       | Hindi                   |
| hr       | Croatian                |
| hu       | Hungarian               |
| id       | Indonesian              |
| it       | Italian                 |
| ja       | Japanese                |
| kn       | Kannada                 |
| ko       | Korean                  |
| lt       | Lithuanian              |
| lv       | Latvian                 |
| ml       | Malayalam               |
| mr       | Marathi                 |
| ms       | Malay                   |
| nl       | Dutch                   |
| no       | Norwegian               |
| pl       | Polish                  |
| pt_BR    | Portuguese (Brazil)     |
| pt_PT    | Portuguese (Portugal)   |
| ro       | Romanian                |
| ru       | Russian                 |
| sk       | Slovak                  |
| sl       | Slovenian               |
| sr       | Serbian                 |
| sv       | Swedish                 |
| sw       | Swahili                 |
| ta       | Tamil                   |
| te       | Telugu                  |
| th       | Thai                    |
| tr       | Turkish                 |
| uk       | Ukrainian               |
| vi       | Vietnamese              |
| zh_CN    | Chinese (Simplified)    |
| zh_TW    | Chinese (Traditional)   |

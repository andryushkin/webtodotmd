# PRD: @markitdown/core — Фазы разработки

Документ отслеживает поэтапную реализацию библиотеки.
Единственный источник правды по поведению: [`docs/LIBRARY_SPEC.md`](./LIBRARY_SPEC.md).

## Статусы

- `[ ]` — не начато
- `[~]` — в процессе
- `[x]` — завершено + тесты проходят

---

## Phase 0: Infrastructure ✅

Настройка проекта и инструментария.

- [x] `package.json` с exports (browser/server/cjs)
- [x] `tsconfig.json` (strict mode)
- [x] `tsup.config.ts` (два entry points: `src/browser.ts`, `src/server.ts`)
- [x] ESLint + Prettier конфигурация
- [x] Vitest конфигурация (node + browser mode)
- [x] Базовая структура `src/` и `tests/`

---

## Phase 1: Core Engine ✅

Фундамент всего конвертера.

- [x] DOM adapter interface + `setDOMAdapter()`
- [x] Rule system (`findRule`, применение правил, приоритеты 1–6)
- [x] Parser (рекурсивный обход: `convert()`, `convertChildren()`)
- [x] Sanitizer (удаление тегов, скрытые элементы, пустые обёртки)
- [x] Normalizer (финальная нормализация строки)
- [x] Whitespace Phase 1 — DOM-level collapsing (`[\t\n\v\f\r ]+` → ` `, исключая `<pre>/<code>/<textarea>/<kbd>/<samp>`)
- [x] Whitespace Phase 2 — flanking (`extractFlankingWhitespace()` в `src/utils/flanking.ts`)
- [x] Whitespace Phase 3 — output normalization (3+ `\n` → `\n\n`, trailing whitespace)
- [x] **Tests:** `tests/whitespace.test.ts` (13 кейсов), `tests/sanitizer.test.ts` (8 кейсов)

---

## Phase 2: Block Elements ✅

- [x] Headings (`<h1>`–`<h6>` → ATX `#`), `headingOffset` option, anchor stripping
- [x] Paragraphs (`<p>`), Breaks (`<br>` → `\\\n`), HR (`<hr>` → `---`), Div
- [x] Blockquotes (`<blockquote>` → `>`), nested blockquotes
- [x] **Tests:** `tests/headings.test.ts`, `tests/paragraphs.test.ts`, `tests/blockquote.test.ts`

---

## Phase 3: Lists

- [x] Unordered lists (`<ul>/<li>` → `-`)
- [x] Ordered lists (`<ol>/<li>` → `1.`)
- [x] Nested lists (сохранение уровней отступа)
- [x] **Tests:** `tests/lists.test.ts`

---

## Phase 4: Inline Elements

- [x] Strong (`<strong>/<b>` → `**`)
- [x] Em (`<em>/<i>` → `*`)
- [x] Del (`<del>/<s>` → `~~`)
- [x] Sub (`<sub>`), Sup (`<sup>`), Mark (`<mark>`)
- [x] Inline code (`<code>` вне `<pre>` → `` ` ``)
- [x] **Tests:** `tests/inline.test.ts`

---

## Phase 5: Links & Images

- [x] Links: абсолютные URL
- [x] Links: относительные URL (резолвинг через `options.baseUrl`)
- [x] Links: title атрибут
- [x] Links: autolinks, `mailto:`, `tel:`
- [x] Images: `src`, `data-src` (lazy loading), `alt`, `title`
- [x] **Tests:** `tests/links.test.ts`, `tests/images.test.ts`

---

## Phase 6: Code Blocks

- [x] Fenced code blocks (` ``` `)
- [x] Language detection (`class="language-*"`, `data-lang`)
- [x] Сохранение whitespace внутри `<pre>/<code>`
- [x] **Tests:** `tests/code.test.ts`

---

## Phase 7: Tables

- [x] Simple GFM pipe tables
- [x] Complex tables (colspan/rowspan) → fallback: `'html' | 'text' | 'skip'` (опция `complexTableFallback`)
- [x] **Tests:** `tests/tables.test.ts`

---

## Phase 8: Selection API ← КЛЮЧЕВАЯ ФИЧА

Приоритетный модуль — ядро Chrome Extension.

- [x] `selectionToMarkdown(selection: Selection, options?: MarkItDownOptions): string`
- [x] Partial Selection: нормализация произвольного DOM-фрагмента (Selection → DocumentFragment)
- [x] Sanitizer в режиме selection (не удалять `<nav>/<aside>` — контекст может быть нужен)
- [x] Граничные случаи: выделение пересекает несколько блоков, частично выделенные списки/таблицы
- [x] **Tests:** `tests/selection.test.ts`

---

## Phase 9: Build & Publish Validation ✅

- [x] Bundle size check (browser 4.1 KB gzip ✓, server 3.9 KB gzip ✓) — `scripts/size-check.ts`
- [x] `bun run attw` — все 4 сценария (node10, node16 CJS/ESM, bundler) 🟢
- [x] `bun run publint` — exports корректны (suggestion: добавить `license` поле)
- [x] Integration tests: `tests/integration/` (github, wikipedia, stackoverflow, arxiv) — 17 тестов
- [x] Performance benchmark: ~0.7 мс / 10 KB HTML в Bun+linkedom ✓ (цель < 30 мс) — `bench/index.ts`

---

## Phase 10: Math (после v1.0) ✅

- [x] KaTeX extraction (inline + display)
- [x] MathJax v2 (`<script type="math/tex">`) + v3 (`mjx-container`)
- [x] Wikipedia формулы (`<math alttext="...">`)
- [x] Sanitizer: защита `<script type="math/tex">` при `math=true`
- [x] **Tests:** `tests/math.test.ts` (7 кейсов)

---

## Phase 11: Footnotes (v2.0) ✅

- [x] Markdown footnote syntax `[^1]`
- [x] **Tests:** `tests/footnotes.test.ts`

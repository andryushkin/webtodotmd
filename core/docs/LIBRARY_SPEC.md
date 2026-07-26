# @markitdown/core — Полная техническая спецификация библиотеки

> Этот документ — единственный источник правды для реализации библиотеки `@markitdown/core`.
> Каждый модуль содержит пары **HTML → Markdown** (правильный и неправильный результат),
> граничные случаи и антипаттерны. Приоритет модулей соответствует порядку реализации.

---

## Содержание

1. [Архитектура и конвейер](#1-архитектура-и-конвейер)
2. [Модуль 1: Whitespace — нормализация пробелов](#2-модуль-whitespace)
3. [Модуль 2: Partial Selection — произвольное выделение](#3-модуль-partial-selection)
4. [Модуль 3: Tables — таблицы](#4-модуль-tables)
5. [Модуль 4: Images — изображения](#5-модуль-images)
6. [Модуль 5: Code — блоки кода](#6-модуль-code)
7. [Модуль 6: Math — формулы LaTeX](#7-модуль-math)
8. [Модуль 7: Headings — заголовки](#8-модуль-headings)
9. [Модуль 8: Inline — строчное форматирование](#9-модуль-inline)
10. [Модуль 9: Lists — списки](#10-модуль-lists)
11. [Модуль 10: Blockquotes — цитаты](#11-модуль-blockquotes)
12. [Модуль 11: Paragraphs и Breaks](#12-модуль-paragraphs)
13. [Модуль 12: Links — ссылки](#13-модуль-links)
14. [Модуль 13: Footnotes — сноски](#14-модуль-footnotes)
15. [Публичный API](#15-публичный-api)
16. [DOM-адаптер (мультирантайм)](#16-dom-адаптер)
17. [Sanitizer — очистка DOM](#17-sanitizer)
18. [Архитектура правил (Rule)](#18-архитектура-правил)
19. [Сборка и экспорты](#19-сборка-и-экспорты)
20. [Тестирование](#20-тестирование)

---

## 1. Архитектура и конвейер

### Двухэтапный pipeline

```
HTML string/Node
       │
       ▼
 ┌─────────────┐
 │  Sanitizer   │  Этап 1: удаление мусора, развёртка обёрток
 └──────┬──────┘
        │ clean DOM
        ▼
 ┌─────────────┐
 │   Parser     │  Этап 2: рекурсивный обход, применение правил
 └──────┬──────┘
        │ raw markdown string
        ▼
 ┌─────────────┐
 │  Normalizer  │  Этап 3: финальная нормализация whitespace в строке
 └──────┬──────┘
        │
        ▼
   Markdown string
```

### Порядок обхода DOM в Parser

```typescript
function convert(node: Node): string {
  // 1. Текстовый узел → нормализованный текст
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeTextNode(node);
  }

  // 2. Элемент → поиск правила по tagName
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const rule = findRule(el);
    // Правило получает элемент + результат рекурсии детей
    const childContent = convertChildren(el);
    return rule.replacement(el, childContent);
  }

  // 3. Прочие узлы (комментарии, CDATA) → пустая строка
  return '';
}

function convertChildren(el: Element): string {
  return Array.from(el.childNodes)
    .map((child) => convert(child))
    .join('');
}
```

---

## 2. Модуль Whitespace

> **ПРИОРИТЕТ: КРИТИЧЕСКИЙ.** Ошибки whitespace ломают весь markdown-вывод.
> Это фундамент, от которого зависят все остальные модули.

### 2.1. Три фазы нормализации

**Фаза 1 — DOM-level collapsing (в Sanitizer, ДО конвертации):**

Обход текстовых узлов. Сжатие последовательностей пробельных символов в один пробел.
Исключения: узлы внутри `<pre>`, `<code>`, `<textarea>`, `<kbd>`, `<samp>`.

**Фаза 2 — Flanking whitespace (В МОМЕНТ конвертации inline-элементов):**

При конвертации `<em>`, `<strong>`, `<code>`, `<a>` — перенос внутренних пробелов
наружу от Markdown-разделителей.

**Фаза 3 — Output normalization (ПОСЛЕ конвертации, на финальной строке):**

Сжатие 3+ переносов строк до ровно двух. Удаление trailing whitespace.
Единая пустая строка между блоками.

### 2.2. Фаза 1: DOM-level collapsing

#### Правило: какие символы сжимать

Сжимаем `[\t\n\v\f\r ]+` → ` ` (один пробел).

**НЕ сжимаем `\s`!** Потому что `\s` включает `\u00A0` (non-breaking space),
который имеет семантическое значение.

```
DO:  /[\t\n\v\f\r ]+/g  → ' '
DON'T:  /\s+/g  → ' '      ← ломает &nbsp;
```

#### Пример: обычный текст с лишними пробелами

```html
<!-- INPUT -->
<p>Привет, мир! Как дела?</p>
```

```markdown
<!-- ✅ DO: правильный результат -->

Привет, мир! Как дела?

<!-- ❌ DON'T: сохранять переносы и множественные пробелы -->

Привет, мир!
Как дела?
```

#### Пример: `<pre>` — сохранять как есть

```html
<!-- INPUT -->
<pre><code>function hello() {
    console.log("world");
}</code></pre>
```

```markdown
<!-- ✅ DO: пробелы в pre/code сохранены дословно -->
```

function hello() {
console.log("world");
}

```

<!-- ❌ DON'T: сжатие пробелов внутри pre -->
```

function hello() { console.log("world"); }

```

```

#### Пример: `<code>` inline — сохранять внутренние пробелы

```html
<!-- INPUT -->
<p>Вызовите <code>arr.map( x => x * 2 )</code> для трансформации.</p>
```

```markdown
<!-- ✅ DO -->

Вызовите `arr.map( x => x * 2 )` для трансформации.

<!-- ❌ DON'T: сжатие пробелов внутри inline code -->

Вызовите `arr.map( x => x * 2 )` для трансформации.
```

Примечание: внутри inline `<code>` пробелы считаются значимыми
(CSS `white-space: pre-wrap`). НЕ сжимать.

#### Пример: non-breaking space (`&nbsp;`)

```html
<!-- INPUT -->
<p>Цена:&nbsp;100&nbsp;руб.</p>
```

```markdown
<!-- ✅ DO: &nbsp; → обычный пробел в финальном markdown, НО не склеивать слова -->

Цена: 100 руб.

<!-- ❌ DON'T: удалять &nbsp; или склеивать -->

Цена:100руб.
```

**Решение:** `\u00A0` → ` ` (обычный пробел) при финальной нормализации,
но до этого он защищён от сжатия соседних пробелов.

### 2.3. Фаза 2: Flanking whitespace

> Правила CommonMark: emphasis-разделители (`*`, `_`, `**`, `__`) должны быть
> "left-flanking" (нет пробела сразу после открывающего) и
> "right-flanking" (нет пробела сразу перед закрывающим).

#### Пример: пробелы внутри `<em>`

```html
<!-- INPUT -->
<p>Слово <em> выделенное </em> продолжение</p>
```

```markdown
<!-- ✅ DO: пробелы вынесены за разделители -->

Слово _выделенное_ продолжение

<!-- ❌ DON'T: пробелы внутри разделителей — ломает CommonMark парсеры -->

Слово _ выделенное _ продолжение

<!-- ❌ DON'T: потеря пробелов — слова склеиваются -->

Слово*выделенное*продолжение
```

#### Алгоритм flanking whitespace extraction

```typescript
function extractFlankingWhitespace(content: string): {
  leading: string;
  trimmed: string;
  trailing: string;
} {
  const match = content.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return {
    leading: match[1],
    trimmed: match[2],
    trailing: match[3],
  };
}

// Использование в правиле для <em>:
function emReplacement(el: Element, childContent: string): string {
  const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
  if (!trimmed) return childContent; // пустой — не оборачивать
  return `${leading}*${trimmed}*${trailing}`;
}
```

#### Пример: вложенный bold + italic с пробелами

```html
<!-- INPUT -->
<p>
  Это <strong><em> важный текст </em></strong> конец.
</p>
```

```markdown
<!-- ✅ DO: пробелы вынесены за все разделители -->

Это **_важный текст_** конец.

<!-- ❌ DON'T: пробелы внутри -->

Это **_ важный текст _** конец.

<!-- ❌ DON'T: разделители врозь с пробелами между ними -->

Это ** _ важный текст _ ** конец.
```

#### Пример: ссылка с пробелами

```html
<!-- INPUT -->
<p>Смотри <a href="https://example.com"> здесь </a> подробнее.</p>
```

```markdown
<!-- ✅ DO -->

Смотри [здесь](https://example.com) подробнее.

<!-- ❌ DON'T -->

Смотри [ здесь ](https://example.com) подробнее.
```

### 2.4. Фаза 3: Output normalization

#### Правило: не более одной пустой строки подряд

```markdown
<!-- ✅ DO: ровно одна пустая строка между блоками -->

# Заголовок

Параграф первый.

Параграф второй.

<!-- ❌ DON'T: множественные пустые строки -->

# Заголовок

Параграф первый.

Параграф второй.
```

#### Правило: trailing whitespace

```markdown
<!-- ✅ DO: нет пробелов в конце строк (кроме намеренного <br>) -->

Строка текста.
Ещё строка.

<!-- ❌ DON'T: пробелы в конце строк -->

Строка текста.  
Ещё строка.
```

Исключение: `<br>` в середине блока → два пробела + `\n`.

#### Правило: финальный перенос строки

```markdown
<!-- ✅ DO: файл заканчивается ровно одним \n -->

Последняя строка.\n

<!-- EOF -->

<!-- ❌ DON'T: нет финального переноса -->

Последняя строка.<!-- EOF -->

<!-- ❌ DON'T: множественные финальные переносы -->

Последняя строка.\n\n\n

<!-- EOF -->
```

### 2.5. Граничные случаи whitespace

#### Пустой inline-элемент

```html
<!-- INPUT -->
<p>Слово<em></em> продолжение</p>
```

```markdown
<!-- ✅ DO: пустой элемент пропущен -->

Слово продолжение

<!-- ❌ DON'T: пустые разделители -->

Слово\*\* продолжение
```

#### Inline-элемент с одними пробелами

```html
<!-- INPUT -->
<p>Слово<strong> </strong>продолжение</p>
```

```markdown
<!-- ✅ DO: только пробелы → не оборачивать, вернуть пробелы -->

Слово продолжение

<!-- ❌ DON'T -->

Слово\*\* \*\*продолжение
```

#### Переносы строк в inline-контексте

```html
<!-- INPUT -->
<p>Первая строка вторая строка третья строка</p>
```

```markdown
<!-- ✅ DO: \n в обычном p → пробел (как в браузере) -->

Первая строка вторая строка третья строка

<!-- ❌ DON'T: сохранять переносы из исходника -->

Первая строка
вторая строка
третья строка
```

#### `<br>` — жёсткий перенос

```html
<!-- INPUT -->
<p>Строка первая<br />Строка вторая<br />Строка третья</p>
```

```markdown
<!-- ✅ DO: <br> → два пробела + \n (или обратный слеш + \n) -->

Строка первая  
Строка вторая  
Строка третья

<!-- ❌ DON'T: <br> → обычный перенос без маркера -->

Строка первая
Строка вторая
Строка третья
```

---

## 3. Модуль Partial Selection

> **ПРИОРИТЕТ: ВЫСОКИЙ.** Пользователь выделяет произвольный фрагмент на странице.
> `Range.cloneContents()` добавляет «мусорные» обёртки. Нужен пост-процессинг.

### 3.1. Проблема: что возвращает cloneContents()

Когда пользователь выделяет текст от середины `<p>` до середины `<li>`,
браузер клонирует **все** предки частично выделенных узлов:

```html
<!-- Исходный DOM -->
<p>Начало параграфа, <strong>середина</strong> и конец.</p>
<ul>
  <li>Первый пункт списка</li>
  <li>Второй пункт</li>
</ul>

<!-- Пользователь выделил: "середина и конец.\nПервый пункт" -->

<!-- cloneContents() вернёт: -->
<p><strong>середина</strong> и конец.</p>
<ul>
  <li>Первый пункт</li>
</ul>
```

Это нормально. Но бывают проблемные случаи.

### 3.2. Проблема: таблица из одной ячейки

```html
<!-- Пользователь выделил текст внутри одной ячейки таблицы -->
<!-- cloneContents() вернёт: -->
<table>
  <tbody>
    <tr>
      <td>выделенный текст</td>
    </tr>
  </tbody>
</table>
```

```markdown
<!-- ❌ DON'T: конвертировать как таблицу — бессмысленно -->

| выделенный текст |
| ---------------- |

<!-- ✅ DO: распознать single-cell fragment, вернуть только текст -->

выделенный текст
```

#### Правило: unwrap single-cell table

```typescript
function unwrapSingleCellTable(fragment: DocumentFragment): void {
  const tables = fragment.querySelectorAll('table');
  for (const table of tables) {
    const cells = table.querySelectorAll('td, th');
    if (cells.length === 1) {
      // Заменяем таблицу на содержимое единственной ячейки
      const cell = cells[0];
      const wrapper = fragment.ownerDocument.createElement('div');
      while (cell.firstChild) {
        wrapper.appendChild(cell.firstChild);
      }
      table.replaceWith(wrapper);
    }
  }
}
```

### 3.3. Проблема: single-child block wrapping

```html
<!-- cloneContents() обернул в лишние контейнеры -->
<div>
  <section>
    <article><p>Просто текст</p></article>
  </section>
</div>
```

```markdown
<!-- ✅ DO: развернуть до значимого элемента -->

Просто текст

<!-- ❌ DON'T: каждый уровень обёртки что-то добавляет -->

Просто текст

<!-- (Но с лишними пустыми строками или отступами) -->
```

#### Правило: unwrap single-child containers

```typescript
const UNWRAP_TAGS = new Set(['div', 'section', 'article', 'main', 'span', 'figure']);

function unwrapSingleChildContainers(root: Element): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const tag of UNWRAP_TAGS) {
      const els = root.querySelectorAll(tag);
      for (const el of els) {
        // Только если единственный child — элемент (не текст)
        const children = Array.from(el.childNodes).filter(
          (n) => n.nodeType !== Node.TEXT_NODE || n.textContent.trim(),
        );
        if (children.length === 1 && children[0].nodeType === Node.ELEMENT_NODE) {
          el.replaceWith(children[0]);
          changed = true;
        }
      }
    }
  }
}
```

### 3.4. Проблема: пустые элементы после клонирования

```html
<!-- Часть выделения попала на пустые обёртки -->
<div class="wrapper"></div>
<span></span>
<p>Реальный текст</p>
```

```markdown
<!-- ✅ DO: пустые элементы удалены -->

Реальный текст

<!-- ❌ DON'T: пустые строки от пустых элементов -->

Реальный текст
```

### 3.5. Проблема: дублированные id после клонирования

```html
<!-- cloneContents() клонирует атрибуты, включая id -->
<h2 id="section-1">Заголовок</h2>
```

**Правило:** удалять `id` из всех клонированных элементов (они не имеют смысла
во фрагменте и могут конфликтовать с оригиналом).

### 3.6. Проблема: выделение начинается/заканчивается посреди слова

```html
<!-- Пользователь выделил "dle of a para" из "middle of a paragraph" -->
<!-- cloneContents() вернёт: -->
<p>dle of a para</p>
```

```markdown
<!-- ✅ DO: вернуть как есть — это выбор пользователя -->

dle of a para

<!-- ❌ DON'T: пытаться «достроить» слова или добавить "..." -->

...dle of a para...
```

### 3.7. Полный pipeline нормализации фрагмента

```typescript
function normalizeFragment(fragment: DocumentFragment): DocumentFragment {
  const root = fragment;

  // 1. Удалить пустые элементы
  removeEmptyElements(root);

  // 2. Развернуть single-child контейнеры
  unwrapSingleChildContainers(root);

  // 3. Развернуть single-cell таблицы
  unwrapSingleCellTables(root);

  // 4. Удалить клонированные id
  root.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  // 5. Удалить клонированные aria-hidden (они не нужны для конвертации)
  root.querySelectorAll('[aria-hidden]').forEach((el) => el.removeAttribute('aria-hidden'));

  return root;
}
```

### 3.8. Извлечение HTML из выделения (для расширения)

```typescript
function getSelectionHTML(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.toString().trim() === '') {
    return null; // Нет выделения
  }

  const container = document.createElement('div');

  // Firefox поддерживает multiple ranges
  for (let i = 0; i < sel.rangeCount; i++) {
    container.appendChild(sel.getRangeAt(i).cloneContents());
  }

  return container.innerHTML;
}
```

**ВАЖНО для расширения:** `Selection` может быть потеряна при клике на UI расширения.
Всегда извлекать HTML **ДО** открытия side panel.

---

## 4. Модуль Tables

> **ПРИОРИТЕТ: ВЫСОКИЙ.** Таблицы — самый сложный элемент. Нужна трёхуровневая стратегия.

### 4.1. Уровни сложности таблиц

| Уровень | Признаки                                                             | Стратегия                      |
| ------- | -------------------------------------------------------------------- | ------------------------------ |
| Simple  | Нет colspan/rowspan, нет блочного контента в ячейках, есть `<thead>` | GFM pipe-таблица               |
| Medium  | Нет `<thead>`, или есть `<br>` в ячейках                             | GFM с синтетическим заголовком |
| Complex | colspan, rowspan, вложенные таблицы, блочный контент                 | HTML fallback                  |

### 4.2. Simple table

```html
<!-- INPUT -->
<table>
  <thead>
    <tr>
      <th>Имя</th>
      <th>Возраст</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Алиса</td>
      <td>30</td>
    </tr>
    <tr>
      <td>Боб</td>
      <td>25</td>
    </tr>
  </tbody>
</table>
```

```markdown
<!-- ✅ DO -->

| Имя   | Возраст |
| ----- | ------- |
| Алиса | 30      |
| Боб   | 25      |

<!-- ❌ DON'T: нет строки-разделителя -->

| Имя | Возраст |
| Алиса | 30 |
| Боб | 25 |

<!-- ❌ DON'T: лишние пробелы ломают парсер -->

| Имя | Возраст |
```

### 4.3. Table без `<thead>` — синтетический заголовок

```html
<!-- INPUT: нет thead, только tbody/tr -->
<table>
  <tr>
    <td>Алиса</td>
    <td>30</td>
  </tr>
  <tr>
    <td>Боб</td>
    <td>25</td>
  </tr>
</table>
```

```markdown
<!-- ✅ DO: первая строка становится заголовком -->

| Алиса | 30  |
| ----- | --- |
| Боб   | 25  |

<!-- ✅ ТАКЖЕ ДОПУСТИМО: пустой заголовок (опция) -->

|       |     |
| ----- | --- |
| Алиса | 30  |
| Боб   | 25  |

<!-- ❌ DON'T: таблица без строки-разделителя -->

| Алиса | 30 |
| Боб | 25 |
```

### 4.4. Table с выравниванием

```html
<!-- INPUT -->
<table>
  <thead>
    <tr>
      <th style="text-align: left">Имя</th>
      <th style="text-align: center">Статус</th>
      <th style="text-align: right">Сумма</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Алиса</td>
      <td>Активен</td>
      <td>100</td>
    </tr>
  </tbody>
</table>
```

```markdown
<!-- ✅ DO: выравнивание через двоеточия в разделителе -->

| Имя   | Статус  | Сумма |
| :---- | :-----: | ----: |
| Алиса | Активен |   100 |

<!-- ❌ DON'T: игнорировать выравнивание -->

| Имя   | Статус  | Сумма |
| ----- | ------- | ----- |
| Алиса | Активен | 100   |
```

### 4.5. Table с pipe в содержимом

```html
<!-- INPUT -->
<table>
  <thead>
    <tr>
      <th>Команда</th>
      <th>Описание</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>a | b</td>
      <td>Выбор: a или b</td>
    </tr>
  </tbody>
</table>
```

```markdown
<!-- ✅ DO: экранировать pipe внутри ячеек -->

| Команда | Описание       |
| ------- | -------------- |
| a \| b  | Выбор: a или b |

<!-- ❌ DON'T: неэкранированный pipe ломает структуру таблицы -->

| Команда | Описание |
| ------- | -------- | -------------- |
| a       | b        | Выбор: a или b |
```

### 4.6. Complex table → HTML fallback

```html
<!-- INPUT: colspan -->
<table>
  <tr>
    <th colspan="2">Заголовок на 2 колонки</th>
  </tr>
  <tr>
    <td>A</td>
    <td>B</td>
  </tr>
</table>
```

```markdown
<!-- ✅ DO: оставить как HTML (большинство MD-рендереров поддерживают inline HTML) -->
<table>
<tr><th colspan="2">Заголовок на 2 колонки</th></tr>
<tr><td>A</td><td>B</td></tr>
</table>

<!-- ❌ DON'T: пытаться конвертировать с потерей colspan -->

| Заголовок на 2 колонки |     |
| ---------------------- | --- |
| A                      | B   |

<!-- ❌ DON'T: дублировать ячейку для заполнения colspan -->

| Заголовок на 2 колонки | Заголовок на 2 колонки |
| ---------------------- | ---------------------- |
| A                      | B                      |
```

### 4.7. Определение сложности таблицы

```typescript
interface TableAnalysis {
  level: 'simple' | 'medium' | 'complex';
  hasHead: boolean;
  columns: number;
  rows: number;
}

function analyzeTable(table: Element): TableAnalysis {
  const hasColspan = !!table.querySelector('[colspan]');
  const hasRowspan = !!table.querySelector('[rowspan]');
  const hasNestedTable = !!table.querySelector('table table');
  const hasBlockContent = !!table.querySelector(
    'td > ul, td > ol, td > pre, td > blockquote, td > h1, td > h2, td > h3, td > h4, td > h5, td > h6, td > table',
  );
  const hasHead = !!table.querySelector('thead');
  const firstRow = table.querySelector('tr');
  const columns = firstRow ? firstRow.querySelectorAll('td, th').length : 0;
  const rows = table.querySelectorAll('tr').length;

  if (hasColspan || hasRowspan || hasNestedTable || hasBlockContent) {
    return { level: 'complex', hasHead, columns, rows };
  }

  if (!hasHead) {
    return { level: 'medium', hasHead, columns, rows };
  }

  return { level: 'simple', hasHead, columns, rows };
}
```

### 4.8. Partial table selection

```html
<!-- Пользователь выделил 2 ячейки из строки -->
<!-- cloneContents() вернёт: -->
<table>
  <tbody>
    <tr>
      <td>Ячейка 1</td>
      <td>Ячейка 2</td>
    </tr>
  </tbody>
</table>
```

```markdown
<!-- ✅ DO: одна строка без заголовка — конвертировать как текст через запятую
     или как минимальную таблицу с пустым заголовком -->

<!-- Вариант A (предпочтительный для 1 строки): -->

Ячейка 1 | Ячейка 2

<!-- Вариант B: -->

|          |          |
| -------- | -------- |
| Ячейка 1 | Ячейка 2 |

<!-- ❌ DON'T: бессмысленная таблица из одной строки с заголовком из данных -->

| Ячейка 1 | Ячейка 2 |
| -------- | -------- |
```

### 4.9. Таблица с `<br>` в ячейках

```html
<!-- INPUT -->
<table>
  <thead>
    <tr>
      <th>Колонка</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Строка 1<br />Строка 2<br />Строка 3</td>
    </tr>
  </tbody>
</table>
```

```markdown
<!-- ✅ DO: <br> → <br> в ячейке (GFM поддерживает HTML внутри ячеек) -->

| Колонка                          |
| -------------------------------- |
| Строка 1<br>Строка 2<br>Строка 3 |

<!-- ❌ DON'T: перенос строки ломает таблицу -->

| Колонка |
| ------- |

| Строка 1
Строка 2
Строка 3 |
```

---

## 5. Модуль Images

> **ПРИОРИТЕТ: СРЕДНИЙ (v2.0).** Основная сложность — lazy-load и `<picture>`.

### 5.1. Простое изображение

```html
<!-- INPUT -->
<img src="photo.jpg" alt="Закат над морем" title="Фото заката" />
```

```markdown
<!-- ✅ DO -->

![Закат над морем](photo.jpg 'Фото заката')

<!-- ❌ DON'T: потеря alt текста -->

![](photo.jpg)

<!-- ❌ DON'T: потеря title -->

![Закат над морем](photo.jpg)
```

### 5.2. Изображение без alt

```html
<!-- INPUT -->
<img src="icon.png" />
```

```markdown
<!-- ✅ DO: пустой alt, но синтаксис корректный -->

![](icon.png)

<!-- ❌ DON'T: голая ссылка без markdown-синтаксиса -->

icon.png
```

### 5.3. Lazy-loaded изображение (data-src)

```html
<!-- INPUT -->
<img
  src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  data-src="https://cdn.example.com/real-image.jpg"
  alt="Реальная картинка"
/>
```

```markdown
<!-- ✅ DO: взять URL из data-src (src — placeholder) -->

![Реальная картинка](https://cdn.example.com/real-image.jpg)

<!-- ❌ DON'T: использовать placeholder base64 -->

![Реальная картинка](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)
```

### 5.4. Приоритет извлечения URL

```typescript
function extractImageUrl(img: Element): string {
  // 1. data-src варианты (lazy-load)
  const lazySrc =
    img.getAttribute('data-src') ||
    img.getAttribute('data-original') ||
    img.getAttribute('data-lazy-src') ||
    img.getAttribute('data-full-src') ||
    img.getAttribute('data-hi-res-src');

  if (lazySrc) return lazySrc;

  // 2. srcset — выбрать максимальное разрешение
  const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
  if (srcset) {
    const best = parseSrcset(srcset);
    if (best) return best;
  }

  // 3. src — проверить что не placeholder
  const src = img.getAttribute('src') || '';
  if (src && !isPlaceholder(src)) return src;

  // 4. noscript fallback — искать img в соседнем <noscript>
  const noscript = img.nextElementSibling;
  if (noscript?.tagName === 'NOSCRIPT') {
    const match = noscript.textContent?.match(/src=["']([^"']+)["']/);
    if (match) return match[1];
  }

  return src; // fallback: вернуть что есть
}

function isPlaceholder(src: string): boolean {
  return (
    src.startsWith('data:image/') ||
    /placeholder|spacer|1x1|blank|loading/i.test(src) ||
    (src.length < 50 && src.startsWith('data:'))
  );
}
```

### 5.5. Элемент `<picture>`

```html
<!-- INPUT -->
<picture>
  <source srcset="photo.webp" type="image/webp" />
  <source srcset="photo.jpg" type="image/jpeg" />
  <img src="photo.jpg" alt="Фото" />
</picture>
```

```markdown
<!-- ✅ DO: использовать src из <img> (универсальный формат) -->

![Фото](photo.jpg)

<!-- ❌ DON'T: использовать webp (не все MD-рендереры поддерживают) -->

![Фото](photo.webp)
```

### 5.6. Относительные URL

```html
<!-- INPUT: baseUrl = "https://example.com/blog/post.html" -->
<img src="../images/photo.jpg" alt="Фото" />
```

```markdown
<!-- ✅ DO: резолвить относительный путь -->

![Фото](https://example.com/images/photo.jpg)

<!-- ❌ DON'T: оставлять относительный путь (markdown-файл не знает контекст) -->

![Фото](../images/photo.jpg)
```

**Примечание:** резолвинг URL — только если опция `baseUrl` передана.
Без неё — оставлять URL как есть.

### 5.7. Изображение-ссылка

```html
<!-- INPUT -->
<a href="https://example.com">
  <img src="logo.png" alt="Logo" />
</a>
```

```markdown
<!-- ✅ DO: вложенный синтаксис -->

[![Logo](logo.png)](https://example.com)

<!-- ❌ DON'T: потеря ссылки -->

![Logo](logo.png)

<!-- ❌ DON'T: потеря изображения -->

[Logo](https://example.com)
```

---

## 6. Модуль Code

> **ПРИОРИТЕТ: СРЕДНИЙ (v2.0).** Главная сложность — определение языка и line numbers.

### 6.1. Простой блок кода

```html
<!-- INPUT -->
<pre><code>const x = 42;
console.log(x);</code></pre>
```

````markdown
<!-- ✅ DO: fenced code block -->

```
const x = 42;
console.log(x);
```

<!-- ❌ DON'T: indented code block (менее надёжен для парсеров) -->

    const x = 42;
    console.log(x);
````

### 6.2. Код с указанием языка

```html
<!-- INPUT: Prism.js -->
<pre><code class="language-typescript">const x: number = 42;</code></pre>

<!-- INPUT: highlight.js -->
<pre><code class="hljs lang-python">print("hello")</code></pre>

<!-- INPUT: GitHub -->
<div class="highlight highlight-source-rust">
  <pre><code>fn main() { }</code></pre>
</div>
```

````markdown
<!-- ✅ DO: извлечь язык из class и передать в fence -->

```typescript
const x: number = 42;
```

```python
print("hello")
```

```rust
fn main() { }
```

<!-- ❌ DON'T: потерять указание языка -->

```
const x: number = 42;
```
````

### 6.3. Определение языка — паттерны

```typescript
const LANG_PATTERNS: Array<{ regex: RegExp; group: number }> = [
  { regex: /\blanguage-(\w+)\b/, group: 1 }, // Prism.js, стандартный HTML5
  { regex: /\blang-(\w+)\b/, group: 1 }, // Stack Overflow, highlight.js
  { regex: /\bhighlight-source-(\w+)\b/, group: 1 }, // GitHub
  { regex: /\bbrush:\s*(\w+)\b/, group: 1 }, // SyntaxHighlighter
  { regex: /\bsourceCode\s+(\w+)\b/, group: 1 }, // Pandoc
  { regex: /\bshj-lang-(\w+)\b/, group: 1 }, // Speed Highlight JS
  { regex: /\bprettyprint\s+lang-(\w+)\b/, group: 1 }, // Google Code Prettify
];

function detectLanguage(codeEl: Element): string | null {
  // Проверить <code>, потом <pre>, потом ближайший .highlight
  const targets = [codeEl, codeEl.parentElement, codeEl.closest('[class*="highlight"]')].filter(
    Boolean,
  ) as Element[];

  for (const target of targets) {
    // data-атрибуты приоритетнее
    const dataLang = target.getAttribute('data-lang') || target.getAttribute('data-language');
    if (dataLang) return dataLang.toLowerCase();

    const className = target.className;
    for (const { regex, group } of LANG_PATTERNS) {
      const match = className.match(regex);
      if (match) return match[group].toLowerCase();
    }
  }

  return null;
}
```

### 6.4. Код с line numbers — удаление

```html
<!-- INPUT: Prism.js line-numbers -->
<pre class="line-numbers"><code class="language-js">const a = 1;
const b = 2;</code><span class="line-numbers-rows"><span></span><span></span></span></pre>
```

````markdown
<!-- ✅ DO: line-numbers-rows удалены, только код -->

```js
const a = 1;
const b = 2;
```

<!-- ❌ DON'T: мусор от line numbers попадает в вывод -->

```js
const a = 1;
const b = 2;
```
````

**Правило:** Перед извлечением `textContent` из `<code>` — удалить все элементы
с классом `line-numbers-rows`, `linenumber`, `line-number`, `hljs-ln`,
а также `<td>` в таблицах line numbers.

### 6.5. Inline code

```html
<!-- INPUT -->
<p>Используйте <code>Array.from()</code> для преобразования.</p>
```

```markdown
<!-- ✅ DO -->

Используйте `Array.from()` для преобразования.
```

### 6.6. Inline code с обратными кавычками внутри

```html
<!-- INPUT -->
<p>Шаблон: <code>const tpl = `hello ${name}`;</code></p>
```

```markdown
<!-- ✅ DO: двойные обратные кавычки для экранирования -->

Шаблон: ``const tpl = `hello ${name}`;``

<!-- ❌ DON'T: одинарные кавычки ломают разметку -->

Шаблон: `const tpl = `hello ${name}`;`
```

### 6.7. Блок кода содержит тройные кавычки

````html
<!-- INPUT -->
<pre><code>```
nested fence
```</code></pre>
````

`````markdown
<!-- ✅ DO: использовать 4+ кавычки для внешнего забора -->

````
```
nested fence
```
````

<!-- ❌ DON'T: тройные кавычки ломаются -->

```

```

nested fence

```

```
`````

**Правило:** подсчитать максимальную серию кавычек в содержимом и использовать на 1 больше.

### 6.8. GitHub `<clipboard-copy>` shortcut

```html
<!-- INPUT: GitHub предоставляет готовый текст -->
<div class="highlight">
  <clipboard-copy value="fn main() {}"></clipboard-copy>
  <pre><code><span class="pl-k">fn</span> main() {}</code></pre>
</div>
```

```typescript
// ✅ DO: если есть clipboard-copy — использовать его value
const clipboardCopy = el.querySelector('clipboard-copy[value]');
if (clipboardCopy) return clipboardCopy.getAttribute('value');
// иначе fallback на textContent
```

---

## 7. Модуль Math

> **ПРИОРИТЕТ: СРЕДНИЙ (v2.0).** Включается опцией `math: true`.

### 7.1. KaTeX — самый простой случай

```html
<!-- INPUT: KaTeX inline -->
<span class="katex">
  <span class="katex-mathml">
    <math
      ><semantics>
        <mrow>...</mrow>
        <annotation encoding="application/x-tex">E = mc^2</annotation>
      </semantics></math
    >
  </span>
  <span class="katex-html" aria-hidden="true">...</span>
</span>
```

```markdown
<!-- ✅ DO: извлечь LaTeX из <annotation> -->

$E = mc^2$

<!-- ❌ DON'T: пытаться парсить визуальное представление katex-html -->

Emc2
```

### 7.2. KaTeX — display math

```html
<!-- INPUT: KaTeX display -->
<span class="katex-display">
  <span class="katex">
    <span class="katex-mathml">
      <math
        ><semantics>
          <mrow>...</mrow>
          <annotation encoding="application/x-tex">\int_0^\infty e^{-x} dx = 1</annotation>
        </semantics></math
      >
    </span>
    <span class="katex-html" aria-hidden="true">...</span>
  </span>
</span>
```

```markdown
<!-- ✅ DO: display math → $$ -->

$$\int_0^\infty e^{-x} dx = 1$$

<!-- ❌ DON'T: inline math для display формулы -->

$\int_0^\infty e^{-x} dx = 1$
```

### 7.3. MathJax v3 — с assistive MathML

```html
<!-- INPUT: MathJax v3 -->
<mjx-container class="MathJax" display="true">
  <!-- визуальный рендер -->
  <mjx-math>...</mjx-math>
  <!-- assistive MathML (наш источник) -->
  <mjx-assistive-mml>
    <math
      ><semantics>
        <mrow>...</mrow>
        <annotation encoding="application/x-tex">\sum_{i=1}^n i = \frac{n(n+1)}{2}</annotation>
      </semantics></math
    >
  </mjx-assistive-mml>
</mjx-container>
```

```markdown
<!-- ✅ DO -->

$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$
```

### 7.4. MathJax v2 — `<script type="math/tex">`

```html
<!-- INPUT: MathJax v2 -->
<script type="math/tex">
  E = mc^2
</script>
<script type="math/tex; mode=display">
  \int_0^1 f(x) dx
</script>
```

```markdown
<!-- ✅ DO -->

$E = mc^2$

$$\int_0^1 f(x) dx$$
```

### 7.5. Wikipedia / MediaWiki

```html
<!-- INPUT -->
<math alttext="{\displaystyle E=mc^{2}}">
  <semantics>
    <mrow>...</mrow>
    <annotation encoding="application/x-tex">E=mc^{2}</annotation>
  </semantics>
</math>
```

```markdown
<!-- ✅ DO -->

$E=mc^{2}$
```

### 7.6. Универсальный алгоритм извлечения

```typescript
function extractMath(el: Element): { latex: string; display: boolean } | null {
  // 1. Универсальный: <annotation encoding="application/x-tex">
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent) {
    const display =
      !!el.closest('.katex-display') ||
      el.getAttribute('display') === 'true' ||
      (el as HTMLElement).style?.display === 'block' ||
      el.closest('mjx-container')?.getAttribute('display') === 'true';
    return { latex: annotation.textContent.trim(), display };
  }

  // 2. MathJax v2: <script type="math/tex">
  if (el.tagName === 'SCRIPT') {
    const type = el.getAttribute('type') || '';
    if (type.startsWith('math/tex')) {
      return {
        latex: el.textContent?.trim() || '',
        display: type.includes('mode=display'),
      };
    }
  }

  // 3. Wikipedia: alttext
  const alttext = el.getAttribute('alttext');
  if (alttext && el.tagName === 'MATH') {
    // Убрать {\displaystyle ...} обёртку
    const cleaned = alttext.replace(/^\{\\displaystyle\s*(.+)\}$/, '$1');
    return { latex: cleaned, display: !!alttext.includes('\\displaystyle') };
  }

  return null;
}
```

### 7.7. Когда LaTeX недоступен

Если ни один из способов извлечения не сработал (нет `<annotation>`, нет
`<script type="math/tex">`, нет `alttext`), **не пытаться парсить визуальный HTML**.

```markdown
<!-- ✅ DO: вернуть как HTML или как alt-text -->
<!-- Если есть alt на img-fallback: -->

![E=mc²](math_equation.svg)

<!-- Или оставить HTML: -->

<span class="math">E=mc²</span>

<!-- ❌ DON'T: пытаться угадать LaTeX из визуального рендера -->

$Emc2$
```

---

## 8. Модуль Headings

### 8.1. Стандартные заголовки

```html
<!-- INPUT -->
<h1>Заголовок первого уровня</h1>
<h2>Заголовок второго уровня</h2>
<h6>Заголовок шестого уровня</h6>
```

```markdown
<!-- ✅ DO: ATX-style -->

# Заголовок первого уровня

## Заголовок второго уровня

###### Заголовок шестого уровня

<!-- ❌ DON'T: Setext-style (только h1/h2, менее читаемо) -->

# Заголовок первого уровня

## Заголовок второго уровня
```

### 8.2. Заголовок с inline-форматированием

```html
<!-- INPUT -->
<h2>Заголовок с <code>кодом</code> и <em>курсивом</em></h2>
```

```markdown
<!-- ✅ DO -->

## Заголовок с `кодом` и _курсивом_
```

### 8.3. Заголовок с якорной ссылкой (GitHub-style)

```html
<!-- INPUT: GitHub добавляет ссылку внутрь заголовка -->
<h2>
  <a href="#section" class="anchor" aria-hidden="true">#</a>
  Название секции
</h2>
```

```markdown
<!-- ✅ DO: убрать anchor-ссылку, оставить текст -->

## Название секции

<!-- ❌ DON'T: anchor попадает в текст -->

## [#](#section) Название секции
```

**Правило:** Удалять `<a class="anchor">`, `<a class="heading-link">` и аналогичные.

### 8.4. Пустой заголовок

```html
<h3></h3>
```

```markdown
<!-- ✅ DO: пропустить -->
<!-- (ничего) -->

<!-- ❌ DON'T -->

###
```

---

## 9. Модуль Inline

### 9.1. Bold

```html
<p>Это <strong>жирный</strong> и <b>тоже жирный</b> текст.</p>
```

```markdown
<!-- ✅ DO: оба тега → ** -->

Это **жирный** и **тоже жирный** текст.
```

### 9.2. Italic

```html
<p>Это <em>курсив</em> и <i>тоже курсив</i>.</p>
```

```markdown
<!-- ✅ DO -->

Это _курсив_ и _тоже курсив_.
```

### 9.3. Bold + Italic

```html
<p>
  Это <strong><em>жирный курсив</em></strong
  >.
</p>
<p>
  Это <em><strong>тоже</strong></em
  >.
</p>
```

```markdown
<!-- ✅ DO: три звёздочки -->

Это **_жирный курсив_**.

Это **_тоже_**.
```

### 9.4. Strikethrough

```html
<p>Это <del>зачёркнуто</del> и <s>тоже</s>.</p>
```

```markdown
<!-- ✅ DO: GFM strikethrough -->

Это ~~зачёркнуто~~ и ~~тоже~~.
```

### 9.5. Subscript / Superscript

```html
<p>H<sub>2</sub>O и E=mc<sup>2</sup></p>
```

```markdown
<!-- ✅ DO: HTML passthrough (нет стандартного MD-синтаксиса) -->

H<sub>2</sub>O и E=mc<sup>2</sup>

<!-- ❌ DON'T: терять форматирование -->

H2O и E=mc2
```

### 9.6. Вложенные inline-элементы

```html
<p>
  Это
  <strong
    >жирный <em>и курсив <code>и код</code></em></strong
  >.
</p>
```

```markdown
<!-- ✅ DO -->

Это **_жирный и курсив `и код`_**.

<!-- ❌ DON'T: ломать порядок закрытия -->

Это **жирный _и курсив `и код`_**.
```

### 9.7. Экранирование спецсимволов Markdown

```html
<p>Цена: 3 * 4 = 12. Скидка 10%.</p>
```

```markdown
<!-- ✅ DO: экранировать * если она не часть форматирования -->

Цена: 3 \* 4 = 12. Скидка 10%.

<!-- ❌ DON'T: неэкранированный * может создать курсив -->

Цена: 3 \* 4 = 12. Скидка 10%.
```

Символы для экранирования: `\`, `` ` ``, `*`, `_`, `{`, `}`, `[`, `]`, `(`, `)`, `#`, `+`, `-`, `.`, `!`, `|`

**Но только в контексте, где они могут быть интерпретированы как Markdown!**
Например, `*` между не-пробельными символами в начале строки — нужно экранировать.
`*` в середине слова (как в `3*4`) — тоже.

---

## 10. Модуль Lists

### 10.1. Unordered list

```html
<ul>
  <li>Пункт 1</li>
  <li>Пункт 2</li>
  <li>Пункт 3</li>
</ul>
```

```markdown
<!-- ✅ DO -->

- Пункт 1
- Пункт 2
- Пункт 3

<!-- ❌ DON'T: лишняя пустая строка между пунктами (если в HTML её нет) -->

- Пункт 1

- Пункт 2

- Пункт 3
```

### 10.2. Ordered list

```html
<ol>
  <li>Первый</li>
  <li>Второй</li>
  <li>Третий</li>
</ol>
```

```markdown
<!-- ✅ DO -->

1. Первый
2. Второй
3. Третий

<!-- ❌ DON'T: все единицы (хотя CommonMark это допускает, нумерация читаемее) -->

1. Первый
1. Второй
1. Третий
```

### 10.3. Ordered list с `start`

```html
<ol start="5">
  <li>Пятый</li>
  <li>Шестой</li>
</ol>
```

```markdown
<!-- ✅ DO: сохранить начальный номер -->

5. Пятый
6. Шестой

<!-- ❌ DON'T -->

1. Пятый
2. Шестой
```

### 10.4. Вложенные списки

```html
<ul>
  <li>
    Уровень 1
    <ul>
      <li>
        Уровень 2
        <ul>
          <li>Уровень 3</li>
        </ul>
      </li>
    </ul>
  </li>
</ul>
```

```markdown
<!-- ✅ DO: 2 пробела для каждого уровня вложенности (или 4) — ГЛАВНОЕ КОНСИСТЕНТНО -->

- Уровень 1
  - Уровень 2
    - Уровень 3

<!-- ❌ DON'T: табы (ненадёжно между парсерами) -->

- Уровень 1
  - Уровень 2
    - Уровень 3

<!-- ❌ DON'T: нет отступа — парсер не поймёт вложенность -->

- Уровень 1
- Уровень 2
- Уровень 3
```

Используем **2 пробела** как единицу отступа. Это стандарт для `-` маркеров.

### 10.5. Список с параграфами внутри

```html
<ul>
  <li>
    <p>Первый параграф пункта.</p>
    <p>Второй параграф пункта.</p>
  </li>
  <li>
    <p>Простой пункт.</p>
  </li>
</ul>
```

```markdown
<!-- ✅ DO: "loose" list (пустые строки между пунктами) -->

- Первый параграф пункта.

  Второй параграф пункта.

- Простой пункт.
```

### 10.6. Task list (GFM)

```html
<ul>
  <li><input type="checkbox" checked disabled /> Сделано</li>
  <li><input type="checkbox" disabled /> Не сделано</li>
</ul>
```

```markdown
<!-- ✅ DO: GFM task list -->

- [x] Сделано
- [ ] Не сделано

<!-- ❌ DON'T: терять состояние чекбокса -->

- Сделано
- Не сделано
```

### 10.7. Список с кодом внутри

```html
<ul>
  <li>
    Установите:
    <pre><code>npm install markitdown</code></pre>
  </li>
</ul>
```

````markdown
<!-- ✅ DO: блок кода с отступом для списка -->

- Установите:

  ```
  npm install markitdown
  ```

<!-- ❌ DON'T: код без отступа выпадает из списка -->

- Установите:

```
npm install markitdown
```
````

---

## 11. Модуль Blockquotes

### 11.1. Простая цитата

```html
<blockquote>
  <p>Быть или не быть — вот в чём вопрос.</p>
</blockquote>
```

```markdown
<!-- ✅ DO -->

> Быть или не быть — вот в чём вопрос.

<!-- ❌ DON'T: нет маркера цитаты -->

Быть или не быть — вот в чём вопрос.
```

### 11.2. Многострочная цитата

```html
<blockquote>
  <p>Первый параграф цитаты.</p>
  <p>Второй параграф цитаты.</p>
</blockquote>
```

```markdown
<!-- ✅ DO: > перед каждым параграфом и пустой строкой -->

> Первый параграф цитаты.
>
> Второй параграф цитаты.

<!-- ❌ DON'T: > только на первой строке -->

> Первый параграф цитаты.

Второй параграф цитаты.
```

### 11.3. Вложенные цитаты

```html
<blockquote>
  <p>Внешняя цитата</p>
  <blockquote>
    <p>Внутренняя цитата</p>
  </blockquote>
</blockquote>
```

```markdown
<!-- ✅ DO -->

> Внешняя цитата
>
> > Внутренняя цитата
```

### 11.4. Цитата с форматированием

```html
<blockquote>
  <p><strong>Важно:</strong> это <em>критический</em> момент.</p>
  <ul>
    <li>Пункт 1</li>
    <li>Пункт 2</li>
  </ul>
</blockquote>
```

```markdown
<!-- ✅ DO -->

> **Важно:** это _критический_ момент.
>
> - Пункт 1
> - Пункт 2
```

---

## 12. Модуль Paragraphs

### 12.1. Параграфы

```html
<p>Первый параграф.</p>
<p>Второй параграф.</p>
```

```markdown
<!-- ✅ DO: разделение пустой строкой -->

Первый параграф.

Второй параграф.

<!-- ❌ DON'T: нет пустой строки — склеятся в один параграф -->

Первый параграф.
Второй параграф.
```

### 12.2. `<br>` внутри параграфа

```html
<p>Строка 1<br />Строка 2</p>
```

```markdown
<!-- ✅ DO: два пробела + newline -->

Строка 1  
Строка 2

<!-- ✅ ТАКЖЕ ДОПУСТИМО: backslash newline -->

Строка 1\
Строка 2

<!-- ❌ DON'T: простой перенос — CommonMark объединит в одну строку -->

Строка 1
Строка 2
```

### 12.3. `<hr>` — горизонтальная линия

```html
<hr />
```

```markdown
## <!-- ✅ DO -->

<!-- ✅ ТАКЖЕ ДОПУСТИМО -->

---

## <!-- ❌ DON'T: слишком короткая -->
```

### 12.4. `<div>` без семантики

```html
<div>Просто текст в div</div>
<div>Ещё текст</div>
```

```markdown
<!-- ✅ DO: как параграфы -->

Просто текст в div

Ещё текст

<!-- ❌ DON'T: сохранять div -->
<div>Просто текст в div</div>
```

---

## 13. Модуль Links

### 13.1. Обычная ссылка

```html
<a href="https://example.com">Пример</a>
```

```markdown
<!-- ✅ DO -->

[Пример](https://example.com)
```

### 13.2. Ссылка с title

```html
<a href="https://example.com" title="Подробнее">Пример</a>
```

```markdown
<!-- ✅ DO -->

[Пример](https://example.com 'Подробнее')
```

### 13.3. Autolink (текст === href)

```html
<a href="https://example.com">https://example.com</a>
```

```markdown
<!-- ✅ DO: autolink syntax -->

<https://example.com>

<!-- ✅ ТАКЖЕ ДОПУСТИМО: обычный синтаксис -->

[https://example.com](https://example.com)

<!-- ❌ DON'T: голый URL без форматирования -->

https://example.com
```

### 13.4. Ссылка с пустым href

```html
<a href="">Некуда</a>
```

```markdown
<!-- ✅ DO: просто текст без ссылки -->

Некуда

<!-- ❌ DON'T: пустая ссылка -->

[Некуда]()
```

### 13.5. Якорная ссылка

```html
<a href="#section-2">Перейти к секции 2</a>
```

```markdown
<!-- ✅ DO: сохранить якорную ссылку -->

[Перейти к секции 2](#section-2)
```

### 13.6. Ссылки с относительными путями

```html
<!-- baseUrl = "https://example.com/blog/" -->
<a href="../about">О нас</a>
```

```markdown
<!-- ✅ DO: резолвить если baseUrl передан -->

[О нас](https://example.com/about)

<!-- ✅ DO: оставить как есть если baseUrl не передан -->

[О нас](../about)
```

### 13.7. Email и tel ссылки

```html
<a href="mailto:user@example.com">Написать</a> <a href="tel:+79001234567">Позвонить</a>
```

```markdown
<!-- ✅ DO -->

[Написать](mailto:user@example.com)
[Позвонить](tel:+79001234567)
```

---

## 14. Модуль Footnotes

> **ПРИОРИТЕТ: НИЗКИЙ (v2.0+).** Сноски — расширение Markdown, не везде поддерживаются.

### 14.1. Простые сноски

```html
<p>
  Факт<sup><a href="#fn1" id="ref1">[1]</a></sup> в тексте.
</p>
<div class="footnotes">
  <ol>
    <li id="fn1">
      <p>Источник информации. <a href="#ref1">↩</a></p>
    </li>
  </ol>
</div>
```

```markdown
<!-- ✅ DO: Markdown footnote syntax -->

Факт[^1] в тексте.

[^1]: Источник информации.

<!-- ❌ DON'T: потеря сносок -->

Факт в тексте.
```

---

## 15. Публичный API

```typescript
/** Адаптер: функция, парсящая HTML-строку в Document */
type DOMAdapterFn = (html: string) => Document;

interface MarkItDownOptions {
  /** Базовый URL для резолвинга относительных путей */
  baseUrl?: string;
  /** Включить извлечение формул MathJax/KaTeX (default: false) */
  math?: boolean;
  /** Стратегия для сложных таблиц: 'html' | 'text' | 'skip' (default: 'html') */
  complexTableFallback?: 'html' | 'text' | 'skip';
  /** Пользовательские правила (добавляются с наивысшим приоритетом) */
  rules?: Rule[];
  /** DOM-адаптер (переопределяет глобальный) */
  domAdapter?: DOMAdapterFn;
}

/**
 * Конвертация HTML → Markdown.
 * Принимает HTML-строку или DOM-узел.
 */
function toMarkdown(input: string | Node, options?: MarkItDownOptions): string;

/**
 * Глобальная установка DOM-адаптера (для Node.js / Bun).
 * В браузере не нужна — используется нативный DOMParser.
 */
function setDOMAdapter(adapter: DOMAdapterFn): void;

/**
 * Утилита для работы с Selection API (только браузер).
 * Извлекает HTML выделения, нормализует фрагмент, конвертирует.
 */
function selectionToMarkdown(selection: Selection, options?: MarkItDownOptions): string;
```

### Примеры использования

```typescript
// Браузер — нулевой overhead, DOMParser нативный
import { toMarkdown } from '@markitdown/core';
const md = toMarkdown('<h1>Привет</h1>');
// Результат: '# Привет\n'

// Node.js / Bun — подключаем адаптер
import { toMarkdown, setDOMAdapter } from '@markitdown/core';
import { parseHTML } from 'linkedom';

setDOMAdapter((html) => {
  const { document } = parseHTML(html);
  return document;
});

const md = toMarkdown('<strong>Bold</strong>');
// Результат: '**Bold**\n'

// С опциями
const md2 = toMarkdown(complexHtml, {
  baseUrl: 'https://example.com/blog/',
  math: true,
  complexTableFallback: 'html',
});

// Пользовательское правило
const md3 = toMarkdown(html, {
  rules: [
    {
      filter: (el) => el.tagName === 'MARK',
      replacement: (el, content) => `==${content}==`,
    },
  ],
});
```

---

## 16. DOM-адаптер

### Автодетекция (серверная сборка)

```typescript
let globalAdapter: DOMAdapterFn | null = null;

function getAdapter(): DOMAdapterFn {
  if (globalAdapter) return globalAdapter;

  // Браузер — нативный DOMParser
  if (typeof globalThis.DOMParser !== 'undefined') {
    return (html) => {
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    };
  }

  // Авто-поиск серверных адаптеров (ленивый import)
  throw new Error(
    '@markitdown/core: No DOM adapter found. ' +
      'Install linkedom or happy-dom, or call setDOMAdapter().',
  );
}
```

### Что НЕ делать

```typescript
// ❌ DON'T: hard dependency на серверную DOM-библиотеку
import { parseHTML } from 'linkedom'; // ← попадёт в браузерный бандл!

// ✅ DO: dynamic import только когда реально нужен
const adapter = async () => {
  const { parseHTML } = await import('linkedom');
  return (html: string) => {
    const { document } = parseHTML(html);
    return document;
  };
};
```

---

## 17. Sanitizer

### Теги для удаления (всегда)

```typescript
const REMOVE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'template',
  'svg', // SVG — если не нужен как изображение
]);
```

### Теги для удаления (по умолчанию, отключаемо)

```typescript
const REMOVE_STRUCTURAL = new Set(['nav', 'footer', 'aside', 'header']);
```

### Скрытые элементы

```typescript
function isHidden(el: Element): boolean {
  return (
    el.hasAttribute('hidden') ||
    el.getAttribute('aria-hidden') === 'true' ||
    el.getAttribute('style')?.includes('display: none') === true ||
    el.getAttribute('style')?.includes('display:none') === true ||
    el.getAttribute('style')?.includes('visibility: hidden') === true
  );
}
```

### Пустые обёртки

```typescript
const UNWRAP_IF_EMPTY = new Set(['div', 'span', 'section', 'article']);

function removeEmptyElements(root: Element): void {
  const els = root.querySelectorAll(Array.from(UNWRAP_IF_EMPTY).join(','));
  for (const el of els) {
    if (!el.textContent?.trim() && !el.querySelector('img, video, audio, table, pre')) {
      el.remove();
    }
  }
}
```

### Что sanitizer НЕ должен делать

```typescript
// ❌ DON'T: удалять <aside> если пользователь его выделил
// Sanitizer работает только на полностраничном контенте.
// Для Selection API — пропускаем структурную очистку.

// ❌ DON'T: удалять элементы с текстом
// <div style="display: none">Это скрытый текст, но он может быть нужен</div>
// → В контексте выделения — не удалять. В контексте полной страницы — удалять.
```

---

## 18. Архитектура правил

### Интерфейс Rule

```typescript
interface Rule {
  /** Имя правила (для дебага и переопределения) */
  name: string;

  /** Фильтр: к каким элементам применять правило */
  filter: string | string[] | ((el: Element) => boolean);

  /** Функция замены: элемент + содержимое детей → markdown-строка */
  replacement: (el: Element, childContent: string, options: MarkItDownOptions) => string;
}
```

### Приоритет правил

```
1. Пользовательские правила (options.rules)  ← наивысший
2. Специальные правила (math, footnotes)       если опция включена
3. Стандартные правила (headings, inline, lists, code, tables, images, blockquote, paragraphs)
4. Keep-правила (пропуск HTML как есть)
5. Remove-правила (script, style и т.д.)
6. Default fallback (textContent)              ← наименьший
```

### Пример реализации правила

```typescript
const headingRule: Rule = {
  name: 'heading',
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (el, content) => {
    const level = parseInt(el.tagName[1], 10);
    const trimmed = content.trim();
    if (!trimmed) return ''; // пустой заголовок → ничего
    const hashes = '#'.repeat(level);
    return `\n\n${hashes} ${trimmed}\n\n`;
  },
};
```

---

## 19. Сборка и экспорты

### package.json

```jsonc
{
  "name": "@markitdown/core",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "browser": {
        "types": "./dist/browser.d.ts",
        "default": "./dist/browser.mjs",
      },
      "bun": {
        "types": "./dist/server.d.ts",
        "default": "./dist/server.mjs",
      },
      "node": {
        "import": {
          "types": "./dist/server.d.ts",
          "default": "./dist/server.mjs",
        },
        "require": {
          "types": "./dist/server.d.cts",
          "default": "./dist/server.cjs",
        },
      },
      "default": {
        "types": "./dist/server.d.ts",
        "default": "./dist/server.mjs",
      },
    },
  },
  "peerDependencies": {
    "linkedom": ">=0.16",
    "happy-dom": ">=14",
  },
  "peerDependenciesMeta": {
    "linkedom": { "optional": true },
    "happy-dom": { "optional": true },
  },
}
```

### Разница между entry points

| Entry         | DOMParser         | Авто-поиск адаптеров      | Назначение                       |
| ------------- | ----------------- | ------------------------- | -------------------------------- |
| `browser.mjs` | Нативный, встроен | Нет                       | Бандлеры: Vite, esbuild, webpack |
| `server.mjs`  | Нет               | Да (linkedom → happy-dom) | Node.js, Bun, SSR                |
| `server.cjs`  | Нет               | Да                        | Legacy Node.js (require)         |

### Сборка: tsup

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { browser: 'src/browser.ts' },
    format: ['esm'],
    dts: true,
    outDir: 'dist',
    external: ['linkedom', 'happy-dom'],
    platform: 'browser',
    minify: true,
  },
  {
    entry: { server: 'src/server.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
    external: ['linkedom', 'happy-dom'],
    platform: 'node',
    minify: true,
  },
]);
```

### Валидация перед публикацией

```bash
# Проверить что типы корректны
npx @arethetypeswrong/cli --pack .

# Проверить package.json
npx publint

# Проверить размер бандла
npx bundlephobia-cli @markitdown/core
```

---

## 20. Тестирование

### Стратегия: snapshot-тесты

Каждый модуль имеет набор пар `{input: html, expected: markdown}`.
Тесты запускаются в двух рантаймах: Vitest (Node.js + browser mode) и `bun test`.

### Структура тестов

```
tests/
├── whitespace.test.ts
├── selection.test.ts
├── tables.test.ts
├── images.test.ts
├── code.test.ts
├── math.test.ts
├── headings.test.ts
├── inline.test.ts
├── lists.test.ts
├── blockquote.test.ts
├── paragraphs.test.ts
├── links.test.ts
├── footnotes.test.ts
├── sanitizer.test.ts
├── integration/
│   ├── github.test.ts      # Реальные фрагменты с GitHub
│   ├── stackoverflow.test.ts
│   ├── wikipedia.test.ts
│   ├── medium.test.ts
│   └── arxiv.test.ts       # Страницы с MathJax
└── fixtures/
    ├── github-code-block.html
    ├── wikipedia-table.html
    └── ...
```

### Формат тест-кейса

````typescript
import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../src/index.js';

describe('whitespace', () => {
  it('collapses multiple spaces in regular text', () => {
    expect(toMarkdown('<p>hello    world</p>')).toBe('hello world\n');
  });

  it('preserves whitespace in <pre>', () => {
    expect(toMarkdown('<pre><code>  two spaces\n    four</code></pre>')).toBe(
      '```\n  two spaces\n    four\n```\n',
    );
  });

  it('moves flanking whitespace outside emphasis', () => {
    expect(toMarkdown('<p><em> hello </em></p>')).toBe(' *hello* \n');
  });
});
````

### Целевые метрики

| Метрика                                         | Цель    |
| ----------------------------------------------- | ------- |
| Размер browser entry (gzip)                     | < 15 KB |
| Размер server entry (gzip, без DOM-адаптера)    | < 20 KB |
| Время конвертации (браузер, 10 KB HTML)         | < 50 мс |
| Время конвертации (Bun + linkedom, 10 KB HTML)  | < 30 мс |
| Покрытие тестами                                | > 90%   |
| Тесты проходят в Node.js 20+                    | ✓       |
| Тесты проходят в Bun latest                     | ✓       |
| Тесты проходят в браузере (Vitest browser mode) | ✓       |
| Zero hard dependencies                          | ✓       |

import type { Rule } from '../types.js';

/**
 * The task box belonging to this item, never one belonging to an item nested
 * under it.
 *
 * The same shape as `ownParts()` in the sanitizer, and for the same reason: a
 * `querySelectorAll` inside a container that can hold containers of its own
 * answers about all of them, and the nearest enclosing one is what says whose a
 * part is.
 */
function ownCheckbox(item: Element): Element | null {
  for (const box of Array.from(item.querySelectorAll('input[type="checkbox"]'))) {
    if (box.closest('li') === item) return box;
  }
  return null;
}

/**
 * Which of the two ordered markers this list writes, `.` or `)`.
 *
 * A blank line does not end a list — CommonMark ends one only when the delimiter
 * changes — so two `<ol>`s the page drew apart came back as one. The page's own
 * numbering went with them: `<ol start="9">` written under a list that had ended
 * at 2 was renumbered 3 and 4, and the `9.` and `10.` the case exists to show
 * were gone from the rendered file while the source still spelled them.
 *
 * Alternating by the length of the run of lists before this one keeps every pair
 * of neighbours apart, and `start` survives on both, which is the whole of what
 * was lost. A list nobody put a list beside writes the ordinary `.`.
 */
function orderedDelimiter(list: Element): '.' | ')' {
  let run = 0;
  for (let prev = list.previousElementSibling; prev; prev = prev.previousElementSibling) {
    if (prev.tagName.toLowerCase() !== 'ol') break;
    run += 1;
  }
  return run % 2 === 0 ? '.' : ')';
}

export const LIST_RULES: Rule[] = [
  {
    name: 'list-item',
    filter: 'li',
    replacement(el, childContent) {
      const parent = el.parentElement;
      const isOrdered = parent?.tagName.toLowerCase() === 'ol';

      let marker: string;
      if (isOrdered) {
        // A `start` no number can be read out of — `start="x"`, `start=""` — is
        // ignored by the browser, which numbers from 1; unguarded it wrote the
        // literal `NaN. ` in front of every item. `0` and `-2` do parse and are
        // legal, so only the unreadable case falls back. Same guard as
        // `itemOrdinal()` in `src/browser.ts`, which reads the same attribute.
        const parsed = parseInt(parent?.getAttribute('start') ?? '1', 10);
        const start = Number.isNaN(parsed) ? 1 : parsed;
        const siblings = Array.from(parent?.children ?? []).filter(
          (c) => c.tagName.toLowerCase() === 'li',
        );
        const index = siblings.indexOf(el as Element);
        const number = start + index;
        // A number Markdown has no marker for. CommonMark counts an ordered
        // marker as digits, so `-2.` is not one — the item became a paragraph
        // whatever was written, and two of them became *one* paragraph, welding
        // two lines the reader met separately. The number stays, because the page
        // drew it; the item stops pretending to be a list item.
        if (number < 0) {
          const own = childContent.trim();
          return own ? `\n\n${number}. ${own}\n\n` : '';
        }
        marker = `${number}${orderedDelimiter(parent!)} `;
      } else {
        marker = '- ';
      }

      // Task list: <input type="checkbox"> → [x] / [ ]
      //
      // This item's own box, never one belonging to an item nested under it. The
      // query walked the whole subtree, so a plain parent holding a task list
      // inherited its first child's state: `<li>Eighth item:<ul><li><input
      // checked>shipped</li></ul></li>` came back `- [x] Eighth item:` — a file
      // claiming *done* about an item the page never marked, and claiming it in
      // a checkbox a reader of the file cannot argue with.
      const checkbox = ownCheckbox(el as Element);
      const task = checkbox ? (checkbox.hasAttribute('checked') ? '[x] ' : '[ ] ') : '';

      const trimmed = childContent.trim();
      if (!trimmed) return '';

      // Indented by the marker alone, never by the task marker beside it: `[x] `
      // is the first thing *in* the content, not part of the bullet, so the
      // content column is still after `- ` or `8. `. Counting it in put a nested
      // list four columns past that column — the indented-code threshold — and
      // the reader got the sub-items as one line of literal text, `- shipped` and
      // all. A second paragraph under the same item fared worse and came out a
      // code block.
      const indent = ' '.repeat(marker.length);
      const prefix = marker + task;
      const content = trimmed.replace(/\n/g, `\n${indent}`);
      return `\n${prefix}${content}`;
    },
  },
  {
    name: 'list',
    filter: ['ul', 'ol'],
    replacement(el, childContent) {
      const trimmed = childContent.trim();
      if (!trimmed) return '';
      // Nested inside <li>: no \n\n padding, let the <li> rule handle indentation
      if (el.parentElement?.tagName.toLowerCase() === 'li') {
        return `\n${trimmed}`;
      }
      return `\n\n${trimmed}\n\n`;
    },
  },
];

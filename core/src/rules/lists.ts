import type { Rule } from '../types.js';

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
        marker = `${start + index}. `;
      } else {
        marker = '- ';
      }

      // Task list: <input type="checkbox"> → [x] / [ ]
      const checkbox = el.querySelector('input[type="checkbox"]');
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

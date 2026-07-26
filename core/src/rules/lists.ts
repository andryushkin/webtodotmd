import type { Rule } from '../types.js';

export const LIST_RULES: Rule[] = [
  {
    name: 'list-item',
    filter: 'li',
    replacement(el, childContent) {
      const parent = el.parentElement;
      const isOrdered = parent?.tagName.toLowerCase() === 'ol';

      let prefix: string;
      if (isOrdered) {
        const start = parseInt(parent?.getAttribute('start') ?? '1', 10);
        const siblings = Array.from(parent?.children ?? []).filter(
          (c) => c.tagName.toLowerCase() === 'li',
        );
        const index = siblings.indexOf(el as Element);
        prefix = `${start + index}. `;
      } else {
        prefix = '- ';
      }

      // Task list: <input type="checkbox"> → [x] / [ ]
      const checkbox = el.querySelector('input[type="checkbox"]');
      if (checkbox) {
        prefix += checkbox.hasAttribute('checked') ? '[x] ' : '[ ] ';
      }

      const trimmed = childContent.trim();
      if (!trimmed) return '';

      const indent = ' '.repeat(prefix.length);
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

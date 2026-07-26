import type { Rule } from '../types.js';

export const FOOTNOTE_RULES: Rule[] = [
  {
    name: 'footnote-ref',
    filter: (el) => el.tagName.toLowerCase() === 'sup' && !!el.querySelector('a[href^="#fn"]'),
    replacement: (el) => {
      const a = el.querySelector('a[href^="#fn"]');
      if (!a) return '';
      const href = a.getAttribute('href') ?? '';
      const key = href.slice('#fn'.length).replace(/^[-:]/, '');
      return `[^${key}]`;
    },
  },
  {
    name: 'footnotes-block',
    filter: (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag !== 'div' && tag !== 'section') return false;
      const cls = el.getAttribute('class') ?? '';
      return cls.includes('footnote') || el.getAttribute('role') === 'doc-endnotes';
    },
    replacement: () => '',
  },
];

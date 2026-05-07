import { marked } from '../../vendor/marked.esm.js';
import DOMPurify from '../../vendor/purify.esm.mjs';

export function stripMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  const clean = DOMPurify.sanitize(html);
  const tmp = document.createElement('div');
  tmp.innerHTML = clean;
  tmp.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  tmp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr')
    .forEach((el) => el.appendChild(document.createTextNode('\n')));
  return (tmp.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

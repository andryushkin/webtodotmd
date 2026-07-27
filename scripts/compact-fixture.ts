/**
 * Builds `docs/test_conversion_spec_page_compact.html` out of the spec page.
 *
 * The spec page explains itself: a grey strip above every case says what the
 * capture must show. That prose is most of its bytes, and in a whole-page
 * capture it is most of the output — so comparing screen against file means
 * reading past it, case by case, and a screenshot of one case at a time.
 *
 * The compact page is the same subjects with the explanations removed. One
 * screenshot holds the whole of what a reader sees; one select-all capture holds
 * the whole of what the converter writes; the two can be laid side by side.
 *
 * Case labels are drawn with `content: attr(data-case)`, which is generated
 * content: it is on the screen and in the screenshot, and it is in no DOM node,
 * so it cannot reach the capture. That is also a live check of the rule — the
 * only generated content the converter writes is the pair of marks a `<q>` draws.
 *
 * Regenerate after editing the spec page: `bun scripts/compact-fixture.ts`.
 */
import { parseHTML } from 'linkedom';

const SOURCE = 'docs/test_conversion_spec_page.html';
const TARGET = 'docs/test_conversion_spec_page_compact.html';

const source = await Bun.file(SOURCE).text();
const { document } = parseHTML(source);

// The spec page's own styles, minus the chrome the compact page has no elements
// for. Copied rather than rewritten: a subject styled differently in the two
// pages would convert differently, and then neither page could be trusted.
const styles = Array.from(document.querySelectorAll('head style'))
  .map((el) => el.textContent ?? '')
  .join('\n');

// Page-level scripts define the web component case Q6 converts.
const scripts = Array.from(document.querySelectorAll('body script'))
  .map((el) => `<script>${el.textContent ?? ''}</script>`)
  .join('\n');

const cases = Array.from(document.querySelectorAll('article.case')).map((article) => {
  const label = (article.querySelector('aside strong')?.textContent ?? '').replace(/\.$/, '');
  const subject = article.querySelector('.subject');
  const holdsFixed = subject?.classList.contains('holds-fixed') ? ' holds-fixed' : '';
  const plain = subject?.classList.contains('plain-semantics') ? ' plain-semantics' : '';
  return `<div class="case${holdsFixed}${plain}" data-case="${label}">\n${subject?.innerHTML ?? ''}\n</div>`;
});

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Text to .md — conversion spec, compact</title>
<style>
${styles}

  /* Everything below replaces the spec page's chrome. No headings, no prose:
     the point of this page is that a screenshot of it and a capture of it hold
     the same things in the same order. */
  body { background: var(--paper); }
  main { max-width: 980px; margin: 0 auto; padding: 1rem 1rem 4rem; }
  .case {
    position: relative;
    contain: layout;
    margin: 0 0 .75rem;
    padding: .5rem .75rem .5rem 3.25rem;
    border-top: 1px solid var(--line);
  }
  /* Generated content: on the screen, in the screenshot, in no DOM node — so it
     cannot reach the capture, and if it ever does, that is the defect this page
     would be the first to show. */
  .case::before {
    content: attr(data-case);
    position: absolute;
    left: .5rem;
    top: .5rem;
    width: 2.5rem;
    color: var(--muted);
    font: 700 .75rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .case.holds-fixed { min-height: 8.5rem; }
  .case > :first-child { margin-top: 0; }
  .case > :last-child { margin-bottom: 0; }
  .case blockquote, .case code, .case pre { /* inherit the spec page's rules */ }
</style>
</head>
<body>
<main>
${cases.join('\n\n')}
</main>
${scripts}
</body>
</html>
`;

// The spec page styles its subjects through `.subject`; the compact page has
// `.case` in that role, so the selectors are rewritten rather than duplicated.
await Bun.write(TARGET, page.replace(/\.subject\b/g, '.case'));
console.log(`${TARGET}: ${cases.length} cases`);

import type { Rule } from '../types.js';
import { escapeBlockStarts, escapeHtmlSyntax, escapeInlineMarkdown } from '../core/escape.js';

// Языковые паттерны §6.3
const LANG_PATTERNS = [
  /\blanguage-(\w+)\b/, // Prism.js, HTML5
  /\blang-(\w+)\b/, // highlight.js, SO
  /\bhighlight-source-(\w+)\b/, // GitHub
  /\bbrush:\s*(\w+)\b/, // SyntaxHighlighter
  /\bsourceCode\s+(\w+)\b/, // Pandoc
  /\bshj-lang-(\w+)\b/, // Speed Highlight JS
  /\bprettyprint\s+lang-(\w+)\b/, // Google Code Prettify
];

// Классы нумерации строк §6.4
const LINE_NUMBER_CLASSES = new Set(['line-numbers-rows', 'linenumber', 'line-number', 'hljs-ln']);

// The block's furniture, drawn inside the `<pre>` rather than around it: the bar
// naming the language, and the buttons that copy or download the sample.
// Perplexity writes `<pre><figure><figcaption>python …copy button…</figcaption>`,
// so reading the `<pre>` — which is what a `<code>` nested that deep forces —
// opened the file's code block with `pythondef hello(name):`. Neither is code:
// a caption labels the sample and a button is a control, and the caption is
// usually the language, which the fence has a place for.
const CHROME_TAGS = new Set(['figcaption', 'button']);

/**
 * What may follow the opening fence.
 *
 * The info string is written on the fence's own line, and `data-lang` is page
 * input with no shape imposed on it: a newline and three backticks in that
 * attribute closed the fence immediately, and everything below — the code, and
 * the rest of the document — was read as markup. An info string has no escape
 * syntax to hide that in, so the only encoding available is refusal.
 *
 * A language name is a token, so the pattern is one: letters and digits with the
 * punctuation real names carry (`c++`, `c#`, `objective-c`, `asp.net`), bounded
 * in length. Anything else is not a language anyone was going to highlight by,
 * and dropping it costs colour; keeping it costs the code block.
 */
const LANG_TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9+#._-]{0,31}$/;

function readLang(codeEl: Element | null, preEl: Element): string {
  if (codeEl) {
    const dl = codeEl.getAttribute('data-lang') ?? codeEl.getAttribute('data-language');
    if (dl) return dl.trim();
  }
  for (const target of [codeEl, preEl]) {
    if (!target) continue;
    const cls = target.getAttribute('class') ?? '';
    for (const re of LANG_PATTERNS) {
      const m = re.exec(cls);
      if (m?.[1]) return m[1];
    }
  }
  // The caption last, because it is the page's word rather than the
  // highlighter's: a `<figcaption>` reading `python` is the label above the
  // block, and `LANG_TOKEN` is what tells that from a sentence about the sample.
  return captionOf(preEl);
}

/**
 * The text of the block's own caption bar, if it has one — the label alone.
 *
 * The buttons live in that bar as often as beside it, and their text is not part
 * of the label: read whole, a `<figcaption>python<button>Copy</button>` gave the
 * info string `pythonCopy`, which is a language no highlighter has.
 */
function captionOf(preEl: Element): string {
  const bar = preEl.querySelector('figcaption');
  if (!bar) return '';
  const label = bar.cloneNode(true) as Element;
  removeChrome(label);
  return (label.textContent ?? '').trim();
}

// One gate for every source. The class patterns above already capture `\w+` and
// could not produce anything else, but a rule that holds in one place and is
// merely implied in the others is the shape this defect had to begin with.
function detectLang(codeEl: Element | null, preEl: Element): string {
  const lang = readLang(codeEl, preEl);
  return LANG_TOKEN.test(lang) ? lang : '';
}

// Everything below runs on a clone the rule makes once — tables.ts clones for
// exactly this reason: the page's own DOM has to come back the way it was found.
function removeLineNumbers(el: Element): void {
  for (const child of Array.from(el.children)) {
    const cls = child.getAttribute('class') ?? '';
    if (cls.split(/\s+/).some((c) => LINE_NUMBER_CLASSES.has(c))) {
      child.remove();
    }
  }
}

/** Takes the caption bar and the controls out of a clone, at any depth. */
function removeChrome(el: Element): void {
  for (const child of Array.from(el.querySelectorAll('figcaption, button'))) {
    if (CHROME_TAGS.has(child.tagName.toLowerCase())) child.remove();
  }
}

// `textContent` reads a <br> as nothing, so a <pre> that breaks its lines with
// them — plenty do, and so does anything that pasted HTML into a code sample —
// collapsed into one unreadable line. Read from a clone: the page's own DOM must
// come back unchanged.
// `rules/tables.ts` keeps a copy under the same name and says there why it is not
// an import: a cell is that module's business and the fenced block is this one's,
// and neither rule file depends on the other. Change one and change the other.
function textWithLineBreaks(el: Element): string {
  if (!el.querySelector('br')) return el.textContent ?? '';
  const clone = el.cloneNode(true) as Element;
  for (const br of Array.from(clone.querySelectorAll('br'))) {
    br.replaceWith(clone.ownerDocument!.createTextNode('\n'));
  }
  return clone.textContent ?? '';
}

const TEXT_NODE = 3;

/**
 * True when the `<code>` is everything the `<pre>` holds.
 *
 * The rule reads the `<code>` rather than the `<pre>` so that a highlighter's
 * line-number gutter, which sits inside it, can be stripped first. That
 * preference was unconditional, and a `<pre>` holding anything besides the
 * `<code>` lost it: `lost<br><code>kept</code>` — how a page writes a sample
 * whose tail is highlighted, and what anything that pasted markup into one
 * produces — came out as `kept`, and the first half of the block was gone
 * without a word.
 *
 * Whitespace around the `<code>` does not count against it. `<pre>` preserves
 * whitespace, so that is not free — but `<pre>\n<code>…</code>\n</pre>` is the
 * commonest shape there is, the newline is the page's indentation rather than
 * its code, and reading the `<pre>` for it would open every such block with a
 * blank line.
 */
function holdsNothingBut(pre: Element, code: Element): boolean {
  return Array.from(pre.childNodes).every(
    (child) =>
      child === code ||
      (child.nodeType === TEXT_NODE && (child.textContent ?? '').trim() === ''),
  );
}

function fenceChar(text: string): string {
  let max = 2; // минимум 3 бэктика
  for (const m of text.matchAll(/`+/g)) {
    if (m[0].length > max) max = m[0].length;
  }
  return '`'.repeat(max + 1);
}

export const CODE_RULES: Rule[] = [
  {
    name: 'fenced-code-block',
    // The fence is built from el.textContent; the subtree's Markdown is unused.
    ignoresChildContent: true,
    filter: 'pre',
    replacement(el) {
      const clip = el.querySelector('clipboard-copy[value]');
      const codeEl = el.querySelector('code');

      let text: string;
      if (clip) {
        text = clip.getAttribute('value') ?? '';
      } else {
        // One clone for the whole read, so neither the chrome nor the gutter is
        // taken off the page along with it.
        const pre = el.cloneNode(true) as Element;
        removeChrome(pre);
        const code = pre.querySelector('code');
        // The whole <pre> whenever it holds more than the one <code>; the <code>
        // alone otherwise, which is what lets its gutter be stripped. Either way
        // the gutter goes: it can sit in either element, and text the reader
        // never saw as code belongs in neither.
        const source = code && holdsNothingBut(pre, code) ? code : pre;
        removeLineNumbers(source);
        if (code && code !== source) {
          for (const nested of Array.from(source.querySelectorAll('code'))) {
            removeLineNumbers(nested);
          }
        }
        text = textWithLineBreaks(source);
      }

      text = text.replace(/\n$/, '');

      const lang = detectLang(codeEl, el);
      // What the caption said, where the fence had no room for it. A bar reading
      // `python` is the language and is now the info string; one reading anything
      // else is the page's own words about the sample, and it was on the screen —
      // so it stays, as the line it was drawn as rather than as a first line of
      // code. Escaped like any other text the page wrote: this rule ignores its
      // children, so nothing else here has escaped it.
      // The HTML pass after the Markdown one and the block pass last, which is
      // the order `convert()` uses on every other text node and the reason it
      // gives: run the other way round and the `\<` gains a backslash of its own.
      const caption = captionOf(el);
      const label = caption && caption !== lang
        ? `${escapeBlockStarts(escapeHtmlSyntax(escapeInlineMarkdown(caption)))}\n\n`
        : '';
      const fence = fenceChar(text);
      return `\n\n${label}${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  },
];

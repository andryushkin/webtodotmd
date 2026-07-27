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

/**
 * A class that is the language's bare name — `<code class="java">`.
 *
 * highlight.js writes it that way whenever the page tells it the language
 * outright, and so does every editor that stores the name and prints it as a
 * class: Habr's does, and ten code blocks of a Spring Boot article arrived as
 * fences with no language at all, the colour gone from every one of them.
 *
 * Answered from a list rather than from the shape of the word, because at this
 * point every other reading has already failed and what is left is an ordinary
 * class name. `snippet`, `code` and `highlight` all pass for a token, and a fence
 * opened with ```snippet claims something the page never said. The list is the
 * languages a highlighter actually ships with; a name outside it costs colour,
 * a wrong one costs the claim.
 */
const LANGUAGE_CLASSES = new Set([
  'bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'ps1', 'batch', 'cmd', 'awk', 'sed',
  'c', 'cpp', 'c++', 'objectivec', 'objective-c', 'csharp', 'c#', 'cs', 'swift', 'kotlin',
  'java', 'scala', 'groovy', 'dart', 'go', 'golang', 'rust', 'zig', 'nim', 'crystal',
  'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'coffeescript', 'vue', 'svelte',
  'python', 'py', 'ruby', 'rb', 'perl', 'php', 'lua', 'r', 'julia', 'matlab', 'octave',
  'elixir', 'erlang', 'clojure', 'haskell', 'ocaml', 'fsharp', 'f#', 'lisp', 'scheme',
  'prolog', 'fortran', 'cobol', 'pascal', 'delphi', 'ada', 'basic', 'vba', 'vbnet',
  'html', 'xml', 'svg', 'css', 'scss', 'sass', 'less', 'stylus',
  'sql', 'plsql', 'tsql', 'mysql', 'postgresql', 'pgsql', 'graphql', 'sparql', 'cypher',
  'json', 'json5', 'yaml', 'yml', 'toml', 'ini', 'properties', 'csv', 'tsv',
  'markdown', 'md', 'latex', 'tex', 'rst', 'asciidoc', 'org',
  'dockerfile', 'docker', 'makefile', 'cmake', 'gradle', 'nginx', 'apache',
  'terraform', 'hcl', 'puppet', 'ansible', 'kubernetes', 'k8s',
  'diff', 'patch', 'protobuf', 'thrift', 'graphviz', 'dot', 'mermaid',
  'asm', 'x86asm', 'wasm', 'verilog', 'vhdl', 'solidity', 'vim', 'http', 'regex',
  'plaintext', 'text', 'txt',
]);

/**
 * The bar a site draws above its code block, outside the `<pre>` instead of
 * inside it.
 *
 * `removeChrome` already knows this furniture — a label naming the language and a
 * button that copies the sample — but only where it sits within the `<pre>`, and
 * half the web writes it as a sibling: `<div class="code-block"><div class="code-
 * head"><span>python</span><button>Копировать</button></div><pre><code>…`. That
 * arrived as a paragraph reading `pythonКопировать`, a control's caption pasted
 * into the reader's document, and the fence below it opened with no language at
 * all although the page had just named one.
 *
 * The bar is *moved* rather than read: dropped into the `<pre>` as the
 * `<figcaption>` the page could have written, which is a shape this file already
 * has an answer for — `captionOf` reads it, `removeChrome` keeps it out of the
 * code, and `readLang` makes it the info string. One shape, one answer.
 *
 * Every condition here is a refusal to guess. The wrapper holds these two
 * elements and nothing else, so a toolbar belonging to a whole article is not
 * claimed by the first `<pre>` under it; what is left of the bar once its controls
 * are gone must be a language a highlighter really ships, so a `<div>` reading
 * `Example 3` keeps its place as text; and a heading is never taken, because a
 * `<h3>` above a sample is the author's, not the widget's.
 */
const HEADER_TAGS = new Set(['div', 'span', 'p', 'header']);
const CONTROLS = 'button, [role="button"], a[href], svg, input, select';

export function liftCodeHeaders(root: ParentNode): void {
  for (const pre of Array.from(root.querySelectorAll?.('pre') ?? [])) {
    const parent = pre.parentElement;
    if (!parent) continue;
    const siblings = Array.from(parent.children);
    if (siblings.length !== 2 || siblings[1] !== pre) continue;
    const bar = siblings[0]!;
    if (!HEADER_TAGS.has(bar.tagName.toLowerCase())) continue;
    const label = bar.cloneNode(true) as Element;
    for (const control of Array.from(label.querySelectorAll(CONTROLS))) control.remove();
    const name = (label.textContent ?? '').trim();
    if (!LANGUAGE_CLASSES.has(name.toLowerCase())) continue;
    const caption = pre.ownerDocument!.createElement('figcaption');
    caption.textContent = name;
    pre.insertBefore(caption, pre.firstChild);
    bar.remove();
  }
}

function namedLanguage(el: Element | null): string {
  if (!el) return '';
  for (const name of (el.getAttribute('class') ?? '').split(/\s+/)) {
    if (LANGUAGE_CLASSES.has(name.toLowerCase())) return name;
  }
  return '';
}

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
  for (const target of [codeEl, preEl]) {
    const named = namedLanguage(target);
    if (named) return named;
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
  removeControlsOutsideCode(el);
}

/**
 * A control the site draws inside the `<pre>` and outside the `<code>`.
 *
 * The same furniture as above wearing a different tag: Habr ends every code
 * block with `<div class="code-explainer"><a href="…">Объяснить с<img></a></div>`,
 * a button in everything but its tag name, and every sample in the article
 * closed with `}Объяснить с` — text pasted into the reader's code.
 *
 * Only outside the `<code>`, and only where there is one to be outside of. A
 * link *within* a sample is part of it — API documentation writes them — and a
 * `<pre>` with no `<code>` has nothing to draw the line from, so there the whole
 * of it is read as before.
 */
function removeControlsOutsideCode(el: Element): void {
  const code = el.querySelector('code');
  if (!code) return;
  for (const control of Array.from(el.querySelectorAll('a[href], [role="button"]'))) {
    if (!code.contains(control)) control.remove();
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
      // A caption that names a language is never a label line, whichever language
      // the fence ended up with. It is the same claim the info string carries, so
      // writing it above the block prints the widget's chrome as prose — and the
      // two disagree oftener than a comparison against `lang` can catch: a bar
      // reading `Python` beside a `language-python` class, a bar the site never
      // updated beside a class the highlighter did.
      const caption = captionOf(el);
      const label = caption && caption !== lang && !LANGUAGE_CLASSES.has(caption.toLowerCase())
        ? `${escapeBlockStarts(escapeHtmlSyntax(escapeInlineMarkdown(caption)))}\n\n`
        : '';
      const fence = fenceChar(text);
      return `\n\n${label}${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  },
];

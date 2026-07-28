import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('fenced code block', () => {
  it('базовый <pre><code>', () => {
    expect(toMarkdown('<pre><code>const x = 1;</code></pre>')).toBe('```\nconst x = 1;\n```\n');
  });

  it('<pre> без <code> — textContent', () => {
    expect(toMarkdown('<pre>raw text</pre>')).toBe('```\nraw text\n```\n');
  });

  it('trailing newline убирается', () => {
    expect(toMarkdown('<pre><code>const x = 1;\n</code></pre>')).toBe('```\nconst x = 1;\n```\n');
  });

  it('многострочный код', () => {
    expect(toMarkdown('<pre><code>line1\nline2\nline3</code></pre>')).toBe(
      '```\nline1\nline2\nline3\n```\n',
    );
  });
});

describe('language detection', () => {
  it('language- (Prism.js / HTML5)', () => {
    expect(toMarkdown('<pre><code class="language-typescript">const x = 1;</code></pre>')).toBe(
      '```typescript\nconst x = 1;\n```\n',
    );
  });

  it('lang- (highlight.js / SO)', () => {
    expect(toMarkdown('<pre><code class="lang-js">const x = 1;</code></pre>')).toBe(
      '```js\nconst x = 1;\n```\n',
    );
  });

  it('highlight-source- (GitHub)', () => {
    expect(toMarkdown('<pre><code class="highlight-source-python">x = 1</code></pre>')).toBe(
      '```python\nx = 1\n```\n',
    );
  });

  it('data-lang на <code>', () => {
    expect(toMarkdown('<pre><code data-lang="rust">fn main() {}</code></pre>')).toBe(
      '```rust\nfn main() {}\n```\n',
    );
  });

  it('data-language на <code>', () => {
    expect(toMarkdown('<pre><code data-language="go">fmt.Println("hello")</code></pre>')).toBe(
      '```go\nfmt.Println("hello")\n```\n',
    );
  });

  it('lang на <pre>', () => {
    expect(toMarkdown('<pre class="lang-bash"><code>echo hello</code></pre>')).toBe(
      '```bash\necho hello\n```\n',
    );
  });

  it('нет класса — без суффикса', () => {
    expect(toMarkdown('<pre><code>plain</code></pre>')).toBe('```\nplain\n```\n');
  });

  // The bare name, which is what highlight.js writes when the page hands it the
  // language outright — Habr's editor among others. Ten blocks of one article
  // came back as fences with no language at all.
  it('класс — просто имя языка', () => {
    expect(toMarkdown('<pre><code class="java">int x = 1;</code></pre>')).toBe(
      '```java\nint x = 1;\n```\n',
    );
    expect(toMarkdown('<pre><code class="hljs python">x = 1</code></pre>')).toBe(
      '```python\nx = 1\n```\n',
    );
  });

  // Habr closes every block with `<div class="code-explainer"><a>Объяснить
  // с<img></a></div>`, inside the `<pre>` — a button in all but its tag name, so
  // every sample in the article ended with `}Объяснить с`.
  it('контрол вне <code> не попадает в код', () => {
    const html =
      '<pre><code class="java">int x = 1;</code>' +
      '<div class="explainer"><a href="https://example.com/">Explain<img src="https://e/x.svg"></a></div></pre>';
    expect(toMarkdown(html)).toBe('```java\nint x = 1;\n```\n');
  });

  // Inside the sample it is the sample: API documentation links from its code.
  it('ссылка внутри <code> остаётся текстом кода', () => {
    const html = '<pre><code>see <a href="https://example.com/">docs</a> first</code></pre>';
    expect(toMarkdown(html)).toBe('```\nsee docs first\n```\n');
  });

  // A class that merely looks like a token is not a language: opening a fence
  // with ```snippet claims something the page never said, and a wrong name costs
  // more than a missing one.
  it('класс, не являющийся языком, языком не становится', () => {
    for (const cls of ['snippet', 'code-block', 'hljs', 'highlight', 'notranslate']) {
      expect(toMarkdown(`<pre><code class="${cls}">x</code></pre>`)).toBe('```\nx\n```\n');
    }
  });
});

describe('line numbers removal', () => {
  it('удаляет .line-numbers-rows', () => {
    const html = `<pre><code>const x = 1;<span class="line-numbers-rows"><span></span></span></code></pre>`;
    expect(toMarkdown(html)).toBe('```\nconst x = 1;\n```\n');
  });

  it('удаляет .linenumber', () => {
    const html = `<pre><code>foo<span class="linenumber">1</span></code></pre>`;
    expect(toMarkdown(html)).toBe('```\nfoo\n```\n');
  });

  it('удаляет .line-number', () => {
    const html = `<pre><code>bar<span class="line-number">1</span></code></pre>`;
    expect(toMarkdown(html)).toBe('```\nbar\n```\n');
  });

  it('удаляет .hljs-ln', () => {
    const html = `<pre><code>baz<table class="hljs-ln"></table></code></pre>`;
    expect(toMarkdown(html)).toBe('```\nbaz\n```\n');
  });
});

describe('backtick escaping в fenced blocks', () => {
  it('код содержит ``` — fence из 4 бэктиков', () => {
    const html = '<pre><code>use ``` here</code></pre>';
    const result = toMarkdown(html);
    expect(result).toBe('````\nuse ``` here\n````\n');
  });

  it('код содержит 4 бэктика — fence из 5 бэктиков', () => {
    const html = '<pre><code>```` nested ````</code></pre>';
    const result = toMarkdown(html);
    expect(result).toBe('`````\n```` nested ````\n`````\n');
  });

  it('код содержит одиночные бэктики — стандартный fence из 3', () => {
    const html = '<pre><code>`single`</code></pre>';
    const result = toMarkdown(html);
    expect(result).toBe('```\n`single`\n```\n');
  });
});

describe('clipboard-copy', () => {
  it('использует value атрибут', () => {
    const html = `<pre><clipboard-copy value="const x = 1;">...</clipboard-copy></pre>`;
    expect(toMarkdown(html)).toBe('```\nconst x = 1;\n```\n');
  });

  it('clipboard-copy с языком из <code>', () => {
    const html = `<pre><code class="language-js"></code><clipboard-copy value="const x = 1;">copy</clipboard-copy></pre>`;
    expect(toMarkdown(html)).toBe('```js\nconst x = 1;\n```\n');
  });
});

describe('inline code — backtick escaping', () => {
  it('обычный inline code', () => {
    expect(toMarkdown('<code>foo()</code>')).toBe('`foo()`\n');
  });

  it('inline code с бэктиком внутри — двойные + пробелы', () => {
    expect(toMarkdown('<code>`backtick`</code>')).toBe('`` `backtick` ``\n');
  });

  it('inline code с несколькими бэктиками', () => {
    expect(toMarkdown('<code>a`b`c</code>')).toBe('`` a`b`c ``\n');
  });

  it('flanking сохраняется при backtick escaping', () => {
    expect(toMarkdown('<p>use <code>`x`</code> here</p>')).toBe('use `` `x` `` here\n');
  });

  it('пустой inline code — без оборачивания', () => {
    expect(toMarkdown('<code></code>')).toBe('\n');
  });
});

// Правило предпочитало <code> самому <pre>, чтобы можно было снять нумерацию
// строк, которая лежит внутри <code>. Предпочтение было безусловным, и <pre> с
// чем-либо ещё внутри терял это «ещё»: `lost<br><code>kept</code>` доходил как
// `kept`, а первая половина блока пропадала молча.
describe('pre с br и code', () => {
  it.each([
    ['текст до <code>', '<pre>lost<br><code>kept</code></pre>', 'lost\nkept'],
    ['текст после <code>', '<pre><code>kept</code><br>lost</pre>', 'kept\nlost'],
    ['<code> посередине', '<pre>a<br><code>b</code><br>c</pre>', 'a\nb\nc'],
    ['два <code>', '<pre><code>a</code><br><code>b</code></pre>', 'a\nb'],
    ['перенос без <br>', '<pre>a\n<code>b</code></pre>', 'a\nb'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(`\`\`\`\n${expected}\n\`\`\``);
  });

  it('язык всё ещё читается с <code>', () => {
    expect(toMarkdown('<pre>lost<br><code class="lang-js">kept</code></pre>')).toBe(
      '```js\nlost\nkept\n```\n',
    );
  });

  // Пробелы вокруг <code> — отступ разметки, а не код: `<pre>\n<code>…` самая
  // частая форма, и чтение всего <pre> открывало бы такой блок пустой строкой.
  it('перевод строки вокруг <code> не делает <pre> составным', () => {
    expect(toMarkdown('<pre>\n<code>x</code>\n</pre>')).toBe('```\nx\n```\n');
  });

  // Нумерация строк может лежать и в <pre>, и в <code>; текст, которого читатель
  // не видел как код, не нужен ни там, ни там.
  it('нумерация строк снимается и в составном <pre>', () => {
    const html =
      '<pre>lost<br><code>kept<span class="line-numbers-rows"><span></span></span></code></pre>';
    expect(toMarkdown(html)).toBe('```\nlost\nkept\n```\n');
  });

  it('нумерация строк снимается с самого <pre>', () => {
    const html = '<pre><span class="linenumber">1</span>code<br>more</pre>';
    expect(toMarkdown(html)).toBe('```\ncode\nmore\n```\n');
  });
});

// Found by a manual pass over docs/test_faithfulness_page.html: `textContent`
// reads a <br> as nothing, so a <pre> that breaks its lines with them collapsed
// into one unreadable line. The selection path had been fixed for this; the rule
// itself, which is what a whole-page capture goes through, had not.
describe('<pre> that breaks lines with <br>', () => {
  it.each([
    ['bare pre', '<pre>a<br>b<br>c</pre>', 'a\nb\nc'],
    ['pre > code', '<pre><code>a<br>b</code></pre>', 'a\nb'],
    ['real newlines are untouched', '<pre><code>x = 1\ny = 2</code></pre>', 'x = 1\ny = 2'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(`\`\`\`\n${expected}\n\`\`\``);
  });
});

// A block's own furniture, drawn inside the `<pre>`: Perplexity writes the
// language and the copy button into a `<figcaption>` there, and with the `<code>`
// nested below a `<figure>` the rule read the whole `<pre>` — so the file's code
// block opened with `pythondef hello(name):`.
describe('the caption bar and the controls inside a <pre>', () => {
  const fig = (caption: string, code: string) =>
    `<pre><figure><figcaption>${caption}</figcaption><code>${code}</code></figure></pre>`;

  it('a caption naming the language becomes the info string', () => {
    expect(toMarkdown(fig('python', 'x = 1'))).toBe('```python\nx = 1\n```\n');
  });

  it('a caption that is not a language stays, as the line it was drawn as', () => {
    expect(toMarkdown(fig('Listing 1', 'x = 1'))).toBe('Listing 1\n\n```\nx = 1\n```\n');
  });

  it('and is escaped like any other text the page wrote', () => {
    expect(toMarkdown(fig('a *b* c', 'x = 1'))).toContain('a \\*b\\* c\n\n```');
  });

  it('a class still outranks the caption', () => {
    const html = '<pre><figure><figcaption>sample</figcaption>' +
      '<code class="language-js">x = 1</code></figure></pre>';
    expect(toMarkdown(html)).toBe('sample\n\n```js\nx = 1\n```\n');
  });

  it('a button is a control, not a line of code', () => {
    expect(toMarkdown('<pre><button>Copy</button><code>x = 1</code></pre>')).toBe(
      '```\nx = 1\n```\n',
    );
  });

  it('text outside the <code> is still kept', () => {
    expect(toMarkdown('<pre>lost<br><code>kept</code></pre>')).toBe('```\nlost\nkept\n```\n');
  });
});

// `normalize()` collapses runs of blank lines, which is right between blocks and
// wrong inside one: found on a ChatGPT answer whose Python sample separated its
// body from a trailing `print` with two blank lines and arrived with one — the
// page's own text, rewritten.
describe('blank lines inside a fence', () => {
  it.each([
    ['two blank lines', 'a\n\n\nb'],
    ['four blank lines', 'a\n\n\n\n\nb'],
    ['a blank line last', 'a\n\n'],
  ])('%s', (_name, code) => {
    expect(toMarkdown(`<pre><code>${code}</code></pre>`)).toContain(`\`\`\`\n${code}`);
  });

  it('still collapses them between blocks', () => {
    expect(toMarkdown('<p>a</p>\n\n\n\n<p>b</p>')).toBe('a\n\nb\n');
  });
});

// The buttons sit in the caption bar as often as beside it, and their text is
// not part of the label: read whole, `<figcaption>python<button>Copy</button>`
// gave the info string `pythonCopy`. Found by the spec fixture, where the copy
// button has a word in it — Perplexity's holds an icon and hid this.
describe('a caption bar with a button in it', () => {
  it('reads the label alone', () => {
    const html =
      '<pre><figure><figcaption>python<button type="button">Copy</button></figcaption>' +
      '<code>x = 1</code></figure></pre>';
    expect(toMarkdown(html)).toBe('```python\nx = 1\n```\n');
  });

  // "At any depth" is what the query says and what the label depends on: a site
  // that wraps its copy button in a `<span>` — most of them do, for the icon —
  // would otherwise name the fence `pythonCopy`, which is no language at all.
  it('reads it whatever the button is wrapped in', () => {
    const html =
      '<pre><figure><figcaption>python<span class="tools">' +
      '<button type="button">Copy</button></span></figcaption>' +
      '<code>x = 1</code></figure></pre>';
    expect(toMarkdown(html)).toBe('```python\nx = 1\n```\n');
  });
});

// The same furniture, drawn beside the `<pre>` rather than inside it — which is
// how ChatGPT, Habr and half the documentation sites on the web write it. The
// bar arrived as a paragraph reading `pythonКопировать`, a control's caption
// pasted into the reader's document, and the fence under it opened with no
// language although the page had just named one.
describe('a language bar drawn beside the <pre>', () => {
  const block = (head: string, code = 'print("x")'): string =>
    `<div class="code-block">${head}<pre><code>${code}</code></pre></div>`;

  it('names the fence and takes the control away', () => {
    const head = '<div class="code-head"><span>python</span><button type="button">Копировать</button></div>';
    expect(toMarkdown(block(head))).toBe('```python\nprint("x")\n```\n');
  });

  it.each([
    ['a link acting as the button', '<div>rust<a href="#copy">Copy</a></div>'],
    ['a role instead of a tag', '<div>rust<span role="button">Copy</span></div>'],
    ['an icon with no text at all', '<div><svg></svg>rust</div>'],
    ['the label alone', '<div>rust</div>'],
  ])('%s', (_name, head) => {
    expect(toMarkdown(block(head, 'fn main() {}'))).toBe('```rust\nfn main() {}\n```\n');
  });

  // Every refusal below is a page that meant what it wrote, and the cost of
  // guessing wrong is text the reader saw disappearing from the file.
  it.each([
    [
      'a heading is the author\'s, not the widget\'s',
      '<div class="w"><h3>python</h3><pre><code>x</code></pre></div>',
      '### python\n\n```\nx\n```\n',
    ],
    [
      'a label that is not a language stays as text',
      '<div class="w"><div>Listing 3</div><pre><code>x</code></pre></div>',
      'Listing 3\n\n```\nx\n```\n',
    ],
    [
      'a bar with anything else beside it is not this block\'s',
      '<div class="w"><div>python</div><p>prose</p><pre><code>x</code></pre></div>',
      'python\n\nprose\n\n```\nx\n```\n',
    ],
    [
      'a bar the block does not open with is not a bar',
      '<div class="w"><pre><code>x</code></pre><div>python</div></div>',
      '```\nx\n```\n\npython\n',
    ],
    // The heading refusal was read off the bar's own tag, so one wrapper deeper
    // it stopped applying and the same `<h3>` was taken — while written as a
    // direct sibling it was kept. A documentation section named for its language
    // is that shape, and the heading left the file without a word.
    [
      'a heading one wrapper down is still the author\'s',
      '<div class="w"><div><h3>python</h3></div><pre><code>x</code></pre></div>',
      '### python\n\n```\nx\n```\n',
    ],
    [
      'a heading claimed by a role rather than a tag',
      '<div class="w"><div role="heading" aria-level="3">python</div><pre><code>x</code></pre></div>',
      '### python\n\n```\nx\n```\n',
    ],
    // "The wrapper holds these two and nothing else" was counted over its
    // elements, and the text it held directly was not one — so this matched and
    // the page's own `python` left with the bar.
    [
      'text of the wrapper\'s own means the bar is not alone with the block',
      '<div class="w">Intro <div>python</div><pre><code>x</code></pre></div>',
      'Intro\n\npython\n\n```\nx\n```\n',
    ],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  // What the wrapper is allowed to hold besides the two: the page's indentation
  // and what a template engine left behind, neither of which the reader saw.
  it.each([
    ['a blank between them', '<div class="w">\n  <div>python</div>\n  <pre><code>x</code></pre>\n</div>'],
    ['a comment between them', '<div class="w"><div>python</div><!--c--><pre><code>x</code></pre></div>'],
  ])('lifts the bar anyway: %s', (_name, html) => {
    expect(toMarkdown(html)).toBe('```python\nx\n```\n');
  });

  // The page's own class still wins: it is the highlighter's word, and the bar
  // is a label that may be stale or translated. The bar is not printed either
  // way — a language name is the fence's business, not a line of prose.
  it('a stated class outranks the bar', () => {
    const head = '<div>python</div>';
    const html = `<div class="w">${head}<pre><code class="language-js">x</code></pre></div>`;
    expect(toMarkdown(html)).toBe('```js\nx\n```\n');
  });
});

// GitHub states the language on the box rather than on either tag, and
// `highlight-source-` has always been in the pattern list — it was only ever
// asked of the `<code>` and the `<pre>`, so every sample copied out of a
// repository or a README arrived as a fence with no language at all.
describe('language on the wrapper: the highlighters that state it there', () => {
  it('GitHub writes it on the div around the pre', () => {
    const html = '<div class="highlight highlight-source-typescript"><pre>type Box = {}</pre></div>';
    expect(toMarkdown(html)).toBe('```typescript\ntype Box = {}\n```\n');
  });

  it('the tags still answer first', () => {
    const html =
      '<div class="highlight highlight-source-typescript"><pre><code class="language-js">x</code></pre></div>';
    expect(toMarkdown(html)).toBe('```js\nx\n```\n');
  });

  // Never the bare class name one level up: a wrapper is where `highlight`,
  // `snippet` and `code-block` live, and any of them would pass for a language
  // read off the word alone.
  it('a wrapper named for itself claims no language', () => {
    expect(toMarkdown('<div class="highlight"><pre>x</pre></div>')).toBe('```\nx\n```\n');
    expect(toMarkdown('<div class="snippet"><pre>x</pre></div>')).toBe('```\nx\n```\n');
  });
});

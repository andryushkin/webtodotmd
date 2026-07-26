import { describe, it, expect, beforeAll } from 'vitest';
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

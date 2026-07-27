import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

// What the reader saw on the page and what they get in the file must match. Before
// this, a page showing `**bold**` as characters produced bold text.
describe('экранирование markdown из текста страницы', () => {
  it.each([
    ['звёздочки', '<p>Use **bold** here</p>', 'Use \\*\\*bold\\*\\* here'],
    ['подчёркивания', '<p>a _b_ c</p>', 'a \\_b\\_ c'],
    ['бэктики', '<p>use `code`</p>', 'use \\`code\\`'],
    ['тильды', '<p>a ~~b~~</p>', 'a \\~\\~b\\~\\~'],
    ['решётка в начале строки', '<p># not a heading</p>', '\\# not a heading'],
    ['маркер списка', '<p>- not a list</p>', '\\- not a list'],
    ['нумерация', '<p>1. not a list</p>', '1\\. not a list'],
    ['цитата', '<p>&gt; not a quote</p>', '\\> not a quote'],
    ['синтаксис ссылки', '<p>Write [text](url)</p>', 'Write \\[text\\](url)'],
    ['обратный слеш', '<p>a \\ b</p>', 'a \\\\ b'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['одиночная сноска', '<p>see [1] above</p>', 'see [1] above'],
    ['решётка в середине строки', '<p>issue #12 fixed</p>', 'issue #12 fixed'],
    ['дефис в середине', '<p>a - b</p>', 'a - b'],
  ])('не экранирует лишнего: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['жирный', '<p><strong>bold</strong></p>', '**bold**'],
    ['заголовок', '<h2>Title</h2>', '## Title'],
    ['список', '<ul><li>a</li><li>b</li></ul>', '- a\n- b'],
    ['вложенный список', '<ul><li>a<ul><li>b</li></ul></li></ul>', '- a\n  - b'],
    ['цитата', '<blockquote><p>q</p></blockquote>', '> q'],
    ['ссылка', '<p><a href="https://e.com">t</a></p>', '[t](https://e.com)'],
  ])('настоящая разметка не затронута: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['блок кода', '<pre><code>a * b _c_</code></pre>', '```\na * b _c_\n```'],
    ['инлайн-код', '<p>use <code>a*b</code></p>', 'use `a*b`'],
  ])('код остаётся дословным: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['тематический разрыв', '<p>---</p>', '\\---'],
    ['setext-подчёркивание', '<p>===</p>', '\\==='],
    ['intraword подчёркивание', '<p>snake_case_name</p>', 'snake_case_name'],
    ['одиночная тильда', '<p>a ~ b</p>', 'a ~ b'],
    ['двойная тильда', '<p>a ~~b~~ c</p>', 'a \\~\\~b\\~\\~ c'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it('текст после <br> экранируется как начало строки', () => {
    expect(toMarkdown('<p>Intro<br>- item</p>').trim()).toContain('\\- item');
  });

  // Тильда — единственный знак, который страница и конвертер пишут одинаково, и
  // одна ничего не значит: паре нужна вторая половина. Вопрос поэтому не «где
  // стоит тильда», а «дотянется ли до неё партнёр» — в этом же узле или в том,
  // что строка допишет рядом. `~~~x~~` — это забор кода на тильдах: текст
  // исчезает со страницы целиком, единственный найденный дефект, который стоит
  // содержимого, а не символов.
  it.each([
    ['перед зачёркнутым тегом', '<p>~<del>x</del></p>', '\\~~~x~~'],
    ['перед зачёркнутым стилем', '<p>~<span style="text-decoration-line:line-through">x</span></p>', '\\~~~x~~'],
    [
      'перед зачёркнутым снапшотом',
      '<p>~<span data-s2md-style="text-decoration-line:line-through">x</span></p>',
      '\\~~~x~~',
    ],
    ['после зачёркнутого', '<p><del>x</del>~</p>', '~~x~~\\~'],
    ['оба края узла', '<p>~home~</p>', '\\~home\\~'],
    ['пара разорвана по узлам', '<p><span>~y</span><span>x~</span></p>', '\\~yx\\~'],
    // Внутри слова тильда фланкирует в обе стороны, поэтому пара собирается и
    // посреди предложения — там, где два пути её не собирают.
    ['диапазоны внутри слова', '<p>range 1~5 and 7~9</p>', 'range 1\\~5 and 7\\~9'],
    // Экранированная тильда всё равно закрывает `<del>` в marked, поэтому платят
    // обе половины пары или ни одна: `~word\\~\\~\\~` рисуется как `<del>`.
    ['одна и три', '<p>~word~~~</p>', '\\~word\\~\\~\\~'],
  ])('партнёр есть: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // Тильда прямо перед бэктиком не даёт код-спану открыться вовсе — плата за
  // чужой разделитель, тот же шов с другой стороны.
  it('перед код-спаном', () => {
    expect(toMarkdown('<p>~<code>text</code></p>').trim()).toBe('\\~`text`');
  });

  it.each([
    ['путь', '<p>see ~/src for it</p>', 'see ~/src for it'],
    ['приближение', '<p>about ~5 min</p>', 'about ~5 min'],
    // Раньше платил каждый край текстового узла, и вот что это стоило: две
    // тильды, которые не могут составить пару, тильда одна в ячейке и тильда в
    // заголовке — четыре обратных слеша ни за что.
    ['два пути в предложении', '<p>see ~/src and ~/usr for it</p>', 'see ~/src and ~/usr for it'],
    ['две приближённости', '<p>about ~5 min or ~10 min</p>', 'about ~5 min or ~10 min'],
    ['в заголовке', '<h2>~/home</h2>', '## ~/home'],
    ['узел целиком из тильды', '<p><span>~</span></p>', '~'],
  ])('партнёра нет: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it('одинокая тильда в ячейке', () => {
    const html = '<table><tr><td>~</td></tr><tr><td>b</td></tr></table>';
    expect(toMarkdown(html)).toContain('| ~ ');
  });

  it('текст ячейки экранируется и в pipe-таблице', () => {
    const html = '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>**bold**</td></tr></tbody></table>';
    expect(toMarkdown(html)).toContain('\\*\\*bold\\*\\*');
  });

  it('в HTML-ячейке синтаксис не экранируется', () => {
    const html = '<table><tr><td colspan="2">snake_case and *lit*</td></tr></table>';
    expect(toMarkdown(html, { complexTableFallback: 'html' })).toContain('<td colspan="2">snake_case and *lit*</td>');
  });

  it('формула в ячейке не может закрыть её', () => {
    const payload = 'x&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;img src=q onerror="alert(1)"&gt;';
    const html = `<table><tr><td colspan="2"><span class="katex"><annotation encoding="application/x-tex">${payload}</annotation></span></td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html, { math: true, complexTableFallback: 'html' })).document;
    expect(reparsed.querySelectorAll('img, [onerror]')).toHaveLength(0);
    expect(reparsed.querySelectorAll('td')).toHaveLength(1);
  });

  it.each([
    ['матрица с &', '\\begin{matrix} a & b \\end{matrix}'],
    ['неравенство', 'x < y'],
  ])('LaTeX сохраняется: %s', (_name, latex) => {
    const html = `<span class="katex"><annotation encoding="application/x-tex">${latex}</annotation></span>`;
    expect(toMarkdown(html, { math: true }).trim()).toBe(`$${latex}$`);
  });

  it('LaTeX не экранируется', () => {
    const html =
      '<span class="katex"><annotation encoding="application/x-tex">a_b^*</annotation></span>';
    expect(toMarkdown(html, { math: true }).trim()).toBe('$a_b^*$');
  });
});

// Экранирование решает про каждый текстовый узел отдельно, а результаты потом
// склеиваются. Безобидный хвост одного узла и безобидное начало следующего
// собирались в разметку уже после того, как оба прошли проверку: подсветка
// синтаксиса кладёт `<` и имя тега в разные span-ы, и читатель терял текст,
// который страница ему показывала.
describe('экранирование через границу узлов', () => {
  it.each([
    [
      'открывающий тег',
      '<p>before <span>&lt;</span>img src=x onerror=alert(1)&gt; after</p>',
      'before \\<img src=x onerror=alert(1)> after',
    ],
    ['закрывающий тег', '<p><span>&lt;</span>/td&gt; tail</p>', '\\</td> tail'],
    [
      'начало комментария',
      '<p>before <span>&lt;</span>!-- note --&gt; after</p>',
      'before \\<!-- note --> after',
    ],
    ['имя тега разорвано', '<p><span>&lt;im</span>g src=x&gt;</p>', '\\<img src=x>'],
    ['ссылка на символ', '<p>write <span>&amp;</span>amp; here</p>', 'write \\&amp; here'],
    ['ссылка разорвана в середине', '<p>write <span>&amp;a</span>mp; here</p>', 'write \\&amp; here'],
    ['числовая ссылка', '<p><span>&amp;#</span>60; sign</p>', '\\&#60; sign'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // Защита на подозрении стоит обратного слеша в исходнике, поэтому она включается
  // только там, где к строке действительно что-то допишут.
  it.each([
    ['неравенство', '<p>a &lt; b</p>', 'a < b'],
    ['амперсанд в тексте', '<p>Tom &amp; Jerry</p>', 'Tom & Jerry'],
    ['числа', '<p>5 &lt; 6</p>', '5 < 6'],
    ['меньше либо равно', '<p>x &lt;= y</p>', 'x <= y'],
    ['амперсанд внутри слова', '<p>AT&amp;T ships</p>', 'AT&T ships'],
    ['строка кончается на <', '<p>5 &lt;</p>', '5 <'],
    ['заголовок кончается на ссылку', '<h2>Q&amp;A</h2>', '## Q&A'],
    ['соседний абзац — другая строка', '<p>5 &lt;</p><p>img&gt;</p>', '5 <\n\nimg>'],
  ])('не экранирует лишнего: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // <br> заканчивает строку — дописывать к ней уже нечего. Сам перенос конвертер
  // пишет обратным слешем, поэтому проверяем именно отсутствие `\&`.
  it('после <br> строка кончилась', () => {
    expect(toMarkdown('<p>Q&amp;A<br>next</p>')).not.toContain('\\&');
  });

  // Дописывает не только страница: правило вставляет свой текст сразу за чужим,
  // и `![` из картинки превращает висящий `<` в начало комментария.
  it('собственная разметка конвертера тоже дописывается', () => {
    const html = '<p>a &lt;<img src="https://e.com/a.png" alt="t"></p>';
    expect(toMarkdown(html).trim()).toBe('a \\<![t](https://e.com/a.png)');
  });

  // В MathML разрыв — не редкость, а способ записи: `<mo>&lt;</mo>` это оператор
  // «меньше». Правило для формул требует тег целиком в одной строке, поэтому там
  // разрывает вообще любой соседний узел.
  it.each([
    ['оператор между операндами', '<p><math><mi>a</mi><mo>&lt;</mo><mi>b</mi><mo>&gt;</mo><mi>c</mi></math></p>', 'a&lt;b>c'],
    ['тег по узлам', '<p><math><mo>&lt;</mo><mi>img</mi><mo>&gt;</mo></math></p>', '&lt;img>'],
  ])('формула не собирается в тег: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it('формула целиком в одном узле не теряет «меньше»', () => {
    const html = '<span class="katex"><annotation encoding="application/x-tex">a &lt; b</annotation></span>';
    expect(toMarkdown(html, { math: true }).trim()).toBe('$a < b$');
  });
});

// Та же склейка, но для markdown-разметки. Скобка становится ссылкой только когда
// за ней придёт `](`, и половинки приходят из разных узлов: страница показывала
// скобки, а в файл попадала живая ссылка — читатель терял то, что видел.
describe('markdown через границу узлов', () => {
  it.each([
    ['скобка открыта в узле', '<p><span>[</span>x](https://e.com)</p>', '\\[x](https://e.com)'],
    ['подпись в узле', '<p><span>[text]</span>(https://e.com)</p>', '\\[text](https://e.com)'],
    [
      'картинка',
      '<p><span>![alt]</span>(https://e.com/i.png)</p>',
      '!\\[alt](https://e.com/i.png)',
    ],
    ['подпись разорвана элементом', '<p><span>[</span><b>x</b>](y)</p>', '\\[**x**](y)'],
    ['три узла', '<p><span>[</span><span>x]</span>(y)</p>', '\\[x](y)'],
    // Восклицательный знак остался в предыдущем узле: скобку экранирует тот узел,
    // в котором она лежит, и `![` собирается уже неработающим.
    ['разрыв внутри `![`', '<p><span>!</span>[x](y)</p>', '!\\[x\\](y)'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // Ради этого экранирование и смотрит вперёд, а не на последний символ узла:
  // `[1]` в конце span-а неотличим от начала ссылки, если не прочитать продолжение,
  // а сносок на любой вики-странице больше, чем ссылок в тексте.
  it.each([
    ['сноска в отдельном узле', '<p>see [1] and <span>[2]</span> below</p>', 'see [1] and [2] below'],
    ['скобки в одном узле', '<p>a [note] here</p>', 'a [note] here'],
    ['сноска в конце строки', '<p><span>see [1]</span></p>', 'see [1]'],
    ['скобка и скобка порознь', '<p><span>[a]</span> and <span>[b]</span></p>', '[a] and [b]'],
    ['абзац — другая строка', '<p><span>[a]</span></p><p>(b)</p>', '[a]\n\n(b)'],
  ])('не экранирует лишнего: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // <br> заканчивает строку: дописать `(b)` к `[a]` уже нечему.
  it('после <br> строка кончилась', () => {
    expect(toMarkdown('<p><span>[a]</span><br>(b)</p>')).not.toContain('\\[');
  });

  it.each([
    ['ссылка', '<p><a href="https://e.com">t</a></p>', '[t](https://e.com)'],
    ['картинка', '<p><img src="https://e.com/a.png" alt="t"></p>', '![t](https://e.com/a.png)'],
  ])('настоящая разметка не затронута: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  // Обратный слеш ставится на скобку, а не на `!`: `\!` понижает картинку до
  // ссылки, а ссылки на странице тоже не было.
  it('картинка в одном узле не остаётся ссылкой', () => {
    expect(toMarkdown('<p>![alt](url)</p>').trim()).toBe('!\\[alt\\](url)');
  });
});

// Found by an agent that could not reach parser.ts: only `<br>` was asked about,
// so any other element that ends a line left the text after it unescaped at the
// start of one — and the page's literal `## y` became a real heading.
describe('блочный сосед открывает строку', () => {
  it.each([
    ['горизонтальная линия', '<div>x<hr>## y</div>', '\\## y'],
    ['параграф', '<div>x<p>a</p>## y</div>', '\\## y'],
    ['список', '<div>x<ul><li>a</li></ul>- item</div>', '\\- item'],
    ['таблица', '<div>x<table><tr><td>a</td></tr></table>> quote</div>', '\\> quote'],
    ['перенос строки, как и раньше', '<div>x<br>## y</div>', '\\## y'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html)).toContain(expected);
  });

  it.each([
    ['середина предложения', '<p>mid # sentence</p>', 'mid # sentence'],
    ['после инлайна', '<div><em>a</em> # not a heading</div>', '_a_ # not a heading'],
  ])('не экранирует лишнего: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });
});

// An inline wrapper draws no line of its own, so a text node first inside one
// opens whatever line the wrapper stands at the start of. Only the immediate
// parent was asked, and a chat interface writes every run of an answer as its
// own `<span>`: the three literal lines a ChatGPT answer showed came back with
// the middle one a real H1, taking the break before it with it.
describe('an inline wrapper passes the line boundary through', () => {
  it.each([
    ['after a break', '<p>a<br><span># x</span></p>', '\\# x'],
    ['opening a paragraph', '<p><span># x</span></p>', '\\# x'],
    ['nested wrappers', '<p>a<br><span><span>- item</span></span></p>', '\\- item'],
    ['numbering', '<p>a<br><span>1. one</span></p>', '1\\. one'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html)).toContain(expected);
  });

  it.each([
    // A wrapper writing a delimiter of its own has already put a character on
    // the line, and there the backslash would be visible rather than harmless:
    // an emphasis that falls back to live tags is not unescaped by any renderer.
    ['emphasis', '<p>a<br><em># x</em></p>', '_# x_'],
    ['link label', '<p>a<br><a href="https://example.com"># x</a></p>', '[# x](https://example.com)'],
    ['text before the wrapper', '<p>a <span># x</span></p>', 'a # x'],
  ])('leaves it alone: %s', (_name, html, expected) => {
    expect(toMarkdown(html)).toContain(expected);
  });
});

// Блоком делает не только тег. `convert()` пишет элемент с `display:block` между
// пустыми строками — значит его текст открывает строку ровно как текст `<div>`, а
// спрашивали только про тег: литеральный `# heading` со страницы становился
// настоящим H1, `---` уносил всю строку. Обе записи стиля, потому что до
// конвертера доходят обе: собственный атрибут страницы и снятый снапшот.
describe('стилевой блок открывает строку', () => {
  const inside = (style: string, text: string) =>
    `<p>x<span ${style}="display:block">${text}</span>y</p>`;
  const after = (style: string, text: string) =>
    `<p>x<span ${style}="display:block">a</span>${text}</p>`;

  it.each([
    ['заголовок', '# heading', '\\# heading'],
    ['маркер списка', '- item', '\\- item'],
    ['нумерация', '1. one', '1\\. one'],
    ['цитата', '&gt; quoted', '\\> quoted'],
    ['тематический разрыв', '---', '\\---'],
  ])('%s', (_name, text, expected) => {
    for (const style of ['style', 'data-s2md-style']) {
      expect(toMarkdown(inside(style, text))).toContain(expected);
      expect(toMarkdown(after(style, text))).toContain(expected);
    }
  });

  // Плата — только за начало строки: тот же знак посреди предложения внутри
  // стилевого блока обратного слеша не стоит.
  it('середина стилевого блока не платит', () => {
    expect(toMarkdown('<p>x<span style="display:block">mid # sentence</span>y</p>'))
      .toContain('mid # sentence');
  });
});

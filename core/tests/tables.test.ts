import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('simple table (with thead)', () => {
  it('базовая таблица с thead и tbody', () => {
    const html = `
      <table>
        <thead><tr><th>Имя</th><th>Возраст</th></tr></thead>
        <tbody>
          <tr><td>Алиса</td><td>30</td></tr>
          <tr><td>Боб</td><td>25</td></tr>
        </tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('| Имя');
    expect(result).toContain('| -');
    expect(result).toContain('| Алиса');
    expect(result).toContain('| Боб');
    // Разделитель должен быть между заголовком и данными
    const lines = result.trim().split('\n');
    expect(lines[0]).toMatch(/^\|.*Имя.*\|/);
    expect(lines[1]).toMatch(/^\| [-:]+/);
    expect(lines[2]).toMatch(/^\|.*Алиса.*\|/);
  });

  it('одна колонка', () => {
    const html = `<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table>`;
    const result = toMarkdown(html);
    expect(result.trim()).toBe('| Name  |\n| ----- |\n| Alice |');
  });

  it('несколько строк', () => {
    const html = `
      <table>
        <thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>2</td></tr>
          <tr><td>3</td><td>4</td></tr>
          <tr><td>5</td><td>6</td></tr>
        </tbody>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines).toHaveLength(5); // header + separator + 3 rows
  });
});

describe('medium table (без thead)', () => {
  it('первая строка становится заголовком', () => {
    const html = `
      <table>
        <tr><td>Алиса</td><td>30</td></tr>
        <tr><td>Боб</td><td>25</td></tr>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[0]).toMatch(/Алиса/);
    expect(lines[1]).toMatch(/^[| -:]+$/);
    expect(lines[2]).toMatch(/Боб/);
  });

  it('одна строка без thead — только заголовок и разделитель', () => {
    const html = `<table><tr><td>Only</td><td>Row</td></tr></table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines).toHaveLength(2); // header + separator only
    expect(lines[0]).toMatch(/Only/);
    expect(lines[1]).toMatch(/^[| -]+$/);
  });
});

describe('выравнивание', () => {
  it('left → :---', () => {
    const html = `
      <table>
        <thead><tr><th style="text-align: left">Name</th></tr></thead>
        <tbody><tr><td>Alice</td></tr></tbody>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[1]).toMatch(/:---/);
  });

  it('center → :---:', () => {
    const html = `
      <table>
        <thead><tr><th style="text-align: center">Status</th></tr></thead>
        <tbody><tr><td>Active</td></tr></tbody>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[1]).toMatch(/:.*:/);
  });

  it('right → ---:', () => {
    const html = `
      <table>
        <thead><tr><th style="text-align: right">Sum</th></tr></thead>
        <tbody><tr><td>100</td></tr></tbody>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[1]).toMatch(/--:/);
  });

  it('смешанное выравнивание', () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th style="text-align: left">Имя</th>
            <th style="text-align: center">Статус</th>
            <th style="text-align: right">Сумма</th>
          </tr>
        </thead>
        <tbody><tr><td>Алиса</td><td>Активен</td><td>100</td></tr></tbody>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[1]).toMatch(/:----/); // left
    expect(lines[1]).toMatch(/:.*:/); // center
    expect(lines[1]).toMatch(/----:/); // right
  });
});

describe('pipe в содержимом', () => {
  it('pipe в ячейке экранируется', () => {
    const html = `
      <table>
        <thead><tr><th>Команда</th><th>Описание</th></tr></thead>
        <tbody><tr><td>a | b</td><td>Выбор</td></tr></tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('\\|');
  });
});

describe('строки, колонки и подпись в pipe-таблице', () => {
  it('строки <tfoot> не теряются', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>a</td></tr></tbody><tfoot><tr><td>total</td></tr></tfoot></table>';
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('total');
  });

  it('строка шире заголовка расширяет таблицу, а не теряет ячейку', () => {
    const html =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>';
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[0]?.match(/\|/g)).toHaveLength(4);
    expect(lines[2]).toContain('3');
  });

  it('<caption> становится строкой над таблицей', () => {
    const html = '<table><caption>Sales 2026</caption><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>';
    const result = toMarkdown(html).trim();
    expect(result.startsWith('Sales 2026')).toBe(true);
    expect(result).toContain('| a');
  });

  it('<caption> сохраняется и в HTML-fallback', () => {
    const result = toMarkdown('<table><caption>Cap</caption><tr><td colspan="2">x</td></tr></table>');
    expect(result).toContain('<caption>Cap</caption>');
  });

  it('блочный контент в <th> уводит таблицу в fallback, как и в <td>', () => {
    const result = toMarkdown('<table><tr><th><ul><li>a</li><li>b</li></ul></th></tr><tr><td>x</td></tr></table>');
    expect(result).toContain('<table>');
    expect(result).toContain('<th>');
  });

  it('<br> внутри инлайн-обёртки не оставляет обратный слеш', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td><span>a<br>b</span></td></tr></tbody></table>';
    const result = toMarkdown(html);
    expect(result).toContain('a<br>b');
    expect(result).not.toContain('\\');
  });
});

describe('complex table — HTML fallback', () => {
  it('colspan → HTML fallback', () => {
    const html = `
      <table>
        <tr><th colspan="2">Header</th></tr>
        <tr><td>A</td><td>B</td></tr>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<table>');
    expect(result).toContain('colspan');
  });

  it('rowspan → HTML fallback', () => {
    const html = `
      <table>
        <tr><td rowspan="2">Span</td><td>A</td></tr>
        <tr><td>B</td></tr>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<table>');
    expect(result).toContain('rowspan');
  });

  it('блочный контент в ячейке → HTML fallback', () => {
    const html = `
      <table>
        <thead><tr><th>Items</th></tr></thead>
        <tbody><tr><td><ul><li>One</li></ul></td></tr></tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<table>');
  });

  it('complexTableFallback: skip → пустой результат', () => {
    const html = `<table><tr><th colspan="2">H</th></tr></table>`;
    const result = toMarkdown(html, { complexTableFallback: 'skip' });
    expect(result.trim()).toBe('');
  });

  it('complexTableFallback: text → текст через |', () => {
    const html = `<table><tr><th colspan="2">A</th></tr><tr><td>B</td><td>C</td></tr></table>`;
    const result = toMarkdown(html, { complexTableFallback: 'text' });
    expect(result).toContain('A');
    expect(result).toContain('B | C');
    expect(result).not.toContain('<table>');
  });
});

describe('<br> в ячейках', () => {
  it('<br> → <br> внутри ячейки', () => {
    const html = `
      <table>
        <thead><tr><th>Колонка</th></tr></thead>
        <tbody><tr><td>Строка 1<br>Строка 2</td></tr></tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<br>');
    // Не должно быть переноса строки внутри ячейки
    const lines = result.trim().split('\n');
    const dataLine = lines.find((l) => l.includes('Строка 1'));
    expect(dataLine).toBeDefined();
    expect(dataLine).toContain('Строка 2');
  });
});

describe('inline-форматирование в ячейках', () => {
  it('<strong> в ячейке → **bold**', () => {
    const html = `
      <table>
        <thead><tr><th>Col</th></tr></thead>
        <tbody><tr><td><strong>Bold</strong></td></tr></tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('**Bold**');
  });

  it('<code> в ячейке → `code`', () => {
    const html = `
      <table>
        <thead><tr><th>Col</th></tr></thead>
        <tbody><tr><td><code>foo()</code></td></tr></tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('`foo()`');
  });
});

describe('вложенные таблицы', () => {
  it('содержимое вложенной таблицы не дублируется', () => {
    const html = `<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>`;
    const result = toMarkdown(html);
    expect(result.match(/inner/g)).toHaveLength(1);
  });

  it('вложенная таблица остаётся вложенной после повторного разбора', () => {
    const html = `<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html)).document;
    const outerCell = reparsed.querySelector('td');
    expect(outerCell?.querySelector('table td')?.textContent).toBe('inner');
  });

  it('строки вложенной таблицы не попадают во внешнюю при fallback text', () => {
    const html = `<table><tr><td>outer</td><td><table><tr><td>inner</td></tr></table></td></tr></table>`;
    const result = toMarkdown(html, { complexTableFallback: 'text' });
    expect(result.trim().split('\n')).toHaveLength(1);
  });
});

describe('блочный контент в ячейке', () => {
  it('два абзаца в ячейке остаются одной строкой таблицы', () => {
    const html = `
      <table>
        <thead><tr><th>H</th></tr></thead>
        <tbody><tr><td><p>para one</p><p>two</p></td></tr></tbody>
      </table>`;
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines).toHaveLength(3); // header + separator + one row
    expect(lines[2]).toContain('para one<br>two');
  });
});

describe('HTML fallback — своя разметка, а не разметка страницы', () => {
  // The fallback emits table/tr/td/th/pre built here and nothing else. Filtering
  // the page's own markup was tried: everything not on the deny list survived.
  it('интерактивные и медийные элементы сводятся к тексту, как и вне таблиц', () => {
    const cases: Array<[string, string]> = [
      ['<form><input autofocus><button>go</button></form>', 'go'],
      ['<div style="position:fixed;inset:0">overlay</div>', 'overlay'],
    ];
    for (const [cell, expected] of cases) {
      const result = toMarkdown(`<table><tr><td colspan="2">${cell}</td></tr></table>`);
      expect(result).toContain(`<td colspan="2">${expected}</td>`);
      expect(result).not.toContain('<form');
      expect(result).not.toContain('style=');
    }
  });

  it('<video autoplay> не переносится вовсе', () => {
    const html = '<table><tr><td colspan="2"><video autoplay src="https://example.com/x.mp4"></video></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).not.toContain('video');
    expect(result).not.toContain('autoplay');
    expect(result).toContain('<td colspan="2"></td>');
  });

  it('атрибуты страницы не переносятся, кроме colspan и rowspan', () => {
    const html =
      '<table><tr><td colspan="2" rowspan="3" title="t" class="c" id="i" onclick="steal()">x</td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('<td colspan="2" rowspan="3">x</td>');
    for (const attr of ['title', 'class', 'id', 'onclick']) expect(result).not.toContain(attr);
  });

  it('нечисловой, чрезмерный и единичный span опускаются', () => {
    const html =
      '<table><tr><td colspan="abc">a</td><td colspan="99999999">b</td><td colspan="1">c</td><td colspan="2">d</td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('<td>a</td><td>b</td><td>c</td><td colspan="2">d</td>');
  });

  it('th остаётся th', () => {
    const result = toMarkdown('<table><tr><th colspan="2">H</th></tr><tr><td>a</td></tr></table>');
    expect(result).toContain('<th colspan="2">H</th>');
  });

  it('список в ячейке разделён, а не склеен в "ab"', () => {
    const html = '<table><tr><td colspan="2"><ul><li>a</li><li>b</li></ul></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('- a');
    expect(result).toContain('- b');
    expect(result).not.toContain('>ab<');
  });

  it('инлайн-разметка ячейки становится markdown', () => {
    const html = '<table><tr><td colspan="2"><strong>t</strong> and <code>x|y</code></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('**t**');
    expect(result).toContain('`x|y`');
  });

  it('<pre> сохраняется точно, включая пустые строки и табы', () => {
    const source = 'def f():\n\n\treturn 1\n';
    const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
    const result = toMarkdown(html);
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(source);
    // A blank line would end the HTML block and give the rest to Markdown as prose.
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('& и < внутри <pre> экранируются', () => {
    const html = '<table><tr><td colspan="2"><pre>a & b < c</pre></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('a &amp; b &lt; c');
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe('a & b < c');
  });

  it('<pre> распознаётся на любой глубине, а не только прямым ребёнком', () => {
    // Wrapped in a <div> it used to go through the converter, and the blank line
    // inside the code became <br><br>.
    const source = 'a\n\nb';
    const html = `<table><tr><td colspan="2"><div><pre>${source}</pre></div></td></tr></table>`;
    const result = toMarkdown(html);
    // Wrapped, it reaches the converter as a fence, so the newlines are encoded
    // rather than collapsed — the text comes back either way.
    expect(parseHTML(result).document.querySelector('td')?.textContent).toContain(source);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('экспоненциальная и шестнадцатеричная запись span не принимается', () => {
    // Number() reads "1e3" as 1000 and "0x2" as 2 — spans the page never wrote.
    const html =
      '<table><tr><td colspan="1e3">a</td><td colspan="0x2">b</td><td colspan="2.5">c</td><td colspan="-2">d</td><td colspan=" 3 ">e</td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('<td>a</td><td>b</td><td>c</td><td>d</td><td colspan="3">e</td>');
  });

  it('одиночный < в тексте не ломает структуру', () => {
    const html = '<table><tr><td colspan="2">5 &lt; 7</td></tr></table>';
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelectorAll('td')).toHaveLength(1);
    expect(reparsed.querySelector('td')?.textContent).toBe('5 < 7');
  });

  it('вложенная таблица сериализуется тем же генератором', () => {
    const html = '<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>';
    const result = toMarkdown(html);
    expect(result.match(/inner/g)).toHaveLength(1);
    expect(result).toContain('<td>inner</td>');
    expect(result).toContain('outer');
  });

  it('литеральные теги из текста страницы не закрывают наши элементы', () => {
    const html = '<table><tr><td colspan="2">&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;script&gt;alert(1)&lt;/script&gt;</td></tr></table>';
    const result = toMarkdown(html);
    const reparsed = parseHTML(result).document;
    expect(reparsed.querySelectorAll('td')).toHaveLength(1);
    expect(reparsed.querySelectorAll('script')).toHaveLength(0);
    expect(result).toContain('&lt;script&gt;');
  });

  it('теги, которые выпускает сам конвертер, не экранируются', () => {
    const html = '<table><tr><td colspan="2">x<sub>1</sub><sup>2</sup><br>y</td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('<sub>1</sub>');
    expect(result).toContain('<sup>2</sup>');
    expect(result).toContain('<br>');
  });

  // Copy and Download hand over the raw Markdown with no sanitizing, so the file
  // must not gain markup from the page's own text. Escaping happens on the text
  // nodes before conversion, which is why none of these need a special case.
  it.each([
    ['тег с атрибутами', '&lt;sub style=position:fixed onclick=steal()&gt;t&lt;/sub&gt;', '<sub style=position:fixed onclick=steal()>t</sub>'],
    ['точный парный тег', '&lt;sub&gt;text&lt;/sub&gt;', '<sub>text</sub>'],
    ['закрывающий тег в одиночку', 'a&lt;/sub&gt;b', 'a</sub>b'],
    ['структурные теги', 'x &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt; y', 'x </td></tr></table> y'],
    ['HTML-комментарий', 'a &lt;!-- c --&gt; b', 'a <!-- c --> b'],
    ['img с обработчиком', '&lt;img src=x onerror=alert(1)&gt;', '<img src=x onerror=alert(1)>'],
  ])('литеральный %s остаётся текстом', (_name, input, expectedText) => {
    const html = `<table><tr><td colspan="2">${input}</td><td>next</td></tr></table>`;
    const result = toMarkdown(html);
    const reparsed = parseHTML(result).document;
    // The second cell proves nothing swallowed the rest of the row.
    expect(reparsed.querySelectorAll('td')).toHaveLength(2);
    expect(reparsed.querySelectorAll('sub, img, [onclick], [onerror], [style]')).toHaveLength(0);
    expect(reparsed.querySelectorAll('td')[0]?.textContent).toBe(expectedText);
  });

  it.each([
    ['title картинки', '<img src="https://e.com/a.png" alt="a" title="</td></tr></table><script>alert(1)</script>">'],
    ['alt картинки', '<img src="https://e.com/a.png" alt="</td></tr></table><script>alert(1)</script>">'],
    ['href ссылки', '<a href="https://e.com/?a=<img src=x onerror=alert(1)>">t</a>'],
  ])('значение атрибута (%s) не проносит разметку в файл', (_name, cell) => {
    // The converter puts attribute values into its own syntax — [t](href),
    // ![alt](src 'title') — so they reach the file just like text does.
    const html = `<table><tr><td colspan="2">${cell}</td><td>next</td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelectorAll('td')).toHaveLength(2);
    expect(reparsed.querySelectorAll('script, img, [onerror]')).toHaveLength(0);
  });

  it('вложенная таблица через обёртку не экранируется дважды', () => {
    const html =
      '<table><tr><td colspan="2"><div><table><tr><td colspan="2">a &amp; b</td></tr></table></div></td></tr></table>';
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelectorAll('table table td')[0]?.textContent).toBe('a & b');
  });

  it('прозаический </sub> внутри inline-кода не закрывает настоящий <sub>', () => {
    const html = '<table><tr><td colspan="2"><sub>real <code>&lt;/sub&gt;</code> tail</sub></td></tr></table>';
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelectorAll('sub')).toHaveLength(1);
    expect(reparsed.querySelector('sub')?.textContent).toBe('real `</sub>` tail');
  });

  it('амперсанд и литеральная сущность проходят round-trip', () => {
    const html = '<table><tr><td colspan="2">a &amp; b, literal &amp;lt; stays</td></tr></table>';
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelector('td')?.textContent).toBe('a & b, literal &lt; stays');
  });

  it('код с тройными бэктиками внутри проходит round-trip', () => {
    const code = 'a\n```\n\nb';
    const html = `<table><tr><td colspan="2"><div><pre><code>${code}</code></pre></div></td></tr></table>`;
    const result = toMarkdown(html);
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(code);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('<pre> в обёртке остаётся <pre>, а не превращается в забор', () => {
    // As a fenced block inside a <td> the renderer collapses the whitespace, so
    // the element itself has to survive.
    const source = 'def f():\n\n\treturn 1';
    const html = `<table><tr><td colspan="2"><div><pre>${source}</pre></div></td></tr></table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<pre>');
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(source);
  });

  it('обёртка сохраняет свой маркер списка вокруг <pre>', () => {
    const html = '<table><tr><td colspan="2"><ol><li>a<pre>x</pre></li><li>b</li></ol></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('1. a<pre>x</pre>');
    expect(result).toContain('2. b');
  });

  it('<pre> внутри обёртки уводит таблицу в fallback даже без colspan', () => {
    // The analysis used to look only at direct children, so this stayed a pipe
    // table and the blank line in the code became a <br>.
    const source = 'a\n\nb';
    const html = `<table><tr><td><div><pre>${source}</pre></div></td><td>x</td></tr><tr><td>y</td><td>z</td></tr></table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<table>');
    expect(parseHTML(result).document.querySelector('td')?.textContent).toContain(source);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('обёртка вокруг <pre> сохраняет свою разметку списка', () => {
    const html =
      '<table><tr><td colspan="2"><ul><li>one<pre>code</pre>tail</li><li>two</li></ul></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('- one');
    expect(result).toContain('- two');
    expect(parseHTML(result).document.querySelector('td')?.textContent).toContain('code');
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('блочный контент даёт разрыв, но не пустую строку', () => {
    const html = '<table><tr><td colspan="2"><p>one</p><p>two</p></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('one<br><br>two');
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });
});

describe('пустая таблица', () => {
  it('таблица без строк → пустой вывод', () => {
    const html = `<table></table>`;
    const result = toMarkdown(html);
    expect(result.trim()).toBe('');
  });
});

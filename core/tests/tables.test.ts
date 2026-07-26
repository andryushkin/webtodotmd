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

  // A column aligned by a class says so in the recorded computed style and
  // nowhere else, which is why this reads the cell through `elementStyle` rather
  // than through a regex over one attribute.
  it('a recorded computed style aligns the column too', () => {
    const html =
      '<table><thead><tr><th data-s2md-style="text-align:right">Sum</th></tr></thead>' +
      '<tbody><tr><td>100</td></tr></tbody></table>';
    expect(toMarkdown(html).trim().split('\n')[1]).toMatch(/--:/);
  });

  // The logical spellings of the same two edges, which is how a computed style
  // states them.
  it.each([
    ['start', /^\| :-+ \|$/],
    ['end', /^\| -+: \|$/],
  ])('%s is read as the edge it names', (value, expected) => {
    const html =
      `<table><thead><tr><th data-s2md-style="text-align:${value}">H</th></tr></thead>` +
      '<tbody><tr><td>v</td></tr></tbody></table>';
    expect(toMarkdown(html).trim().split('\n')[1]).toMatch(expected);
  });

  it.each([
    ['a property that merely starts the same way', '-x-text-align:right'],
    ['a value a pipe table cannot write', 'text-align:justify'],
  ])('%s aligns nothing', (_name, style) => {
    const html =
      `<table><thead><tr><th style="${style}">H</th></tr></thead>` +
      '<tbody><tr><td>v</td></tr></tbody></table>';
    expect(toMarkdown(html).trim().split('\n')[1]).toMatch(/^\| -+ \|$/);
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
  it('colspan="1" и нечисловой span не уводят таблицу в HTML', () => {
    // Wikipedia, Word and Confluence exports write colspan="1"; the gate and the
    // serializer used to disagree about whether that is a merged cell.
    for (const span of ['1', '0', 'abc']) {
      const html = `<table><tr><th colspan="${span}">A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>`;
      const result = toMarkdown(html);
      expect(result).not.toContain('<table>');
      expect(result).toContain('| A');
    }
  });

  it('<tfoot> перед <tbody> всё равно идёт после данных', () => {
    const html =
      '<table><thead><tr><th>Q</th></tr></thead><tfoot><tr><td>Total</td></tr></tfoot><tbody><tr><td>Q1</td></tr></tbody></table>';
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[2]).toContain('Q1');
    expect(lines[3]).toContain('Total');
  });

  it('без <thead> строка <tfoot> не становится заголовком', () => {
    const html = '<table><tfoot><tr><td>Total</td></tr></tfoot><tbody><tr><td>Q1</td></tr></tbody></table>';
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines[0]).toContain('Q1');
    expect(lines[2]).toContain('Total');
  });

  it('таблица с одной подписью и без строк не исчезает', () => {
    expect(toMarkdown('<table><caption>Important</caption></table>').trim()).toBe('Important');
  });

  it('режим text держит строку на одной строке', () => {
    const result = toMarkdown('<table><tr><td colspan="2"><pre>a\nb</pre></td><td>x</td></tr></table>', {
      complexTableFallback: 'text',
    });
    expect(result.trim().split('\n')).toHaveLength(1);
    expect(result).toContain('a b | x');
  });


  it('строки <tfoot> не теряются', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>a</td></tr></tbody><tfoot><tr><td>total</td></tr></tfoot></table>';
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('total');
  });

  it('вторая строка <thead> уходит в тело, а не теряется', () => {
    const html =
      '<table><thead><tr><th>A</th></tr><tr><th>B</th></tr></thead><tbody><tr><td>C</td></tr></tbody></table>';
    const lines = toMarkdown(html).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('A');
    expect(lines[2]).toContain('B');
    expect(lines[3]).toContain('C');
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
    const result = toMarkdown(
      '<table><caption>Cap</caption><tr><td colspan="2">x</td></tr></table>', { complexTableFallback: 'html' },
    );
    expect(result).toContain('<caption>Cap</caption>');
  });

  it('список в ячейке не меняет формат таблицы и не зависит от обёртки', () => {
    // Both paths render a list the same way, so it is not a reason to switch to
    // the HTML form — and wrapping it in a <div> must not change the answer.
    const bare = toMarkdown('<table><tr><td><ul><li>a</li><li>b</li></ul></td></tr></table>');
    const wrapped = toMarkdown('<table><tr><td><div><ul><li>a</li><li>b</li></ul></div></td></tr></table>');
    expect(bare).toBe(wrapped);
    expect(bare).not.toContain('<table>');
    expect(bare).toContain('- a<br>- b');
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
  // Opt-in now; the default is the pipe form, covered by the block below.
  const toHtmlTable = (html: string) => toMarkdown(html, { complexTableFallback: 'html' });
  it('colspan → HTML fallback', () => {
    const html = `
      <table>
        <tr><th colspan="2">Header</th></tr>
        <tr><td>A</td><td>B</td></tr>
      </table>`;
    const result = toHtmlTable(html);
    expect(result).toContain('<table>');
    expect(result).toContain('colspan');
  });

  it('rowspan → HTML fallback', () => {
    const html = `
      <table>
        <tr><td rowspan="2">Span</td><td>A</td></tr>
        <tr><td>B</td></tr>
      </table>`;
    const result = toHtmlTable(html);
    expect(result).toContain('<table>');
    expect(result).toContain('rowspan');
  });

  it('<pre> в ячейке → HTML fallback', () => {
    const html = `
      <table>
        <thead><tr><th>Code</th></tr></thead>
        <tbody><tr><td><pre>one</pre></td></tr></tbody>
      </table>`;
    const result = toHtmlTable(html);
    expect(result).toContain('<table>');
    expect(result).toContain('<pre>one</pre>');
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
    const reparsed = parseHTML(toMarkdown(html, { complexTableFallback: 'html' })).document;
    const outerCell = reparsed.querySelector('td');
    expect(outerCell?.querySelector('table td')?.textContent).toBe('inner');
  });

  it('строки вложенной таблицы не попадают во внешнюю при fallback text', () => {
    const html = `<table><tr><td>outer</td><td><table><tr><td>inner</td></tr></table></td></tr></table>`;
    const result = toMarkdown(html, { complexTableFallback: 'text' });
    expect(result.trim().split('\n')).toHaveLength(1);
  });
});

// Свёртка смотрела на собственных детей ячейки, поэтому любая обёртка вокруг
// вложенной таблицы прятала её: конвертер выдавал внутри pipe-ячейки настоящую
// pipe-таблицу, и читатель получал `| x | y |` и строку дефисов как текст.
// Обёртка вокруг таблицы — обычная разметка страницы, а не решение о формате.
describe('вложенная таблица за обёрткой', () => {
  const folded = '| x · y |';

  it.each([
    ['<div>', '<div><table><tr><td>x</td><td>y</td></tr></table></div>'],
    ['<figure>', '<figure><table><tr><td>x</td><td>y</td></tr></table></figure>'],
    ['две обёртки', '<div><div><table><tr><td>x</td><td>y</td></tr></table></div></div>'],
  ])('%s сворачивается так же, как таблица без обёртки', (_name, inner) => {
    const result = toMarkdown(`<table><tr><td>${inner}</td></tr><tr><td>outer</td></tr></table>`);
    expect(result).toContain(folded);
    // Ни синтаксиса вложенной таблицы, ни её строки-разделителя.
    expect(result).not.toContain('---|');
    expect(result).not.toContain('\\|');
  });

  it('обёртка даёт тот же результат, что и прямой ребёнок', () => {
    const bare = '<table><tr><td><table><tr><td>x</td><td>y</td></tr></table></td></tr></table>';
    const wrapped =
      '<table><tr><td><div><table><tr><td>x</td><td>y</td></tr></table></div></td></tr></table>';
    expect(toMarkdown(wrapped)).toBe(toMarkdown(bare));
  });

  it('текст рядом с обёрткой не теряется', () => {
    const html =
      '<table><tr><td>before<div><table><tr><td>x</td></tr></table></div>after</td></tr></table>';
    expect(toMarkdown(html)).toContain('before<br>x<br>after');
  });

  it('HTML fallback по-прежнему сохраняет вложенную таблицу за обёрткой', () => {
    const html =
      '<table><tr><td><div><table><tr><td>inner</td></tr></table></div></td></tr></table>';
    const reparsed = parseHTML(toMarkdown(html, { complexTableFallback: 'html' })).document;
    expect(reparsed.querySelector('td table td')?.textContent).toBe('inner');
  });
});

// Свёртка обходила только строки, а подпись — не строка: страница её показывала,
// а файл нет.
describe('подпись вложенной таблицы', () => {
  it('подпись становится первой строкой свёрнутой ячейки', () => {
    const html =
      '<table><tr><td><table><caption>cap</caption><tr><td>x</td><td>y</td></tr></table></td></tr></table>';
    expect(toMarkdown(html)).toContain('| cap<br>x · y |');
  });

  it('подпись переживает обёртку', () => {
    const html =
      '<table><tr><td><div><table><caption>cap</caption><tr><td>x</td></tr></table></div></td></tr></table>';
    expect(toMarkdown(html)).toContain('cap<br>x');
  });

  it('пустая подпись не добавляет строку', () => {
    const html =
      '<table><tr><td><table><caption> </caption><tr><td>x</td></tr></table></td></tr></table>';
    expect(toMarkdown(html)).not.toContain('<br>');
  });

  // Внутри pipe-ячейки ничего не открывает блок, поэтому обратный слэш там был бы
  // виден читателю ни за что. `|` экранирует внешний getCellContent — один раз.
  it('подпись экранируется как ячейка, а не как строка документа', () => {
    const html =
      '<table><tr><td><table><caption># a | b</caption><tr><td>x</td></tr></table></td></tr></table>';
    const result = toMarkdown(html);
    expect(result).toContain('# a \\| b');
    expect(result).not.toContain('\\#');
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
  // The HTML form is opt-in now: by default a table GFM cannot express is
  // flattened into the pipe form. This block is about the HTML form itself, so
  // every case asks for it.
  const toHtmlTable = (html: string, options: Record<string, unknown> = {}) =>
    toMarkdown(html, { complexTableFallback: 'html', ...options });
  // The fallback emits table/tr/td/th/pre built here and nothing else. Filtering
  // the page's own markup was tried: everything not on the deny list survived.
  it('интерактивные и медийные элементы сводятся к тексту, как и вне таблиц', () => {
    const cases: Array<[string, string]> = [
      ['<form><input autofocus><button>go</button></form>', 'go'],
      ['<div style="position:fixed;inset:0">overlay</div>', 'overlay'],
    ];
    for (const [cell, expected] of cases) {
      const result = toHtmlTable(`<table><tr><td colspan="2">${cell}</td></tr></table>`);
      expect(result).toContain(`<td colspan="2">${expected}</td>`);
      expect(result).not.toContain('<form');
      expect(result).not.toContain('style=');
    }
  });

  it('<video autoplay> не переносится вовсе', () => {
    const html = '<table><tr><td colspan="2"><video autoplay src="https://example.com/x.mp4"></video></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).not.toContain('video');
    expect(result).not.toContain('autoplay');
    expect(result).toContain('<td colspan="2"></td>');
  });

  it('атрибуты страницы не переносятся, кроме colspan и rowspan', () => {
    const html =
      '<table><tr><td colspan="2" rowspan="3" title="t" class="c" id="i" onclick="steal()">x</td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('<td colspan="2" rowspan="3">x</td>');
    for (const attr of ['title', 'class', 'id', 'onclick']) expect(result).not.toContain(attr);
  });

  it('нечисловой, чрезмерный и единичный span опускаются', () => {
    const html =
      '<table><tr><td colspan="abc">a</td><td colspan="99999999">b</td><td colspan="1">c</td><td colspan="2">d</td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('<td>a</td><td>b</td><td>c</td><td colspan="2">d</td>');
  });

  it('th остаётся th', () => {
    const result = toHtmlTable('<table><tr><th colspan="2">H</th></tr><tr><td>a</td></tr></table>');
    expect(result).toContain('<th colspan="2">H</th>');
  });

  it('список в ячейке разделён, а не склеен в "ab"', () => {
    const html = '<table><tr><td colspan="2"><ul><li>a</li><li>b</li></ul></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('- a');
    expect(result).toContain('- b');
    expect(result).not.toContain('>ab<');
  });

  it('инлайн-разметка ячейки — элементы, а не markdown', () => {
    const html = '<table><tr><td colspan="2"><strong>t</strong> and <code>x|y</code></td></tr></table>';
    const result = toHtmlTable(html);
    // Markdown is not parsed inside an HTML block, so `**t**` reached the reader
    // as asterisks — the cell showed markup where the page showed bold text.
    expect(result).toContain('<strong>t</strong>');
    // A code span would need escaping to stay safe, and Markdown does not decode
    // entities inside one; as an element the text stays readable.
    expect(result).toContain('<code>x|y</code>');
  });

  it('ссылка в ячейке — элемент, чужая схема теряет ссылку, но не текст', () => {
    const safe = '<table><tr><td colspan="2"><a href="https://e.com">t</a></td></tr></table>';
    expect(toHtmlTable(safe)).toContain('<a href="https://e.com">t</a>');

    const unsafe = '<table><tr><td colspan="2"><a href="javascript:alert(1)">t</a></td></tr></table>';
    const result = toHtmlTable(unsafe);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('t');
  });

  it('<pre> сохраняется точно, включая пустые строки и табы', () => {
    const source = 'def f():\n\n\treturn 1\n';
    const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
    const result = toHtmlTable(html);
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(source);
    // A blank line would end the HTML block and give the rest to Markdown as prose.
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('& и < внутри <pre> экранируются', () => {
    const html = '<table><tr><td colspan="2"><pre>a & b < c</pre></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('a &amp; b &lt; c');
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe('a & b < c');
  });

  it('<pre> распознаётся на любой глубине, а не только прямым ребёнком', () => {
    // Wrapped in a <div> it used to go through the converter, and the blank line
    // inside the code became <br><br>.
    const source = 'a\n\nb';
    const html = `<table><tr><td colspan="2"><div><pre>${source}</pre></div></td></tr></table>`;
    const result = toHtmlTable(html);
    // Wrapped, it reaches the converter as a fence, so the newlines are encoded
    // rather than collapsed — the text comes back either way.
    expect(parseHTML(result).document.querySelector('td')?.textContent).toContain(source);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('экспоненциальная и шестнадцатеричная запись span не принимается', () => {
    // Number() reads "1e3" as 1000 and "0x2" as 2 — spans the page never wrote.
    const html =
      '<table><tr><td colspan="1e3">a</td><td colspan="0x2">b</td><td colspan="2.5">c</td><td colspan="-2">d</td><td colspan=" 3 ">e</td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('<td>a</td><td>b</td><td>c</td><td>d</td><td colspan="3">e</td>');
  });

  it('одиночный < в тексте не ломает структуру', () => {
    const html = '<table><tr><td colspan="2">5 &lt; 7</td></tr></table>';
    const reparsed = parseHTML(toHtmlTable(html)).document;
    expect(reparsed.querySelectorAll('td')).toHaveLength(1);
    expect(reparsed.querySelector('td')?.textContent).toBe('5 < 7');
  });

  it('вложенная таблица сериализуется тем же генератором', () => {
    const html = '<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result.match(/inner/g)).toHaveLength(1);
    expect(result).toContain('<td>inner</td>');
    expect(result).toContain('outer');
  });

  it('литеральные теги из текста страницы не закрывают наши элементы', () => {
    const html = '<table><tr><td colspan="2">&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;script&gt;alert(1)&lt;/script&gt;</td></tr></table>';
    const result = toHtmlTable(html);
    const reparsed = parseHTML(result).document;
    expect(reparsed.querySelectorAll('td')).toHaveLength(1);
    expect(reparsed.querySelectorAll('script')).toHaveLength(0);
    expect(result).toContain('&lt;script&gt;');
  });

  it('теги, которые выпускает сам конвертер, не экранируются', () => {
    const html = '<table><tr><td colspan="2">x<sub>1</sub><sup>2</sup><br>y</td></tr></table>';
    const result = toHtmlTable(html);
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
    const result = toHtmlTable(html);
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
    const reparsed = parseHTML(toHtmlTable(html)).document;
    expect(reparsed.querySelectorAll('td')).toHaveLength(2);
    expect(reparsed.querySelectorAll('script, img, [onerror]')).toHaveLength(0);
  });

  it('вложенная таблица через обёртку не экранируется дважды', () => {
    const html =
      '<table><tr><td colspan="2"><div><table><tr><td colspan="2">a &amp; b</td></tr></table></div></td></tr></table>';
    const reparsed = parseHTML(toHtmlTable(html)).document;
    expect(reparsed.querySelectorAll('table table td')[0]?.textContent).toBe('a & b');
  });

  it('прозаический </sub> внутри inline-кода не закрывает настоящий <sub>', () => {
    const html = '<table><tr><td colspan="2"><sub>real <code>&lt;/sub&gt;</code> tail</sub></td></tr></table>';
    const reparsed = parseHTML(toHtmlTable(html)).document;
    expect(reparsed.querySelectorAll('sub')).toHaveLength(1);
    expect(reparsed.querySelector('sub')?.textContent).toBe('real </sub> tail');
    expect(reparsed.querySelector('code')?.textContent).toBe('</sub>');
  });

  it('амперсанд и литеральная сущность проходят round-trip', () => {
    const html = '<table><tr><td colspan="2">a &amp; b, literal &amp;lt; stays</td></tr></table>';
    const reparsed = parseHTML(toHtmlTable(html)).document;
    expect(reparsed.querySelector('td')?.textContent).toBe('a & b, literal &lt; stays');
  });

  it('код с тройными бэктиками внутри проходит round-trip', () => {
    const code = 'a\n```\n\nb';
    const html = `<table><tr><td colspan="2"><div><pre><code>${code}</code></pre></div></td></tr></table>`;
    const result = toHtmlTable(html);
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(code);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('<pre> в обёртке остаётся <pre>, а не превращается в забор', () => {
    // As a fenced block inside a <td> the renderer collapses the whitespace, so
    // the element itself has to survive.
    const source = 'def f():\n\n\treturn 1';
    const html = `<table><tr><td colspan="2"><div><pre>${source}</pre></div></td></tr></table>`;
    const result = toHtmlTable(html);
    expect(result).toContain('<pre>');
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(source);
  });

  it('<br> ниже уровня ячейки не оставляет обратный слеш в fallback', () => {
    const result = toHtmlTable('<table><tr><td colspan="2"><span>a<br>b</span></td></tr></table>');
    expect(result).toContain('a<br>b');
    expect(result).not.toContain('\\');
  });

  it('обратный слеш внутри <pre> не трогается нормализацией переноса', () => {
    const source = 'a\\\nb';
    const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
    expect(parseHTML(toHtmlTable(html)).document.querySelector('pre')?.textContent).toBe(source);
  });

  it('нумерация ol start сохраняется при собственной сериализации списка', () => {
    const html =
      '<table><tr><td colspan="2"><ol start="5"><li>a<pre>x</pre></li><li>b</li></ol></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('5. a');
    expect(result).toContain('6. b');
  });

  it('чекбоксы task-list сохраняются при собственной сериализации списка', () => {
    const html =
      '<table><tr><td colspan="2"><ul><li><input type="checkbox" checked> done<pre>x</pre></li><li><input type="checkbox"> todo</li></ul></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('[x] done');
    expect(result).toContain('[ ] todo');
  });

  it('вложенный список сохраняет разделители и отступ', () => {
    // Serializing list structure by hand glued the markers together as "- a- b";
    // the content now goes through the converter whole, so this is its own
    // regression test for that approach.
    const html =
      '<table><tr><td colspan="2"><ul><li>a<ul><li>b<pre>c</pre></li></ul></li></ul></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('- a<br>  - b');
    expect(result).not.toContain('- a- b');
  });

  it('плейсхолдер, написанный самой страницей, не подменяется блоком', () => {
    const literal = '\uE000b\uE000';
    const html = `<table><tr><td colspan="2">before${literal}0${literal}after<pre>c</pre></td></tr></table>`;
    const reparsed = parseHTML(toHtmlTable(html)).document;
    expect(reparsed.querySelector('td')?.textContent).toContain(`before${literal}0${literal}after`);
    expect(reparsed.querySelector('pre')?.textContent).toBe('c');
  });

  it('минтинг плейсхолдера не зависит от Math.random', () => {
    const literal = '\uE000b\uE000';
    const real = Math.random;
    Math.random = () => 0;
    try {
      const html = `<table><tr><td colspan="2">x${literal}y<pre>c</pre></td></tr></table>`;
      const reparsed = parseHTML(toHtmlTable(html)).document;
      expect(reparsed.querySelector('td')?.textContent).toContain(`x${literal}y`);
    } finally {
      Math.random = real;
    }
  });

  it('обёртка сохраняет свой маркер списка вокруг <pre>', () => {
    const html = '<table><tr><td colspan="2"><ol><li>a<pre>x</pre></li><li>b</li></ol></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('1. a<pre>x</pre>');
    expect(result).toContain('2. b');
  });

  it('<pre> внутри обёртки уводит таблицу в fallback даже без colspan', () => {
    // The analysis used to look only at direct children, so this stayed a pipe
    // table and the blank line in the code became a <br>.
    const source = 'a\n\nb';
    const html = `<table><tr><td><div><pre>${source}</pre></div></td><td>x</td></tr><tr><td>y</td><td>z</td></tr></table>`;
    const result = toHtmlTable(html);
    expect(result).toContain('<table>');
    expect(parseHTML(result).document.querySelector('td')?.textContent).toContain(source);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('обёртка вокруг <pre> сохраняет свою разметку списка', () => {
    const html =
      '<table><tr><td colspan="2"><ul><li>one<pre>code</pre>tail</li><li>two</li></ul></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('- one');
    expect(result).toContain('- two');
    expect(parseHTML(result).document.querySelector('td')?.textContent).toContain('code');
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('блочный контент даёт разрыв, но не пустую строку', () => {
    const html = '<table><tr><td colspan="2"><p>one</p><p>two</p></td></tr></table>';
    const result = toHtmlTable(html);
    expect(result).toContain('one<br><br>two');
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });
});

describe('регрессии, найденные ревью', () => {
  it('в HTML-ячейке синтаксис markdown не экранируется', () => {
    // Markdown is not parsed inside an HTML block, so escaping there protects
    // nothing and the backslashes would be shown to the reader. The characters
    // render as themselves either way.
    const result = toMarkdown(
      '<table><tr><td colspan="2">use `foo` and snake_case</td></tr></table>', { complexTableFallback: 'html' },
    );
    expect(result).toContain('<td colspan="2">use `foo` and snake_case</td>');
  });

  it('<code> в ячейке кодирует переводы строк, как и <pre>', () => {
    const source = 'a\n\nb';
    const html = `<table><tr><td colspan="2"><code>${source}</code></td></tr></table>`;
    const result = toMarkdown(html, { complexTableFallback: 'html' });
    expect(result).not.toMatch(/\n[ \t]*\n/);
    expect(parseHTML(result).document.querySelector('code')?.textContent).toBe(source);
  });

  it('LaTeX в ячейке не экранируется', () => {
    const html =
      '<table><tr><td colspan="2"><span class="katex"><annotation encoding="application/x-tex">a & b, x < y</annotation></span></td></tr></table>';
    const result = toMarkdown(html, { math: true });
    expect(result).toContain('a & b, x < y');
    expect(result).not.toContain('&amp;');
  });

  it('rowspan="0", который сводится к отсутствию слияния, не уводит в HTML', () => {
    // The gate must ask what the serializer will answer, as with colspan="1".
    const html =
      '<table><thead><tr><th rowspan="0">m</th><th>h</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>';
    expect(toMarkdown(html)).not.toContain('<table>');
  });

  it('подпись сохраняется в режимах text и skip', () => {
    const html = '<table><caption>C</caption><tr><td colspan="2">x</td></tr></table>';
    expect(toMarkdown(html, { complexTableFallback: 'text' })).toContain('C');
    expect(toMarkdown(html, { complexTableFallback: 'skip' }).trim()).toBe('C');
  });

  it('обёрнутый <br> и <hr> не удаляются как пустые', () => {
    expect(toMarkdown('<p>line1<span><br></span>line2</p>')).toContain('line1');
    expect(toMarkdown('<p>line1<span><br></span>line2</p>')).not.toContain('line1line2');
    expect(toMarkdown('<div><hr></div><p>x</p>')).toContain('---');
  });
});

describe('пустая таблица', () => {
  it('таблица без строк → пустой вывод', () => {
    const html = `<table></table>`;
    const result = toMarkdown(html);
    expect(result.trim()).toBe('');
  });
});

// Found by review of the flattening. Each is a defect that only exists because
// the pipe form is now the default for shapes that used to become HTML.
describe('flattening: what review caught', () => {
  const cellOf = (md: string, row: number): string =>
    (md.trim().split('\n')[row] ?? '').split('|')[1]?.trim() ?? '';

  it('a code span outruns the backticks inside it', () => {
    // `` was chosen whenever the line merely contained a backtick, so ``a `` b``
    // closed early and everything after it — page text — was read as markup.
    const md = toMarkdown('<table><tr><td>h</td></tr><tr><td><pre>a `` b</pre></td></tr></table>');
    expect(md).toContain('``` a `` b ```');
  });

  it.each([
    ['preformatted', '<pre>a|b</pre>', '`a\\|b`'],
    ['nested table', '<table><tr><td>a|b</td></tr></table>', 'a\\|b'],
  ])('a pipe in a folded %s is escaped once, not twice', (_name, inner, expected) => {
    // `\\|` is a literal backslash followed by a column separator: the row split
    // and a cell was lost.
    const md = toMarkdown(`<table><tr><td>h</td></tr><tr><td>${inner}</td></tr></table>`);
    expect(md).toContain(expected);
    expect(md).not.toContain('\\\\|');
  });

  it('a pipe inside a formula is escaped, because the row comes first', () => {
    // Sparing `$…$` destroyed the row: GFM splits columns before anything looks
    // at maths, so `| $|x| < 2$ | ok |` reparsed as `$` and `x` and the
    // neighbouring cell was lost. A damaged formula is the smaller loss.
    const html =
      '<table><thead><tr><th>F</th><th>N</th></tr></thead><tbody><tr><td><span class="katex">' +
      '<annotation encoding="application/x-tex">|x| &lt; 2</annotation></span></td><td>ok</td></tr></tbody></table>';
    const md = toMarkdown(html, { math: true });
    const rows = md.trim().split('\n');
    // Two columns in every row is what was actually at stake.
    expect(rows[2]?.match(/(?<!\\)\|/g)).toHaveLength(3);
    expect(rows[2]).toContain('ok');
  });

  it('a rowspan stops at its row group', () => {
    // A browser does not let a <tbody> cell reach into <tfoot>; following it
    // there put the totals row one column right, under the wrong header.
    const html =
      '<table><thead><tr><th>H1</th><th>H2</th></tr></thead>' +
      '<tbody><tr><td rowspan="5">wide</td><td>a</td></tr></tbody>' +
      '<tfoot><tr><td>total</td></tr></tfoot></table>';
    expect(cellOf(toMarkdown(html), 3)).toBe('total');
  });

  it('a rowspan inside one group still vacates the position below it', () => {
    const html =
      '<table><thead><tr><th>H1</th><th>H2</th></tr></thead>' +
      '<tbody><tr><td rowspan="2">w</td><td>a</td></tr><tr><td>b</td></tr></tbody></table>';
    expect(cellOf(toMarkdown(html), 3)).toBe('');
  });
});

// The `text` fallback built its rows from cell.textContent, so it was the one
// path that emitted the page's characters without passing a rule that escapes:
// a cell showing `**bold**` came back as bold, and one showing an <img> tag came
// back as a working <img>. The mode still emits text and no markup — that is
// what it is for — but the text is now inert.
describe('режимы text и skip экранируют текст страницы', () => {
  const textMode = (html: string) => toMarkdown(html, { complexTableFallback: 'text' });
  const skipMode = (html: string) => toMarkdown(html, { complexTableFallback: 'skip' });

  it('тег и звёздочки со страницы не оживают', () => {
    const result = textMode(
      '<table><tr><td colspan="2">&lt;img src=x onerror=alert(1)&gt; and **bold**</td>' +
        '<td>next</td></tr></table>',
    );
    expect(result).toContain('\\<img src=x onerror=alert(1)>');
    expect(result).toContain('\\*\\*bold\\*\\*');
    // Every `<` that could open a tag carries its backslash.
    expect(result).not.toMatch(/(?<!\\)</);
  });

  it('экранирование не разрывает строку — строка остаётся одной', () => {
    const result = textMode(
      '<table><tr><td colspan="2"><pre>a\nb</pre></td><td>*x*</td></tr></table>',
    );
    expect(result.trim().split('\n')).toHaveLength(1);
    expect(result).toContain('a b | \\*x\\*');
  });

  it('блочное начало экранируется на строке, а не в каждой ячейке', () => {
    // A `#` in the second cell sits mid-sentence: a backslash there would be
    // one the reader pays for and nothing gained.
    const result = textMode(
      '<table><tr><td colspan="2"># heading</td><td># not a heading</td></tr></table>',
    );
    expect(result).toContain('\\# heading | # not a heading');
  });

  it('строка из одних дефисов не подчёркивает строку над собой', () => {
    const result = textMode(
      '<table><tr><td colspan="2">title</td></tr><tr><td>---</td></tr></table>',
    );
    expect(result).toContain('\\---');
  });

  it('разделитель колонок экранируется один раз, а не поверх экранирования', () => {
    // escapeCellText doubles the backslashes it finds, so escaping the pipe
    // first would give `\\|` — a literal backslash next to a live separator.
    const result = textMode('<table><tr><td colspan="2">a | b</td><td>c</td></tr></table>');
    expect(result).toContain('a \\| b | c');
    expect(result).not.toContain('\\\\|');
  });

  it('обратный слеш со страницы остаётся обратным слешем', () => {
    const result = textMode('<table><tr><td colspan="2">C:\\path</td><td>x</td></tr></table>');
    expect(result).toContain('C:\\\\path');
  });

  it('текст, которому экранирование не нужно, его не получает', () => {
    const result = textMode('<table><tr><td colspan="2">Total 2026</td><td>ok</td></tr></table>');
    expect(result.trim()).toBe('Total 2026 | ok');
  });

  it('подпись в режиме skip экранируется целиком', () => {
    const result = skipMode(
      '<table><caption># **C** &lt;b&gt;</caption><tr><td colspan="2">x</td></tr></table>',
    );
    expect(result.trim()).toBe('\\# \\*\\*C\\*\\* \\<b>');
  });

  it('подпись обычной таблицы тоже не открывает блок', () => {
    // captionLine feeds every path, not just the fallbacks: the caption is a
    // line of its own above the pipe table too.
    const result = toMarkdown(
      '<table><caption># Table 1</caption><tbody><tr><td>a</td></tr></tbody></table>',
    );
    expect(result.trim().startsWith('\\# Table 1')).toBe(true);
  });

  it('обычная подпись не обрастает обратными слешами', () => {
    const result = toMarkdown(
      '<table><caption>Sales 2026</caption><tbody><tr><td>a</td></tr></tbody></table>',
    );
    expect(result.trim().startsWith('Sales 2026')).toBe(true);
  });
});

// `textContent` читает <br> как ничто, и обе сложные формы таблицы читали <pre>
// именно так: `a<br>b` приезжало как `ab`. Страницы ломают строки в примерах кода
// через <br> постоянно — и всё, что вставляло HTML в пример, тоже, — так что
// читатель терял строки кода без единого следа.
describe('<br> в preformatted ячейке', () => {
  const table = (cell: string) =>
    `<table><tr><th colspan="2">Code</th></tr><tr><td>${cell}</td><td>next</td></tr></table>`;

  it('pipe-форма: каждая строка получает свой код-спан', () => {
    const result = toMarkdown(table('<pre>a<br>b</pre>'));
    expect(result).toContain('`a`<br>`b`');
    expect(result).not.toContain('`ab`');
  });

  it('HTML-форма: перенос кодируется, а не пропадает', () => {
    const result = toMarkdown(table('<pre>a<br>b</pre>'), { complexTableFallback: 'html' });
    expect(result).toContain('<pre>a&#10;b</pre>');
    // Пустая строка закрыла бы HTML-блок и отдала остаток таблицы Markdown.
    expect(result).not.toMatch(/\n[ \t]*\n/);
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe('a\nb');
  });

  it('<code> с переносами читается так же', () => {
    const result = toMarkdown(table('<code>a<br>b</code>'), { complexTableFallback: 'html' });
    expect(parseHTML(result).document.querySelector('code')?.textContent).toBe('a\nb');
  });

  it('DOM страницы возвращается неизменным', () => {
    // Читаем из копии: <br> заменяется на перевод строки, и делать это в
    // документе страницы значило бы править то, что нам дали посмотреть.
    const doc = parseHTML(table('<pre>a<br>b</pre>')).document;
    setDOMAdapter(() => doc);
    try {
      toMarkdown('', { complexTableFallback: 'html' });
      expect(doc.querySelectorAll('br')).toHaveLength(1);
    } finally {
      setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
    }
  });

  it('<pre> без <br> не меняется', () => {
    const result = toMarkdown(table('<pre>a\nb</pre>'), { complexTableFallback: 'html' });
    expect(result).toContain('<pre>a&#10;b</pre>');
  });
});

// В HTML-ячейке Markdown не разбирается, поэтому текст страницы экранируется
// заранее — но у поддерева формулы своя мера: `&` там разделитель матрицы, а не
// сущность. Мера была слишком узкой сразу с двух сторон.
describe('формула в HTML-ячейке', () => {
  const htmlTable = (cell: string, options = {}) =>
    toMarkdown(`<table><tr><td colspan="2">${cell}</td></tr><tr><td>x</td><td>y</td></tr></table>`, {
      math: true,
      complexTableFallback: 'html',
      ...options,
    });

  // MathJax v2 держит LaTeX в <script type="math/tex">, и isMathSubtree его не
  // знал: формулу экранировали как обычную прозу, и читатель видел `&amp;` там,
  // где страница показывала `&`.
  it('MathJax v2 не экранируется как проза', () => {
    // <script> — raw text: сущности внутри него не разбираются, страница пишет
    // символы формулы буквально.
    const result = htmlTable('<script type="math/tex">a & b_1</script>');
    expect(result).toContain('$a & b_1$');
    expect(result).not.toContain('&amp;');
  });

  it('MathJax v2 всё же не может закрыть ячейку', () => {
    const result = htmlTable('<script type="math/tex">a</td></tr></table><img src=q> b</script>');
    const doc = parseHTML(result).document;
    expect(doc.querySelectorAll('td')).toHaveLength(3);
    expect(doc.querySelectorAll('img')).toHaveLength(0);
  });

  // Сырой MathML — формула, записанная элементами: `<mo>&lt;</mo>` это оператор
  // «меньше». Поддерево не свернуть в одну строку — его читает правило, которое
  // превращает MathML в LaTeX, — поэтому каждый узел экранируется сам, а
  // висящий на конце `<` обезвреживается по подозрению: следующий узел допишут
  // к нему уже после проверки.
  it('MathML по узлам не собирается в тег', () => {
    const result = htmlTable(
      '<math><mo>&lt;</mo><mi>img src=x onerror=alert(1)&gt;</mi></math>',
      { math: false },
    );
    const doc = parseHTML(result).document;
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(doc.querySelectorAll('[onerror]')).toHaveLength(0);
    // Текст, который страница показывала, читатель всё равно получает.
    expect(result).toContain('img src=x onerror=alert(1)');
  });

  it('MathML в одном узле тоже обезврежен', () => {
    const result = htmlTable('<math><mo>&lt;img src=x onerror=alert(1)&gt;</mo></math>', {
      math: false,
    });
    expect(parseHTML(result).document.querySelectorAll('img, [onerror]')).toHaveLength(0);
  });

  it('оператор «меньше» остаётся «меньше»', () => {
    // Экранирование стоит формулы, поэтому `a < b`, записанное элементами,
    // должно дойти до читателя как `a < b`.
    const result = htmlTable('<math><mi>a</mi><mo>&lt;</mo><mi>b</mi></math>', { math: false });
    expect(parseHTML(result).document.querySelector('td')?.textContent).toBe('a<b');
  });
});

// getCellContent называл `pre` среди собственных детей ячейки, поэтому <div>
// вокруг блока прятал его — а <div> вокруг <pre> это обычная разметка страницы, а
// не решение о формате. Конвертер выдавал внутри pipe-ячейки настоящий
// огороженный блок, где ограда оградой не является: она перечитывается как
// код-спан с буквальным текстом `<br>a<br>b<br>`, и читатель терял и строки, и
// сам код.
describe('pre за обёрткой в ячейке', () => {
  const table = (cell: string) => `<table><tr><td>h</td></tr><tr><td>${cell}</td></tr></table>`;

  it.each([
    ['<div>', '<div><pre>a\nb</pre></div>'],
    ['<figure>', '<figure><pre>a\nb</pre></figure>'],
    ['две обёртки', '<div><div><pre>a\nb</pre></div></div>'],
  ])('%s сворачивается так же, как <pre> без обёртки', (_name, cell) => {
    expect(toMarkdown(table(cell))).toBe(toMarkdown(table('<pre>a\nb</pre>')));
  });

  it('в ячейку не попадает ограда', () => {
    const result = toMarkdown(table('<div><pre>a\nb</pre></div>'));
    expect(result).toContain('| `a`<br>`b` |');
    expect(result).not.toContain('```');
  });

  it('<br> внутри обёрнутого <pre> тоже даёт строки', () => {
    expect(toMarkdown(table('<div><pre>a<br>b</pre></div>'))).toContain('`a`<br>`b`');
  });

  it('текст рядом с обёрнутым блоком не теряется', () => {
    expect(toMarkdown(table('<div>before<pre>a\nb</pre>after</div>'))).toContain(
      'before`a`<br>`b`after',
    );
  });

  // Обёртка конвертируется целиком, а блок вынимается и возвращается на место:
  // её собственная разметка — маркер списка, выделение — доходит до читателя.
  it('маркер списка вокруг блока сохраняется', () => {
    expect(toMarkdown(table('<ul><li>x<pre>a\nb</pre></li></ul>'))).toContain('- x`a`<br>`b`');
  });

  it('несколько блоков в одной обёртке', () => {
    expect(toMarkdown(table('<div><pre>a</pre><pre>b</pre></div>'))).toBe(
      toMarkdown(table('<pre>a</pre><pre>b</pre>')),
    );
  });

  // Вложенная таблица сворачивает свои ячейки сама, и её <pre> проходит этот же
  // обход уже на своём уровне: вынуть его из обёртки значило бы свернуть его не
  // туда.
  it('<pre> внутри вложенной таблицы остаётся её делом', () => {
    const result = toMarkdown(table('<div><table><tr><td><pre>a\nb</pre></td></tr></table></div>'));
    expect(result).toBe(toMarkdown(table('<table><tr><td><pre>a\nb</pre></td></tr></table>')));
    expect(result).toContain('`a`<br>`b`');
  });

  it('ограда по-прежнему длиннее самой длинной серии бэктиков', () => {
    expect(toMarkdown(table('<div><pre>a `` b</pre></div>'))).toContain('``` a `` b ```');
  });

  it('pipe в обёрнутом блоке экранируется ровно один раз', () => {
    const result = toMarkdown(table('<div><pre>a | b</pre></div>'));
    expect(result).toContain('`a \\| b`');
    expect(result).not.toContain('\\\\|');
  });

  it('DOM страницы возвращается неизменным', () => {
    const doc = parseHTML(table('<div><pre>a<br>b</pre></div>')).document;
    setDOMAdapter(() => doc);
    try {
      toMarkdown('');
      expect(doc.querySelectorAll('br')).toHaveLength(1);
      expect(doc.querySelectorAll('pre')).toHaveLength(1);
    } finally {
      setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
    }
  });

  it('HTML-форма по-прежнему сохраняет обёрнутый <pre>', () => {
    const result = toMarkdown(table('<div><pre>a\nb</pre></div>'), {
      complexTableFallback: 'html',
    });
    expect(parseHTML(result).document.querySelector('td pre')?.textContent).toBe('a\nb');
  });
});

// Режим text читал cell.textContent, который видит <br> как ничто: `a<br>b`
// приезжало как `ab` — две строки, сваренные в слово, которого страница не
// показывала. Две другие формы таблицы это уже чинили, а этот вызов пропустили.
describe('режим text сохраняет строки pre', () => {
  const text = (html: string) => toMarkdown(html, { complexTableFallback: 'text' });

  it('<br> внутри <pre> становится пробелом, а не исчезает', () => {
    const result = text('<table><tr><td colspan="2"><pre>a<br>b</pre></td><td>n</td></tr></table>');
    expect(result).toContain('a b | n');
    expect(result).not.toContain('ab');
  });

  it('<br> прямо в ячейке читается так же', () => {
    expect(text('<table><tr><td colspan="2">a<br>b</td><td>n</td></tr></table>')).toContain(
      'a b | n',
    );
  });

  it('строка остаётся одной строкой документа', () => {
    const md = text('<table><tr><td colspan="2"><pre>a<br>b</pre></td><td>n</td></tr></table>');
    expect(md.trim().split('\n')).toHaveLength(1);
  });

  // Перенос здесь становится пробелом — режим пишет строку таблицы одной строкой
  // документа, и деться переносу больше некуда, — но пробел всё же помечает, где
  // он был.
  it('настоящий перевод строки в <pre> ведёт себя так же', () => {
    const withBr = text('<table><tr><td colspan="2"><pre>a<br>b</pre></td><td>n</td></tr></table>');
    const withNewline = text(
      '<table><tr><td colspan="2"><pre>a\nb</pre></td><td>n</td></tr></table>',
    );
    expect(withBr).toBe(withNewline);
  });

  it('DOM страницы возвращается неизменным', () => {
    const doc = parseHTML(
      '<table><tr><td colspan="2"><pre>a<br>b</pre></td><td>n</td></tr></table>',
    ).document;
    setDOMAdapter(() => doc);
    try {
      toMarkdown('', { complexTableFallback: 'text' });
      expect(doc.querySelectorAll('br')).toHaveLength(1);
    } finally {
      setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
    }
  });
});

// Свёртка выбрасывала пустые ячейки перед склейкой через ` · `, и это была
// единственная её потеря, о которой читатель не мог догадаться: строка `a`,
// пусто, `b` приезжала как `a · b` — ровно то, что даёт настоящая строка из двух
// ячеек. Внизу у ячейки нет заголовка, соседи — это всё, что говорит, где она
// стояла, поэтому закрытая дыра не укорачивает строку, а переставляет значения.
describe('пустые ячейки вложенной таблицы', () => {
  const outer = (inner: string) =>
    `<table><tr><td>${inner}</td></tr><tr><td>outer</td></tr></table>`;

  it('пустая ячейка в середине сохраняет позицию', () => {
    const result = toMarkdown(outer('<table><tr><td>a</td><td></td><td>b</td></tr></table>'));
    expect(result).toContain('| a ·  · b |');
  });

  it('строка из трёх ячеек не читается как строка из двух', () => {
    const three = toMarkdown(outer('<table><tr><td>a</td><td></td><td>b</td></tr></table>'));
    const two = toMarkdown(outer('<table><tr><td>a</td><td>b</td></tr></table>'));
    expect(three).not.toBe(two);
  });

  it('пустая ячейка в начале и в конце тоже сохраняется', () => {
    expect(
      toMarkdown(outer('<table><tr><td></td><td>x</td><td></td></tr></table>')),
    ).toContain('· x ·');
  });

  // Обещание свёртки — строки внутренней таблицы, по одной на строку; строка,
  // которую свёртка не выдаёт, это строка, которую читателю не пересчитать.
  it('целиком пустая строка остаётся строкой', () => {
    const result = toMarkdown(
      outer('<table><tr><td>a</td></tr><tr><td></td></tr><tr><td>b</td></tr></table>'),
    );
    expect(result).toContain('a<br><br>b');
  });

  it('пустая строка из одной ячейки не пропадает молча', () => {
    const withGap = toMarkdown(
      outer('<table><tr><td>a</td></tr><tr><td></td></tr><tr><td>b</td></tr></table>'),
    );
    const without = toMarkdown(outer('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>'));
    expect(withGap).not.toBe(without);
  });

  // Подпись — не строка: пустую показывать нечем, и всё, что она добавила бы, это
  // ведущий перенос.
  it('пустая подпись по-прежнему не добавляет строку', () => {
    expect(
      toMarkdown(outer('<table><caption> </caption><tr><td>x</td></tr></table>')),
    ).not.toContain('<br>');
  });

  it('пустые ячейки не приносят лишнего экранирования', () => {
    expect(toMarkdown(outer('<table><tr><td></td><td>x</td></tr></table>'))).not.toContain('\\');
  });
});

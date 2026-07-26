import { describe, it, expect, beforeAll } from 'vitest';
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

  it('вложенная таблица сохраняется целиком внутри ячейки', () => {
    const html = `<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<td><table><tr><td>inner</td></tr></table></td>');
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

describe('HTML fallback сохраняет разметку ячейки', () => {
  it('список в ячейке не схлопывается в текст', () => {
    const html = `
      <table>
        <thead><tr><th>Items</th></tr></thead>
        <tbody><tr><td><ul><li>a</li><li>b</li></ul></td></tr></tbody>
      </table>`;
    const result = toMarkdown(html);
    expect(result).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(result).not.toContain('>ab<');
  });

  // A blank line would end the HTML block and give the rest of the table to the
  // Markdown parser as text — but newlines inside <pre> and inside attribute
  // values are content, so they are encoded rather than dropped.
  it('пустая строка внутри <pre> сохраняется, а не удаляется', () => {
    const html = `<table><tr><td colspan="2"><pre>line 1\n\nline 3</pre></td></tr></table>`;
    const result = toMarkdown(html);
    const reparsed = parseHTML(result).document;
    expect(reparsed.querySelector('pre')?.textContent).toBe('line 1\n\nline 3');
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('отступы и пустые строки в <pre> проходят round-trip точно', () => {
    const source = 'def f():\n\n\treturn 1\n';
    const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelector('pre')?.textContent).toBe(source);
  });

  it('перевод строки в значении атрибута сохраняется', () => {
    const html = `<table><tr><td colspan="2" title="a\n\nb">x</td></tr></table>`;
    const result = toMarkdown(html);
    expect(parseHTML(result).document.querySelector('td')?.getAttribute('title')).toBe('a\n\nb');
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('форматирующие пустые строки вне <pre> схлопываются, структура цела', () => {
    const html = `<table><tr><td colspan="2">\n\n  <ul>\n\n    <li>a</li>\n\n  </ul>\n\n</td></tr></table>`;
    const result = toMarkdown(html);
    expect(result).not.toMatch(/\n[ \t]*\n/);
    expect(parseHTML(result).document.querySelectorAll('li')).toHaveLength(1);
  });

  it('служебный токен не протекает в вывод', () => {
    // Input free of private-use characters: any in the output would be a
    // placeholder that was never substituted back.
    const html = `<table><tr><td colspan="2"><pre>a\n\nb</pre></td></tr></table>`;
    expect(toMarkdown(html)).not.toMatch(/[\uE000-\uF8FF]/);
  });

  // The page can write the placeholder itself: a fixed token sits in the bundle
  // for anyone to copy, and the final substitution cannot tell the page's copy
  // from ours. The token is therefore minted per cell against its own markup.
  it('литеральный токен со страницы не превращается в перевод строки', () => {
    const literal = '\uE000nl\uE000';
    const html = `<table><tr><td colspan="2"><pre>before${literal}after</pre></td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelector('pre')?.textContent).toBe(`before${literal}after`);
  });

  it('литеральный токен рядом с настоящими переводами строк', () => {
    const literal = '\uE000nl\uE000';
    const source = `a\n\nb${literal}c`;
    const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
    const result = toMarkdown(html);
    expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(source);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  it('литеральный токен в значении атрибута вместе с переводом строки', () => {
    const literal = '\uE000nl\uE000';
    const value = `x${literal}y\n\nz`;
    const html = `<table><tr><td colspan="2" title="${value}">t</td></tr></table>`;
    const result = toMarkdown(html);
    expect(parseHTML(result).document.querySelector('td')?.getAttribute('title')).toBe(value);
    expect(result).not.toMatch(/\n[ \t]*\n/);
  });

  // The mint loop must not depend on the calling realm's RNG: a stub returning 0
  // once produced the same candidate forever. Both cases below run with Math.random
  // pinned to 0 and would hang, not fail, on a regression.
  it('минтинг токена не зависит от Math.random', () => {
    const literal = '\uE000nl\uE000';
    const source = `before${literal}after`;
    const real = Math.random;
    Math.random = () => 0;
    try {
      const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
      const reparsed = parseHTML(toMarkdown(html)).document;
      expect(reparsed.querySelector('pre')?.textContent).toBe(source);
    } finally {
      Math.random = real;
    }
  });

  it('занятые базовый и удлинённый кандидаты обходятся', () => {
    const base = '\uE000nl\uE000';
    const padded = '\uE000nl\uE001\uE000';
    const source = `a${base}b${padded}c\n\nd`;
    const real = Math.random;
    Math.random = () => 0;
    try {
      const html = `<table><tr><td colspan="2"><pre>${source}</pre></td></tr></table>`;
      const result = toMarkdown(html);
      expect(parseHTML(result).document.querySelector('pre')?.textContent).toBe(source);
      expect(result).not.toMatch(/\n[ \t]*\n/);
    } finally {
      Math.random = real;
    }
  });

  it('кавычка в значении атрибута не разрывает сериализацию', () => {
    // The page writes &quot;, the parser hands back a literal quote: hand-built
    // `name="value"` would let it close the attribute and inject live markup.
    const html = `<table><tr><td colspan="2" title="&quot;><img src=x onerror=alert(1)>">safe</td></tr></table>`;
    const result = toMarkdown(html);
    const reparsed = parseHTML(result).document;
    expect(reparsed.querySelectorAll('img')).toHaveLength(0);
    expect(reparsed.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(result).toContain('&quot;');
    expect(result).toContain('safe');
  });

  it('скрипт в значении атрибута тоже не оживает', () => {
    const html = `<table><tr><td colspan="2" title="&quot;><script>alert(1)</script>">safe</td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html)).document;
    expect(reparsed.querySelectorAll('script')).toHaveLength(0);
  });

  it('скрипты и обработчики событий не переносятся', () => {
    const html = `
      <table>
        <tr><td onclick="steal()" colspan="2"><script>steal()</script><ul><li>a</li></ul></td></tr>
      </table>`;
    const result = toMarkdown(html);
    expect(result).not.toContain('script');
    expect(result).not.toContain('onclick');
    expect(result).toContain('colspan="2"');
    expect(result).toContain('<li>a</li>');
  });
});

describe('пустая таблица', () => {
  it('таблица без строк → пустой вывод', () => {
    const html = `<table></table>`;
    const result = toMarkdown(html);
    expect(result.trim()).toBe('');
  });
});

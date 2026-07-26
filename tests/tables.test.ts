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

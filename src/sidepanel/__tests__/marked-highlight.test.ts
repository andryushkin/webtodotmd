import { describe, it, expect, beforeAll } from 'bun:test';
import { marked } from '../../../vendor/marked.esm.js';
import { markedHighlight } from '../marked-highlight';

beforeAll(() => {
  marked.setOptions({ breaks: true, gfm: true, html: true });
  marked.use({ extensions: [markedHighlight] });
});

const render = (md: string) => marked.parseInline(md) as string;

// Ядро пишет `==highlight==`, потому что его понимает то, куда файл попадает.
// Панель рисует тем же `marked`, который его не знает, — и читателю показывались
// четыре `=`, только что положенные в его же файл: это читается как дефект
// захвата, а не как нехватка в предпросмотре.
describe('==highlight== в предпросмотре', () => {
  it('становится <mark>', () => {
    expect(render('A ==marked phrase== here.')).toBe('A <mark>marked phrase</mark> here.');
  });

  it('содержимое остаётся разметкой', () => {
    expect(render('==a **b** [c](https://e.com)==')).toContain('<strong>b</strong>');
  });

  // Ровно то, ради чего ядро экранирует литеральные сравнения: разобранная пара
  // рисуется символами и ничего не подсвечивает.
  it('экранированные сравнения ничего не подсвечивают', () => {
    expect(render('x\\=\\=y and C\\=\\=C++')).toBe('x==y and C==C++');
  });

  it.each([
    ['непарный', 'unpaired == in a sentence.'],
    ['пустой', 'nothing between ==== them.'],
    ['пробел за открывающим', 'a == b == c'],
  ])('не подсвечивает: %s', (_name, md) => {
    expect(render(md)).not.toContain('<mark>');
  });
});

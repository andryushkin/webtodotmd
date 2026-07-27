import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('paragraphs', () => {
  it('single paragraph', () => {
    expect(toMarkdown('<p>Text</p>')).toBe('Text\n');
  });

  it('two paragraphs separated by blank line', () => {
    expect(toMarkdown('<p>First</p><p>Second</p>')).toBe('First\n\nSecond\n');
  });

  it('empty paragraph is skipped', () => {
    expect(toMarkdown('<p></p><p>Text</p>')).toBe('Text\n');
  });

  it('br inside paragraph produces backslash line break', () => {
    expect(toMarkdown('<p>Line 1<br/>Line 2</p>')).toBe('Line 1\\\nLine 2\n');
  });
});

describe('hr', () => {
  it('horizontal rule', () => {
    expect(toMarkdown('<hr/>')).toBe('---\n');
  });
});

describe('div', () => {
  it('two divs separated by blank line', () => {
    expect(toMarkdown('<div>Text1</div><div>Text2</div>')).toBe('Text1\n\nText2\n');
  });

  it('empty div is skipped', () => {
    expect(toMarkdown('<div></div><div>Content</div>')).toBe('Content\n');
  });
});
// A `<br>` with nothing left to break: one a block ends on, or one a page puts
// between two blocks to draw vertical space without a paragraph. Hacker News
// does both, and a captured discussion page carried 133 lines holding a lone
// backslash.
describe('перенос, которому нечего переносить', () => {
  it('в конце блока не пишется', () => {
    expect(toMarkdown('<p>text<br></p><p>next</p>')).toBe('text\n\nnext\n');
  });

  it('между блоками не пишется', () => {
    expect(toMarkdown('<div>a</div><br><div>b</div>')).toBe('a\n\nb\n');
  });

  it('внутри абзаца остаётся', () => {
    expect(toMarkdown('<p>a<br>b</p>')).toBe('a\\\nb\n');
  });

  it('два подряд внутри абзаца остаются оба', () => {
    expect(toMarkdown('<p>a<br><br>b</p>')).toBe('a\\\n\\\nb\n');
  });
});

// The containers a page draws a line of its own for and Markdown has no other
// spelling of. Each had no rule, so the default one handed its children back
// unchanged and every boundary the reader saw went: a `<figure>` welded its
// picture to its caption, a `<summary>` to the body it opens, and five sectioning
// elements in a row arrived as `SectionArticleFormLegendField`.
describe('semantic containers keep the line they drew', () => {
  it.each([
    [
      'figure and its caption',
      '<figure><img src="d.png" alt="Diagram"><figcaption>Services and flow.</figcaption></figure>',
      '![Diagram](d.png)\n\nServices and flow.\n',
    ],
    [
      'summary and the body it opens',
      '<details open><summary>Deployment notes</summary>Restart the worker.</details>',
      'Deployment notes\n\nRestart the worker.\n',
    ],
    ['two addresses', '<address>One</address><address>Two</address>', 'One\n\nTwo\n'],
    [
      'the sectioning elements',
      '<section>Section</section><article>Article</article><main>Main</main>',
      'Section\n\nArticle\n\nMain\n',
    ],
    [
      'a form, a legend and its field',
      '<form>Form</form><fieldset><legend>Legend</legend>Field</fieldset>',
      'Form\n\nLegend\n\nField\n',
    ],
    ['a group of headings', '<hgroup>Title</hgroup><p>after</p>', 'Title\n\nafter\n'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  it('an empty one writes nothing at all', () => {
    expect(toMarkdown('<p>a</p><section>  </section><p>b</p>')).toBe('a\n\nb\n');
  });

  // The escaper reads the same boundary, which is the half that had drifted: it
  // already counted a `<figure>` as the end of a line while nothing wrote one.
  it('a marker at the head of one is escaped', () => {
    expect(toMarkdown('<div>x<section># y</section></div>')).toContain('\\# y');
  });

  // A `display` the page states still decides, both ways round, exactly as it
  // does for a `<div>`: the whole output of these is their content.
  it('a stated inline display takes the block back', () => {
    // A `<div>` around it, not a `<p>`: an HTML parser closes a paragraph before
    // a `<section>`, so the shape being tested would never reach the converter.
    expect(toMarkdown('<div>a <section style="display:inline">b</section> c</div>'))
      .toBe('a b c\n');
  });
});

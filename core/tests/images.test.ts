import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('базовые', () => {
  it('src + alt', () => {
    expect(toMarkdown('<img src="photo.jpg" alt="Закат над морем" />')).toBe(
      '![Закат над морем](photo.jpg)\n',
    );
  });

  it('без alt', () => {
    expect(toMarkdown('<img src="icon.png" />')).toBe('![](icon.png)\n');
  });

  it('с title', () => {
    expect(toMarkdown('<img src="photo.jpg" alt="Закат над морем" title="Фото заката" />')).toBe(
      "![Закат над морем](photo.jpg 'Фото заката')\n",
    );
  });

  it('нет src и нет data-src — вернуть alt', () => {
    expect(toMarkdown('<img alt="описание" />')).toBe('описание\n');
  });

  it('нет ничего — пустая строка', () => {
    expect(toMarkdown('<img />')).toBe('\n');
  });
});

describe('lazy-load', () => {
  it('data-src предпочтительнее src-placeholder', () => {
    expect(
      toMarkdown(
        '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="https://cdn.example.com/real-image.jpg" alt="Реальная картинка" />',
      ),
    ).toBe('![Реальная картинка](https://cdn.example.com/real-image.jpg)\n');
  });

  it('data-original', () => {
    expect(
      toMarkdown(
        '<img src="placeholder.gif" data-original="https://example.com/img.jpg" alt="Img" />',
      ),
    ).toBe('![Img](https://example.com/img.jpg)\n');
  });

  it('data-lazy-src', () => {
    expect(
      toMarkdown('<img src="1x1.gif" data-lazy-src="https://example.com/lazy.jpg" alt="Lazy" />'),
    ).toBe('![Lazy](https://example.com/lazy.jpg)\n');
  });

  it('data-src предпочтительнее data-original (порядок приоритета)', () => {
    expect(
      toMarkdown(
        '<img data-src="https://example.com/first.jpg" data-original="https://example.com/second.jpg" alt="Test" />',
      ),
    ).toBe('![Test](https://example.com/first.jpg)\n');
  });
});

describe('placeholder', () => {
  it('base64 data:image — считается placeholder', () => {
    expect(
      toMarkdown(
        '<img src="data:image/gif;base64,R0lGODlh" data-src="https://real.com/img.jpg" />',
      ),
    ).toBe('![](https://real.com/img.jpg)\n');
  });

  it('URL со словом placeholder', () => {
    expect(
      toMarkdown(
        '<img src="https://via.example.com/placeholder.png" data-src="https://real.com/img.jpg" />',
      ),
    ).toBe('![](https://real.com/img.jpg)\n');
  });

  it('URL со словом spacer', () => {
    expect(toMarkdown('<img src="/images/spacer.gif" data-src="https://real.com/img.jpg" />')).toBe(
      '![](https://real.com/img.jpg)\n',
    );
  });

  it('URL 1x1', () => {
    expect(toMarkdown('<img src="/1x1.gif" data-src="https://real.com/img.jpg" />')).toBe(
      '![](https://real.com/img.jpg)\n',
    );
  });
});

describe('srcset', () => {
  it('выбирает максимальный w-дескриптор', () => {
    expect(
      toMarkdown(
        '<img srcset="photo-400.jpg 400w, photo-800.jpg 800w, photo-1200.jpg 1200w" alt="Фото" />',
      ),
    ).toBe('![Фото](photo-1200.jpg)\n');
  });

  it('выбирает максимальный x-дескриптор', () => {
    expect(
      toMarkdown('<img srcset="photo-1x.jpg 1x, photo-2x.jpg 2x, photo-3x.jpg 3x" alt="Retina" />'),
    ).toBe('![Retina](photo-3x.jpg)\n');
  });

  it('data-srcset', () => {
    expect(
      toMarkdown('<img data-srcset="photo-400.jpg 400w, photo-800.jpg 800w" alt="Lazy srcset" />'),
    ).toBe('![Lazy srcset](photo-800.jpg)\n');
  });

  it('srcset без дескриптора — единственный кандидат', () => {
    expect(toMarkdown('<img srcset="photo.jpg" alt="Only" />')).toBe('![Only](photo.jpg)\n');
  });
});

describe('noscript fallback', () => {
  it('placeholder src + <noscript> с реальным src', () => {
    expect(
      toMarkdown(
        '<img src="data:image/gif;base64,R0lGODlh" alt="Картинка" /><noscript><img src="https://real.com/photo.jpg" /></noscript>',
      ),
    ).toBe('![Картинка](https://real.com/photo.jpg)\n');
  });

  it('нет noscript — возвращает placeholder как есть', () => {
    expect(toMarkdown('<img src="data:image/gif;base64,R0lGODlh" alt="Img" />')).toBe(
      '![Img](data:image/gif;base64,R0lGODlh)\n',
    );
  });
});

describe('<picture>', () => {
  it('<source> игнорируется, используется <img>', () => {
    expect(
      toMarkdown(`<picture>
  <source srcset="photo.webp" type="image/webp" />
  <source srcset="photo.jpg" type="image/jpeg" />
  <img src="photo.jpg" alt="Фото" />
</picture>`),
    ).toBe('![Фото](photo.jpg)\n');
  });
});

describe('baseUrl резолвинг', () => {
  it('относительный src резолвится через baseUrl', () => {
    expect(
      toMarkdown('<img src="../images/photo.jpg" alt="Фото" />', {
        baseUrl: 'https://example.com/blog/post.html',
      }),
    ).toBe('![Фото](https://example.com/images/photo.jpg)\n');
  });

  it('абсолютный src не изменяется при baseUrl', () => {
    expect(
      toMarkdown('<img src="https://cdn.example.com/photo.jpg" alt="CDN" />', {
        baseUrl: 'https://example.com/blog/',
      }),
    ).toBe('![CDN](https://cdn.example.com/photo.jpg)\n');
  });

  it('без baseUrl относительный src остаётся как есть', () => {
    expect(toMarkdown('<img src="images/photo.jpg" alt="Rel" />')).toBe(
      '![Rel](images/photo.jpg)\n',
    );
  });
});

describe('image-as-link', () => {
  it('<a><img></a> → вложенный синтаксис', () => {
    expect(toMarkdown('<a href="https://example.com"><img src="logo.png" alt="Logo" /></a>')).toBe(
      '[![Logo](logo.png)](https://example.com)\n',
    );
  });
});

// The base is not an address for an image that has none of its own. Resolving
// `''` against a base answers with the base, so with `baseUrl: document.baseURI`
// — which is what the extension always passes — every src-less `<img>` in a
// capture used to become a broken image pointing at the article being read.
describe('image without a url: falls back to alt whatever the base says', () => {
  const PAGE = { baseUrl: 'https://example.com/blog/post.html' };

  it('no src at all, with a baseUrl set', () => {
    expect(toMarkdown('<p><img alt="Fallback alt" /></p>', PAGE)).toBe('Fallback alt\n');
  });

  it('empty src, with a baseUrl set', () => {
    expect(toMarkdown('<p><img src="" alt="Fallback alt" /></p>', PAGE)).toBe('Fallback alt\n');
  });

  // Whitespace is not an address: a browser strips it before parsing the URL,
  // and without the base it went into the file as the escape `%20`.
  it('whitespace-only src, with and without a baseUrl', () => {
    expect(toMarkdown('<p><img src=" " alt="Fallback alt" /></p>', PAGE)).toBe('Fallback alt\n');
    expect(toMarkdown('<p><img src=" " alt="Fallback alt" /></p>')).toBe('Fallback alt\n');
  });

  it('empty srcset with no other candidate, with a baseUrl set', () => {
    expect(toMarkdown('<p><img srcset="" alt="Fallback alt" /></p>', PAGE)).toBe('Fallback alt\n');
  });

  it('a whitespace-only lazy attribute does not shadow the real src', () => {
    expect(toMarkdown('<p><img data-src=" " src="photo.jpg" alt="Photo" /></p>', PAGE)).toBe(
      '![Photo](https://example.com/blog/photo.jpg)\n',
    );
  });

  it('no src and no alt is nothing at all, with a baseUrl set', () => {
    expect(toMarkdown('<p><img /></p>', PAGE)).toBe('\n');
  });

  // The alt lands in the document as prose, so it takes the escaping prose takes
  // — an unescaped `#` at the front invents a heading the page never had.
  it('the alt is still escaped on this path', () => {
    expect(toMarkdown('<p><img alt="*not italic*" /></p>', PAGE)).toBe('\\*not italic\\*\n');
    expect(toMarkdown('<p><img alt="# not a heading" /></p>', PAGE)).toBe('\\# not a heading\n');
    expect(toMarkdown('<p><img src="" alt="`not code`" /></p>', PAGE)).toBe('\\`not code\\`\n');
    // A `[` the page's own text can close: the lookahead sees the `](url)` after
    // the image and the alt would otherwise open a working link.
    expect(toMarkdown('<p><img alt="see [" /> ](https://example.com)</p>', PAGE)).toBe(
      'see \\[ ](https://example.com)\n',
    );
  });

  // Not the same case, and not a defect. An empty `href` addresses the current
  // document in a browser, so the page's own URL is the target the reader
  // clicked — the link must keep resolving, and only the image must refuse.
  it('an empty href still resolves to the page, which is where it pointed', () => {
    expect(toMarkdown('<p><a href="">text</a></p>', PAGE)).toBe(
      '[text](https://example.com/blog/post.html)\n',
    );
    expect(toMarkdown('<p><a href=" ">text</a></p>', PAGE)).toBe(
      '[text](https://example.com/blog/post.html)\n',
    );
    expect(toMarkdown('<p><a href="">text</a></p>')).toBe('[text]()\n');
  });
});

// `alt=""` is not a missing alt: HTML defines the empty one as "this image is
// not part of the content", and that is how every icon beside a label is
// written. Google's AI answers put a 2.5 KB base64 favicon inside a sentence
// and a dozen 1×1 gifs after it, all of them declared decorative.
describe('an image the markup calls decorative', () => {
  const icon = 'data:image/png;base64,iVBORw0KGgo=';

  it('goes when something else on the line survives', () => {
    expect(toMarkdown(`<p>text. <img alt="" src="${icon}"> Smashing Magazine</p>`)).not.toContain(
      'base64',
    );
  });

  it('goes from a link that keeps its label', () => {
    const html = `<p><a href="https://example.com"><img alt="" src="${icon}"><span>CommonMark</span></a></p>`;
    expect(toMarkdown(html)).toBe('[CommonMark](https://example.com)\n');
  });

  it('stays when it is all there was, or the block would come back empty', () => {
    expect(toMarkdown(`<p><img alt="" src="${icon}"></p>`)).toBe(`![](${icon})\n`);
    expect(toMarkdown(`<a href="https://example.com"><img alt="" src="${icon}"></a>`)).toContain(
      'base64',
    );
  });

  it('a missing alt says nothing of the kind and is kept', () => {
    expect(toMarkdown('<p>text <img src="https://example.com/photo.jpg"></p>')).toBe(
      'text ![](https://example.com/photo.jpg)\n',
    );
  });
});

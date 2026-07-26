import { describe, it, expect, beforeAll } from 'vitest';
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

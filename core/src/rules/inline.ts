import type { Rule, MarkItDownOptions } from '../types.js';
import {
  charAfter,
  charBefore,
  extractFlankingWhitespace,
  markerWorks,
} from '../utils/flanking.js';

/**
 * Emphasis, in the first form that will actually render.
 *
 * The preferred marker is kept wherever it works, so ordinary pages produce the
 * source they always did. Where CommonMark's flanking rules would leave the
 * delimiters as text — content starting or ending in punctuation, a wrapper
 * pressed against a word — the alternative marker is tried, and failing that an
 * HTML tag, which has no flanking rules at all. Dropping to a tag is rare and
 * still Markdown; emitting delimiters that do nothing is a silent loss of
 * formatting plus stray characters the reader never saw.
 */
function emphasis(el: Element, content: string, markers: string[], tag: string): string {
  const { leading, trimmed, trailing } = extractFlankingWhitespace(content);
  if (!trimmed) return content;

  // Whitespace pulled outside the delimiters is what the marker sits against.
  const before = leading ? ' ' : charBefore(el);
  const after = trailing ? ' ' : charAfter(el);

  for (const marker of markers) {
    if (markerWorks(marker, trimmed, before, after)) {
      return `${leading}${marker}${trimmed}${marker}${trailing}`;
    }
  }
  return `${leading}<${tag}>${trimmed}</${tag}>${trailing}`;
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl || url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function isPlaceholder(src: string): boolean {
  return (
    src.startsWith('data:image/') ||
    /placeholder|spacer|1x1|blank|loading/i.test(src) ||
    (src.length < 50 && src.startsWith('data:'))
  );
}

function parseSrcset(srcset: string): string {
  const candidates = srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let bestUrl = '';
  let bestValue = -1;
  for (const candidate of candidates) {
    const parts = candidate.split(/\s+/);
    const url = parts[0] ?? '';
    const descriptor = parts[1] ?? '';
    const value = descriptor ? parseFloat(descriptor) : 1;
    if (value > bestValue) {
      bestValue = value;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function extractImageUrl(img: Element): string {
  // 1. data-src варианты (lazy-load)
  const lazySrc =
    img.getAttribute('data-src') ||
    img.getAttribute('data-original') ||
    img.getAttribute('data-lazy-src') ||
    img.getAttribute('data-full-src') ||
    img.getAttribute('data-hi-res-src');
  if (lazySrc) return lazySrc;

  // 2. srcset — выбрать максимальное разрешение
  const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
  if (srcset) {
    const best = parseSrcset(srcset);
    if (best) return best;
  }

  // 3. src — проверить что не placeholder
  const src = img.getAttribute('src') || '';
  if (src && !isPlaceholder(src)) return src;

  // 4. noscript fallback — src из соседнего <noscript> (сохранён санитайзером в data-noscript-src)
  const noscriptSrc = img.getAttribute('data-noscript-src');
  if (noscriptSrc) return noscriptSrc;

  return src;
}

export const INLINE_RULES: Rule[] = [
  {
    name: 'bold',
    filter: ['strong', 'b'],
    replacement: (el, childContent) => emphasis(el, childContent, ['**', '__'], 'strong'),
  },
  {
    name: 'italic',
    filter: ['em', 'i'],
    replacement: (el, childContent) => emphasis(el, childContent, ['_', '*'], 'em'),
  },
  {
    name: 'strikethrough',
    filter: ['del', 's'],
    replacement: (el, childContent) => emphasis(el, childContent, ['~~'], 'del'),
  },
  {
    name: 'subscript',
    filter: 'sub',
    replacement: (_el, childContent) => `<sub>${childContent}</sub>`,
  },
  {
    name: 'superscript',
    filter: 'sup',
    replacement: (_el, childContent) => `<sup>${childContent}</sup>`,
  },
  {
    name: 'inline-code',
    filter: (el) =>
      el.tagName.toLowerCase() === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre',
    replacement: (_el, childContent) => {
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      // Если внутри есть бэктики — использовать двойные + пробелы §6.6
      const hasBacktick = trimmed.includes('`');
      const delim = hasBacktick ? '``' : '`';
      const inner = hasBacktick ? ` ${trimmed} ` : trimmed;
      return `${leading}${delim}${inner}${delim}${trailing}`;
    },
  },
  {
    name: 'link',
    filter: (el) => el.tagName.toLowerCase() === 'a' && el.hasAttribute('href'),
    replacement: (el, childContent, options: MarkItDownOptions) => {
      const href = resolveUrl(el.getAttribute('href') ?? '', options.baseUrl);
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      return `${leading}[${trimmed}](${href})${trailing}`;
    },
  },
  {
    name: 'source',
    filter: 'source',
    replacement: () => '',
  },
  {
    name: 'picture',
    filter: 'picture',
    replacement: (_el, childContent) => childContent.trim(),
  },
  {
    name: 'image',
    filter: 'img',
    replacement: (el, _childContent, options: MarkItDownOptions) => {
      const src = resolveUrl(extractImageUrl(el), options.baseUrl);
      const alt = (el.getAttribute('alt') ?? '').replace(/[\n\r]+/g, ' ').trim();
      if (!src) return alt || '';
      const title = el.getAttribute('title');
      const urlPart = title ? `${src} '${title}'` : src;
      return `![${alt}](${urlPart})`;
    },
  },
];

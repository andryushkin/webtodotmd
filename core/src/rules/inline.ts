import type { Rule, MarkItDownOptions } from '../types.js';
import {
  charAfter,
  charBefore,
  extractFlankingWhitespace,
  markerWorks,
} from '../utils/flanking.js';
import { isHtmlContext } from '../core/parser.js';

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
function emphasis(
  el: Element,
  content: string,
  markers: string[],
  tag: string,
  options: MarkItDownOptions,
): string {
  const { leading, trimmed, trailing } = extractFlankingWhitespace(content);
  if (!trimmed) return content;

  // Inside an HTML block no delimiter would ever be parsed, so there is nothing
  // to choose between: the tag is the only spelling that renders.
  if (!isHtmlContext(options)) {
    // Whitespace pulled outside the delimiters is what the marker sits against.
    const before = leading ? ' ' : charBefore(el);
    const after = trailing ? ' ' : charAfter(el);

    for (const marker of markers) {
      if (markerWorks(marker, trimmed, before, after)) {
        return `${leading}${marker}${trimmed}${marker}${trailing}`;
      }
    }
  }
  return `${leading}<${tag}>${trimmed}</${tag}>${trailing}`;
}

// Only schemes that are safe to write into an href the preview will render. The
// side panel runs DOMPurify too, but this library is published on its own, and a
// converter that can emit `javascript:` from page input is a converter that must
// not be trusted alone.
const SAFE_SCHEME = /^(?:https?:|mailto:|[#/.]|[^:]*$)/i;

function htmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    replacement: (el, childContent, options) => emphasis(el, childContent, ['**', '__'], 'strong', options),
  },
  {
    name: 'italic',
    filter: ['em', 'i'],
    replacement: (el, childContent, options) => emphasis(el, childContent, ['_', '*'], 'em', options),
  },
  {
    name: 'strikethrough',
    filter: ['del', 's'],
    replacement: (el, childContent, options) => emphasis(el, childContent, ['~~'], 'del', options),
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
    // `kbd` and `samp` belong here too. They are in the parser's literal set, so
    // their text is never escaped — but nothing wrapped it either, and it went
    // into the file raw: a page documenting `<div onclick=…>` inside <samp> put
    // working markup in the output. A code span is both the right rendering and
    // the thing that makes the text inert.
    filter: (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'kbd' || tag === 'samp') return true;
      return tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre';
    },
    replacement: (_el, childContent, options) => {
      const { leading, trimmed, trailing } = extractFlankingWhitespace(childContent);
      if (!trimmed) return childContent;
      if (isHtmlContext(options)) return `${leading}<code>${trimmed}</code>${trailing}`;
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
      if (isHtmlContext(options)) {
        // An unusable scheme costs the link, not the text it was wrapping.
        if (!SAFE_SCHEME.test(href)) return `${leading}${trimmed}${trailing}`;
        return `${leading}<a href="${htmlAttr(href)}">${trimmed}</a>${trailing}`;
      }
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
      // Inside an HTML block `![alt](src)` would not render, but emitting an
      // <img> would mean allowing `src` and `alt` through the preview's
      // allow-list — a real widening of what counts as the core's own markup,
      // for a case that is rare and already showed nothing. The alt text is what
      // a reader would have got from a broken image anyway.
      if (isHtmlContext(options)) return alt || '';
      const title = el.getAttribute('title');
      const urlPart = title ? `${src} '${title}'` : src;
      return `![${alt}](${urlPart})`;
    },
  },
];
